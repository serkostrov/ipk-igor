-- Fix premature sequential / beforeEnter release across stages.
--
-- Root cause (Lead «ГИП» + ТКП overlap):
-- 1) automation_spawn_on_record_change used «next kanban list option» to
--    spawn beforeEnter of stage N+1 when landing on stage N (ТКП «Создано»).
-- 2) Completing that silent beforeEnter called automation_spawn_next_sequential_task
--    which crossed beforeEnter → onEnter of N+1 even while the record stayed
--    on N — opening «Выбрать руководителей…» while Lead «Ознакомиться с ТЗ»
--    was still pending.
--
-- Also harden sequential enter-spawn: when several templates share step_order,
-- only the first by (step_order, created_at, id) spawns; later ones wait for
-- complete → spawn_next.
--
-- Cross-stage beforeEnter prep stays available via:
--   • explicit scenario.stage_transitions
--   • automation_ensure_before_enter_prep (manual move)
-- Same-stage beforeEnter on land is unchanged.

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

    for tmpl in
      select *
      from public.automation_task_templates t
      where t.scenario_id = scenario.id
        and coalesce(t.enabled, true) = true
        and public.automation_conditions_match(t.launch_conditions, new_values, old_values)
        and (
          (
            coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'onEnter'
            and (
              t.trigger_option_id = ''
              or t.trigger_option_id = new_opt
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
        -- Only the first sibling by (step_order, created_at, id) spawns now.
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
                    and earlier.id < tmpl.id
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

        -- onEnter vs beforeEnter of the same stage:
        -- • interactive beforeEnter → must be completed
        -- • silent beforeEnter (autofill/actions) → must be spawned only
        --   (client completes it; waiting for complete hid the interactive task)
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

-- Do not unlock onEnter of stage N while the record is still on N-1
-- (prep-from-prev / next-option beforeEnter residue).
create or replace function public.automation_spawn_next_sequential_task(
  p_task public.automation_tasks,
  p_actor text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  scenario public.automation_scenarios%rowtype;
  rec public.entity_records%rowtype;
  release_mode text;
  stage_option_id text;
  v_launch_phase text;
  next_tmpl public.automation_task_templates%rowtype;
  values jsonb;
  stored_option_id text;
  already_spawned boolean;
  siblings_pending boolean;
  complete_when text;
  current_stage text;
  tmpl_created_at timestamptz;
  tmpl_id text;
begin
  select * into scenario
  from public.automation_scenarios
  where id = p_task.scenario_id;
  if scenario.id is null then
    return null;
  end if;

  stage_option_id := coalesce(
    nullif(p_task.config->>'triggerOptionId', ''),
    nullif(p_task.trigger_option_id, '')
  );
  if stage_option_id is null or stage_option_id = '' then
    return null;
  end if;

  release_mode := coalesce(
    nullif(scenario.stage_task_release->>stage_option_id, ''),
    'parallel'
  );
  if release_mode <> 'sequential' then
    return null;
  end if;

  complete_when := lower(coalesce(
    nullif(btrim(coalesce(p_task.config->'assignee'->>'completeWhen', '')), ''),
    nullif(btrim(coalesce(p_task.config->'assignee'->>'complete_when', '')), ''),
    'all'
  ));

  -- AND-join when completeWhen = all (default). Skip for «any».
  if nullif(trim(coalesce(p_task.template_id, '')), '') is not null
     and complete_when <> 'any'
  then
    select exists (
      select 1
      from public.automation_tasks sibling
      where sibling.record_id = p_task.record_id
        and sibling.template_id = p_task.template_id
        and sibling.process_id is not distinct from p_task.process_id
        and sibling.id <> p_task.id
        and sibling.status in ('pending', 'returned')
    ) into siblings_pending;
    if siblings_pending then
      return null;
    end if;
  end if;

  v_launch_phase := coalesce(
    nullif(p_task.config->>'launchPhase', ''),
    'onEnter'
  );

  select * into rec from public.entity_records where id = p_task.record_id;
  if rec.id is null then
    return null;
  end if;
  values := coalesce(rec.field_values, '{}'::jsonb);

  tmpl_id := coalesce(nullif(p_task.template_id, ''), '');
  select t.created_at into tmpl_created_at
  from public.automation_task_templates t
  where t.id = tmpl_id;
  tmpl_created_at := coalesce(tmpl_created_at, p_task.created_at, '-infinity'::timestamptz);

  -- Same phase: immediate next by (step_order, created_at, id).
  select * into next_tmpl
  from public.automation_task_templates t
  where t.scenario_id = p_task.scenario_id
    and coalesce(t.enabled, true) = true
    and t.trigger_option_id = stage_option_id
    and coalesce(nullif(t.launch_phase, ''), 'onEnter') = v_launch_phase
    and (
      t.step_order > p_task.step_order
      or (
        t.step_order = p_task.step_order
        and (
          t.created_at > tmpl_created_at
          or (t.created_at = tmpl_created_at and t.id > tmpl_id)
        )
      )
    )
    and public.automation_conditions_match(
      t.launch_conditions,
      values,
      values
    )
  order by t.step_order asc, t.created_at asc, t.id asc
  limit 1;

  -- Cross beforeEnter → first onEnter only when the record has landed on
  -- this stage. Prep stored on the previous stage must not unlock onEnter.
  if next_tmpl.id is null and v_launch_phase = 'beforeEnter' then
    current_stage := coalesce(
      (public.automation_field_ids(values->>p_task.trigger_field_id))[1],
      nullif(values->>p_task.trigger_field_id, ''),
      ''
    );
    if current_stage = stage_option_id then
      select * into next_tmpl
      from public.automation_task_templates t
      where t.scenario_id = p_task.scenario_id
        and coalesce(t.enabled, true) = true
        and t.trigger_option_id = stage_option_id
        and coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'onEnter'
        and public.automation_conditions_match(
          t.launch_conditions,
          values,
          values
        )
      order by t.step_order asc, t.created_at asc, t.id asc
      limit 1;
    end if;
  end if;

  if next_tmpl.id is null then
    return null;
  end if;

  select exists (
    select 1
    from public.automation_tasks existing
    where existing.record_id = p_task.record_id
      and existing.template_id = next_tmpl.id
      and existing.status in ('pending', 'returned', 'completed')
  ) into already_spawned;

  if already_spawned then
    return null;
  end if;

  stored_option_id := coalesce(
    nullif(btrim(next_tmpl.trigger_option_id), ''),
    stage_option_id,
    p_task.trigger_option_id
  );

  return public.automation_spawn_template_for_record(
    next_tmpl,
    p_task.process_id,
    p_task.entity_id,
    p_task.record_id,
    p_task.trigger_field_id,
    stored_option_id,
    values,
    values,
    p_actor
  );
end;
$$;

grant execute on function public.automation_spawn_next_sequential_task(
  public.automation_tasks,
  text
) to authenticated, service_role;

-- Live/config alignment: ТКП «Автосоздание задач отделов» must run onEnter of
-- «Выбор отделов» (not beforeEnter prep), after Lead advances the stage.
update public.automation_task_templates
set
  launch_phase = 'onEnter',
  step_order = 0,
  updated_at = now()
where id = 'atpl-edf9b197-ec40-4308-8a05-5c8ea6772b93';

update public.automation_task_templates
set
  launch_phase = 'onEnter',
  step_order = 1,
  updated_at = now()
where id = 'atpl-01b8793a-1fcf-4b42-9b3a-b237b5ee3e9e';
