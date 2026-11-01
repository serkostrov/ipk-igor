-- Fix: completing beforeEnter must not re-spawn the same prep task.
--
-- complete_automation_task lands the destination stage with inside_complete=1.
-- Rework supersede was cancelling that just-completed beforeEnter (matched by
-- template.trigger_option_id = destination), so the same-stage beforeEnter arm
-- inserted a duplicate pending task after «Готово».
--
-- Skip supersede while inside_complete; keep full supersede for UI rework and
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

    -- Rework supersede: free prior completed tasks on manual / ensure_before_enter
    -- lands only. During complete_automation_task (inside_complete=1) supersede
    -- would cancel the just-finished beforeEnter prep (template targets
    -- destination) and the same-stage beforeEnter arm would spawn a duplicate.
    if coalesce(current_setting('automation.inside_complete', true), '') <> '1'
       and new_opt_id <> ''
       and old_opt_id is distinct from new_opt_id
    then
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
