-- «Берем в работу» завершает задание и меняет стадию при automation.inside_complete=1.
-- В automation_spawn_on_record_change и automation_ensure_before_enter_prep
-- переменная tmpl (automation_task_templates%rowtype) совпадала с алиасом
-- join automation_task_templates tmpl, и Postgres поднимал
-- column reference "tmpl.id" is ambiguous. Алиас переименован в tpl.

-- Fix: outcome «На пересчёт» / stage return via complete_automation_task was
-- skipping automation_supersede_stage_tasks (inside_complete=1). Destination
-- templates stayed blocked by old completed rows → no re-spawn, process looks
-- stopped.
--
-- Keep the beforeEnter first-land safety (no prior onEnter → no supersede),
-- but supersede on true re-entry during complete — same idea as
-- automation_ensure_before_enter_prep.

create or replace function public.automation_spawn_on_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_values jsonb := '{}'::jsonb;
  new_values jsonb := '{}'::jsonb;
  proc public.automation_processes%rowtype;
  scenario public.automation_scenarios%rowtype;
  tmpl public.automation_task_templates%rowtype;
  old_opt text;
  new_opt text;
  old_opt_id text;
  new_opt_id text;
  entered boolean;
  depth text;
  actor text;
  stored_option_id text;
  v_launch_phase text;
  store_on_prev boolean;
  is_prep_from_prev boolean;
  release_mode text;
  has_earlier boolean;
  inside_complete boolean;
  should_supersede boolean;
begin
  depth := coalesce(current_setting('automation.execution_depth', true), '0');
  if depth <> '' and depth::integer > 0 then
    return NEW;
  end if;

  if TG_OP <> 'INSERT' then
    old_values := coalesce(OLD.field_values, '{}'::jsonb);
  end if;
  if TG_OP <> 'DELETE' then
    new_values := coalesce(NEW.field_values, '{}'::jsonb);
  end if;

  actor := coalesce(auth.uid()::text, null);
  inside_complete :=
    coalesce(current_setting('automation.inside_complete', true), '') = '1';

  for proc in
    select *
    from public.automation_processes p
    where p.entity_id = NEW.entity_id
      and p.enabled = true
      and p.trigger_field_id <> ''
  loop
    old_opt := coalesce(old_values->>proc.trigger_field_id, '');
    new_opt := coalesce(new_values->>proc.trigger_field_id, '');
    old_opt_id := coalesce((public.automation_field_ids(old_opt))[1], '');
    new_opt_id := coalesce((public.automation_field_ids(new_opt))[1], '');

    if TG_OP = 'UPDATE'
       and old_opt_id <> ''
       and old_opt_id is distinct from new_opt_id
    then
      perform public.automation_assert_no_blocking(
        NEW.entity_id,
        NEW.id,
        proc.trigger_field_id,
        old_opt_id
      );
    end if;

    entered := false;
    if proc.trigger_kind = 'recordCreated' and TG_OP = 'INSERT' then
      entered := true;
    elsif proc.trigger_kind = 'recordUpdated' and TG_OP = 'UPDATE' then
      entered := old_values is distinct from new_values;
    elsif proc.trigger_kind in ('fieldEnter', 'fieldTransition') then
      entered := new_opt_id is distinct from old_opt_id and new_opt_id <> '';
    elsif proc.trigger_kind = 'fieldLeave' then
      entered := new_opt_id is distinct from old_opt_id and old_opt_id <> '';
    end if;

    if not entered then
      continue;
    end if;

    select * into scenario
    from public.automation_scenarios s
    where s.process_id = proc.id
      and s.is_default = false
      and jsonb_typeof(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) > 0
      and public.automation_conditions_match(s.entry_conditions, new_values, old_values)
    order by s.priority desc, s.created_at asc
    limit 1;

    if not found then
      select * into scenario
      from public.automation_scenarios s
      where s.process_id = proc.id
        and s.is_default = true
      order by (
          select count(*)::int
          from public.automation_task_templates t
          where t.scenario_id = s.id
            and coalesce(t.enabled, true) = true
        ) desc,
        s.created_at asc
      limit 1;
    end if;

    if not found then
      continue;
    end if;

    -- Rework supersede on stage change:
    -- • outside complete → always (UI / ensure_before_enter)
    -- • inside complete → only true re-entry (prior completed onEnter for the
    --   destination, or beforeEnter revisit from another stage). First land
    --   after beforeEnter prep still skips supersede so prep is not cancelled
    --   and not duplicated.
    should_supersede := false;
    if new_opt_id <> '' and old_opt_id is distinct from new_opt_id then
      if not inside_complete then
        should_supersede := true;
      elsif exists (
        select 1
        from public.automation_tasks t
        join public.automation_task_templates tpl on tpl.id = t.template_id
        where t.record_id = NEW.id
          and t.process_id = proc.id
          and t.status = 'completed'
          and coalesce(nullif(tpl.launch_phase, ''), 'onEnter') = 'onEnter'
          and (
            tpl.trigger_option_id = new_opt_id
            or t.trigger_option_id = new_opt_id
          )
      ) then
        should_supersede := true;
      elsif exists (
        select 1
        from public.automation_tasks t
        join public.automation_task_templates tpl on tpl.id = t.template_id
        where t.record_id = NEW.id
          and t.process_id = proc.id
          and t.status = 'completed'
          and coalesce(nullif(tpl.launch_phase, ''), 'onEnter') = 'beforeEnter'
          and tpl.trigger_option_id = new_opt_id
      )
      and not exists (
        select 1
        from public.automation_tasks t
        join public.automation_task_templates tpl on tpl.id = t.template_id
        where t.record_id = NEW.id
          and t.process_id = proc.id
          and t.status in ('pending', 'returned', 'completed')
          and coalesce(nullif(tpl.launch_phase, ''), 'onEnter') = 'beforeEnter'
          and tpl.trigger_option_id = new_opt_id
          and t.trigger_option_id = old_opt_id
      ) then
        should_supersede := true;
      end if;
    end if;

    if should_supersede then
      perform public.automation_supersede_stage_tasks(
        NEW.id,
        proc.id,
        new_opt_id
      );
    end if;

    for tmpl in
      select *
      from public.automation_task_templates t
      where t.scenario_id = scenario.id
        and coalesce(t.enabled, true) = true
        and public.automation_conditions_match(t.launch_conditions, new_values, old_values)
        and (
          (
            coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'onEnter'
            and nullif(btrim(t.trigger_option_id), '') is not null
            and (
              t.trigger_option_id = new_opt
              or t.trigger_option_id = new_opt_id
              or t.trigger_option_id = any(public.automation_field_ids(new_opt))
            )
          )
          or (
            coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'beforeEnter'
            and (
              exists (
                select 1
                from jsonb_array_elements(
                  coalesce(scenario.stage_transitions, '[]'::jsonb)
                ) st
                where coalesce(st->>'fromOptionId', st->>'from_option_id', '')
                      in (new_opt_id, new_opt)
                  and coalesce(st->>'toOptionId', st->>'to_option_id', '')
                      = t.trigger_option_id
              )
              or (
                (
                  t.trigger_option_id = new_opt
                  or t.trigger_option_id = new_opt_id
                  or t.trigger_option_id = any(public.automation_field_ids(new_opt))
                )
                and not exists (
                  select 1
                  from public.automation_tasks existing
                  where existing.record_id = NEW.id
                    and existing.template_id = t.id
                    and existing.status in ('pending', 'returned', 'completed')
                )
              )
            )
          )
        )
      order by
        case
          when coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'beforeEnter'
            then 0
          else 1
        end,
        t.step_order asc,
        t.created_at asc,
        t.id asc
    loop
      v_launch_phase := coalesce(nullif(tmpl.launch_phase, ''), 'onEnter');

      is_prep_from_prev :=
        v_launch_phase = 'beforeEnter'
        and exists (
          select 1
          from jsonb_array_elements(
            coalesce(scenario.stage_transitions, '[]'::jsonb)
          ) st
          where coalesce(st->>'fromOptionId', st->>'from_option_id', '')
                in (new_opt_id, new_opt)
            and coalesce(st->>'toOptionId', st->>'to_option_id', '')
                = tmpl.trigger_option_id
        );

      store_on_prev := is_prep_from_prev;

      release_mode := coalesce(
        nullif(scenario.stage_task_release->>tmpl.trigger_option_id, ''),
        'parallel'
      );

      if release_mode = 'sequential' then
        select exists (
          select 1
          from public.automation_task_templates earlier
          where earlier.scenario_id = scenario.id
            and coalesce(earlier.enabled, true) = true
            and earlier.trigger_option_id = tmpl.trigger_option_id
            and coalesce(nullif(earlier.launch_phase, ''), 'onEnter') = v_launch_phase
            and (
              earlier.step_order < tmpl.step_order
              or (
                earlier.step_order = tmpl.step_order
                and (
                  earlier.created_at < tmpl.created_at
                  or (
                    earlier.created_at = tmpl.created_at
                    and earlier.id < (tmpl).id
                  )
                )
              )
            )
            and public.automation_conditions_match(
              earlier.launch_conditions,
              new_values,
              old_values
            )
        ) into has_earlier;
        if has_earlier then
          continue;
        end if;

        if v_launch_phase = 'onEnter' then
          select exists (
            select 1
            from public.automation_task_templates be
            where be.scenario_id = scenario.id
              and coalesce(be.enabled, true) = true
              and be.trigger_option_id = tmpl.trigger_option_id
              and coalesce(nullif(be.launch_phase, ''), 'onEnter') = 'beforeEnter'
              and public.automation_conditions_match(
                be.launch_conditions,
                new_values,
                old_values
              )
              and (
                (
                  be.kind not in ('autofill', 'actions')
                  and not exists (
                    select 1
                    from public.automation_tasks done
                    where done.record_id = NEW.id
                      and done.template_id = be.id
                      and done.status = 'completed'
                  )
                )
                or (
                  be.kind in ('autofill', 'actions')
                  and not exists (
                    select 1
                    from public.automation_tasks spawned
                    where spawned.record_id = NEW.id
                      and spawned.template_id = be.id
                      and spawned.status in ('pending', 'returned', 'completed')
                  )
                )
              )
          ) into has_earlier;
          if has_earlier then
            continue;
          end if;
        end if;
      end if;

      if store_on_prev then
        stored_option_id := coalesce(nullif(new_opt_id, ''), new_opt);
      else
        stored_option_id := coalesce(
          nullif(tmpl.trigger_option_id, ''),
          nullif(new_opt_id, ''),
          new_opt
        );
      end if;

      perform public.automation_spawn_template_for_record(
        tmpl,
        proc.id,
        NEW.entity_id,
        NEW.id,
        proc.trigger_field_id,
        stored_option_id,
        new_values,
        old_values,
        actor
      );
    end loop;
  end loop;

  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION public.automation_ensure_before_enter_prep(p_record_id text, p_to_option_id text)
 RETURNS SETOF automation_tasks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.entity_records%rowtype;
  proc public.automation_processes%rowtype;
  scenario public.automation_scenarios%rowtype;
  tmpl public.automation_task_templates%rowtype;
  values jsonb;
  old_values jsonb := '{}'::jsonb;
  actor text;
  from_opt text;
  to_opt text;
  spawned_id text;
begin
  if p_record_id is null or btrim(p_record_id) = '' then
    return;
  end if;
  to_opt := nullif(btrim(coalesce(p_to_option_id, '')), '');
  if to_opt is null then
    return;
  end if;

  select * into rec from public.entity_records where id = p_record_id;
  if rec.id is null then
    return;
  end if;

  values := coalesce(rec.field_values, '{}'::jsonb);
  actor := coalesce(auth.uid()::text, null);

  for proc in
    select *
    from public.automation_processes p
    where p.entity_id = rec.entity_id
      and p.enabled = true
      and p.trigger_field_id <> ''
  loop
    from_opt := coalesce(
      (public.automation_field_ids(coalesce(values->>proc.trigger_field_id, '')))[1],
      ''
    );
    if from_opt = '' or from_opt = to_opt then
      continue;
    end if;

    select * into scenario
    from public.automation_scenarios s
    where s.process_id = proc.id
      and s.is_default = false
      and jsonb_typeof(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) > 0
      and public.automation_conditions_match(s.entry_conditions, values, old_values)
    order by s.priority desc, s.created_at asc
    limit 1;

    if not found then
      select * into scenario
      from public.automation_scenarios s
      where s.process_id = proc.id
        and s.is_default = true
      order by (
          select count(*)::int
          from public.automation_task_templates t
          where t.scenario_id = s.id
            and coalesce(t.enabled, true) = true
        ) desc,
        s.created_at asc
      limit 1;
    end if;

    if not found then
      continue;
    end if;

    -- Re-visit only: prior completed onEnter for destination, or beforeEnter
    -- completed from a different stage than the current one (not the prep
    -- just finished on this from_opt while first attempting the move).
    if exists (
      select 1
      from public.automation_tasks t
      join public.automation_task_templates tpl on tpl.id = t.template_id
      where t.record_id = rec.id
        and t.process_id = proc.id
        and t.status = 'completed'
        and coalesce(nullif(tpl.launch_phase, ''), 'onEnter') = 'onEnter'
        and (
          tpl.trigger_option_id = to_opt
          or t.trigger_option_id = to_opt
        )
    )
    or (
      exists (
        select 1
        from public.automation_tasks t
        join public.automation_task_templates tpl on tpl.id = t.template_id
        where t.record_id = rec.id
          and t.process_id = proc.id
          and t.status = 'completed'
          and coalesce(nullif(tpl.launch_phase, ''), 'onEnter') = 'beforeEnter'
          and tpl.trigger_option_id = to_opt
      )
      and not exists (
        select 1
        from public.automation_tasks t
        join public.automation_task_templates tpl on tpl.id = t.template_id
        where t.record_id = rec.id
          and t.process_id = proc.id
          and t.status in ('pending', 'returned', 'completed')
          and coalesce(nullif(tpl.launch_phase, ''), 'onEnter') = 'beforeEnter'
          and tpl.trigger_option_id = to_opt
          and t.trigger_option_id = from_opt
      )
    ) then
      perform public.automation_supersede_stage_tasks(rec.id, proc.id, to_opt);
    end if;

    for tmpl in
      select *
      from public.automation_task_templates t
      where t.scenario_id = scenario.id
        and coalesce(t.enabled, true) = true
        and coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'beforeEnter'
        and t.trigger_option_id = to_opt
        and public.automation_conditions_match(t.launch_conditions, values, old_values)
      order by t.step_order asc, t.created_at asc
    loop
      if exists (
        select 1
        from public.automation_tasks existing
        where existing.record_id = rec.id
          and existing.template_id = (tmpl).id
          and existing.status in ('pending', 'returned', 'completed')
      ) then
        continue;
      end if;

      spawned_id := public.automation_spawn_template_for_record(
        tmpl,
        proc.id,
        rec.entity_id,
        rec.id,
        proc.trigger_field_id,
        from_opt,
        values,
        old_values,
        actor
      );
    end loop;
  end loop;

  return query
  select t.*
  from public.automation_tasks t
  where t.record_id = p_record_id
    and t.status in ('pending', 'returned')
    and (
      coalesce(t.config->>'launchPhase', t.config->>'launch_phase', '') = 'beforeEnter'
      or t.trigger_option_id = to_opt
    );
end;
$function$;

-- notifications.title collided with the local variable title
-- inside the dedupe select (n.title = title).

create or replace function public.create_notification(
  p_user_id text,
  p_title text,
  p_message text,
  p_source text default 'rule',
  p_rule_id text default null,
  p_entity_id text default null,
  p_record_id text default null,
  p_task_id text default null,
  p_show_toast boolean default true
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  nid text;
  uid text := nullif(btrim(coalesce(p_user_id, '')), '');
  v_title text;
  existing_id text;
begin
  if uid is null then
    return null;
  end if;

  v_title := coalesce(
    nullif(btrim(p_title), ''),
    left(coalesce(p_message, 'Уведомление'), 120)
  );

  -- Collapse duplicate stage / rule toasts from a double field write.
  -- v_title, not title: notifications.title makes a bare title ambiguous.
  select n.id
    into existing_id
  from public.notifications n
  where n.user_id = uid
    and n.title = v_title
    and coalesce(n.entity_id, '') = coalesce(p_entity_id, '')
    and coalesce(n.record_id, '') = coalesce(p_record_id, '')
    and n.created_at > now() - interval '20 seconds'
  order by n.created_at desc
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  nid := 'ntf-' || gen_random_uuid()::text;
  insert into public.notifications (
    id, user_id, title, message, source, rule_id,
    entity_id, record_id, task_id, show_toast
  ) values (
    nid,
    uid,
    v_title,
    coalesce(p_message, ''),
    coalesce(nullif(p_source, ''), 'rule'),
    p_rule_id,
    p_entity_id,
    p_record_id,
    p_task_id,
    coalesce(p_show_toast, true)
  );
  return nid;
end;
$$;
