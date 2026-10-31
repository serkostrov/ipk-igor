-- Rework / return-to-stage: allow templates of the entered stage to spawn
-- again after a previous visit completed them.
--
-- Values stay on entity_records.field_values — the task form seeds defaults
-- from the record. We only supersede prior completed task rows so the
-- spawn dedupe (pending|returned|completed) no longer blocks re-entry.
--
-- Sequential spawn_next keeps the completed check unchanged (same visit).

create or replace function public.automation_supersede_stage_tasks(
  p_record_id text,
  p_process_id text,
  p_option_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  option_id text;
  updated_count integer := 0;
begin
  option_id := nullif(btrim(coalesce(p_option_id, '')), '');
  if p_record_id is null or btrim(p_record_id) = '' then
    return 0;
  end if;
  if p_process_id is null or btrim(p_process_id) = '' then
    return 0;
  end if;
  if option_id is null then
    return 0;
  end if;

  update public.automation_tasks t
  set
    status = 'cancelled',
    updated_at = now()
  where t.record_id = p_record_id
    and t.process_id = p_process_id
    and t.status = 'completed'
    and (
      t.trigger_option_id = option_id
      or exists (
        select 1
        from public.automation_task_templates tmpl
        where tmpl.id = t.template_id
          and (
            tmpl.trigger_option_id = option_id
            or tmpl.trigger_option_id = any(public.automation_field_ids(option_id))
          )
      )
    );

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.automation_supersede_stage_tasks(text, text, text)
  to authenticated, service_role;

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

    -- True stage re-entry: free prior completed tasks so templates can spawn
    -- again. Same-visit sequential still blocked by completed after this land.
    if new_opt_id <> '' and old_opt_id is distinct from new_opt_id then
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

create or replace function public.automation_ensure_before_enter_prep(
  p_record_id text,
  p_to_option_id text
) returns setof public.automation_tasks
language plpgsql
security definer
set search_path = public
as $$
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
      join public.automation_task_templates tmpl on tmpl.id = t.template_id
      where t.record_id = rec.id
        and t.process_id = proc.id
        and t.status = 'completed'
        and coalesce(nullif(tmpl.launch_phase, ''), 'onEnter') = 'onEnter'
        and (
          tmpl.trigger_option_id = to_opt
          or t.trigger_option_id = to_opt
        )
    )
    or (
      exists (
        select 1
        from public.automation_tasks t
        join public.automation_task_templates tmpl on tmpl.id = t.template_id
        where t.record_id = rec.id
          and t.process_id = proc.id
          and t.status = 'completed'
          and coalesce(nullif(tmpl.launch_phase, ''), 'onEnter') = 'beforeEnter'
          and tmpl.trigger_option_id = to_opt
      )
      and not exists (
        select 1
        from public.automation_tasks t
        join public.automation_task_templates tmpl on tmpl.id = t.template_id
        where t.record_id = rec.id
          and t.process_id = proc.id
          and t.status in ('pending', 'returned', 'completed')
          and coalesce(nullif(tmpl.launch_phase, ''), 'onEnter') = 'beforeEnter'
          and tmpl.trigger_option_id = to_opt
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
          and existing.template_id = tmpl.id
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
$$;

grant execute on function public.automation_ensure_before_enter_prep(text, text)
  to authenticated, service_role;

-- cancelTasks may also clear completed rows so builders can free
-- templates before a stage return (complements supersede-on-enter).

create or replace function public.complete_automation_task(
  p_task_id text,
  p_outcome_id text,
  p_actor_user_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task public.automation_tasks%rowtype;
  outcome jsonb;
  actions jsonb;
  action jsonb;
  field_id text;
  field_value text;
  rec public.entity_records%rowtype;
  lower_pending integer;
  lower_names text;
  run_id text;
  actions_log jsonb := '[]'::jsonb;
  next_task_id text;
  values_changed boolean := false;
  launch_phase text;
  dest_option text;
  trigger_field text;
  stage_already_set boolean := false;
  task_phase text;
  task_stage text;
  wait_for_siblings boolean := false;
  complete_when text;
begin
  select * into task from public.automation_tasks where id = p_task_id for update;
  if task.id is null then
    raise exception 'Task not found';
  end if;
  if task.status <> 'pending' and task.status <> 'returned' then
    raise exception 'Task is not pending';
  end if;

  task_phase := coalesce(
    nullif(btrim(coalesce(task.config->>'launchPhase', '')), ''),
    nullif(btrim(coalesce(task.config->>'launch_phase', '')), ''),
    'onEnter'
  );
  task_stage := coalesce(
    nullif(btrim(coalesce(task.config->>'triggerOptionId', '')), ''),
    nullif(btrim(coalesce(task.config->>'trigger_option_id', '')), ''),
    nullif(btrim(coalesce(task.trigger_option_id, '')), ''),
    ''
  );

  select
    count(*)::integer,
    string_agg(
      coalesce(nullif(btrim(t.name), ''), 'Задача'),
      ', '
      order by
        case
          when coalesce(
            nullif(btrim(coalesce(t.config->>'launchPhase', '')), ''),
            nullif(btrim(coalesce(t.config->>'launch_phase', '')), ''),
            'onEnter'
          ) = 'beforeEnter' then 0
          else 1
        end,
        t.step_order,
        t.created_at
    )
  into lower_pending, lower_names
  from public.automation_tasks t
  where t.record_id = task.record_id
    and t.status = 'pending'
    and t.is_blocking = true
    and t.id <> task.id
    and coalesce(t.config->>'kind', '') not in ('autofill', 'actions')
    and coalesce(
      nullif(btrim(coalesce(t.config->>'triggerOptionId', '')), ''),
      nullif(btrim(coalesce(t.config->>'trigger_option_id', '')), ''),
      nullif(btrim(coalesce(t.trigger_option_id, '')), ''),
      ''
    ) = task_stage
    and (
      (
        task_phase = 'onEnter'
        and coalesce(
          nullif(btrim(coalesce(t.config->>'launchPhase', '')), ''),
          nullif(btrim(coalesce(t.config->>'launch_phase', '')), ''),
          'onEnter'
        ) = 'beforeEnter'
      )
      or (
        coalesce(
          nullif(btrim(coalesce(t.config->>'launchPhase', '')), ''),
          nullif(btrim(coalesce(t.config->>'launch_phase', '')), ''),
          'onEnter'
        ) = task_phase
        and t.step_order < task.step_order
      )
    );

  if lower_pending > 0 then
    raise exception 'AUTOMATION_ORDER: Сначала выполните: %', lower_names
      using errcode = 'P0001';
  end if;

  select o into outcome
  from jsonb_array_elements(coalesce(task.config->'outcomes', '[]'::jsonb)) as o
  where o->>'id' = p_outcome_id
  limit 1;

  if outcome is null then
    select o into outcome
    from jsonb_array_elements(coalesce(task.config->'outcomes', '[]'::jsonb)) as o
    limit 1;
  end if;

  if outcome is null then
    raise exception 'Outcome not found';
  end if;

  select * into rec from public.entity_records where id = task.record_id for update;
  if rec.id is null then
    raise exception 'Record not found';
  end if;

  select nullif(btrim(coalesce(p.trigger_field_id, '')), '')
  into trigger_field
  from public.automation_processes p
  where p.id = task.process_id;

  -- Other assignees still open → defer stage moves only for completeWhen=all.
  complete_when := lower(coalesce(
    nullif(btrim(coalesce(task.config->'assignee'->>'completeWhen', '')), ''),
    nullif(btrim(coalesce(task.config->'assignee'->>'complete_when', '')), ''),
    'all'
  ));
  if nullif(trim(coalesce(task.template_id, '')), '') is not null
     and complete_when <> 'any'
  then
    select exists (
      select 1
      from public.automation_tasks sibling
      where sibling.record_id = task.record_id
        and sibling.template_id = task.template_id
        and sibling.process_id is not distinct from task.process_id
        and sibling.id <> task.id
        and sibling.status in ('pending', 'returned')
    ) into wait_for_siblings;
  end if;

  actions := coalesce(outcome->'actions', '[]'::jsonb);
  for action in select * from jsonb_array_elements(actions)
  loop
    if action->>'kind' = 'setField' then
      field_id := coalesce(
        nullif(trim(coalesce(action->>'fieldId', '')), ''),
        nullif(trim(coalesce(action->>'field_id', '')), '')
      );
      field_value := public.automation_resolve_action_value(
        coalesce(action->>'value', ''),
        coalesce(rec.field_values, '{}'::jsonb),
        p_actor_user_id
      );
      if field_id is not null then
        if wait_for_siblings
           and trigger_field is not null
           and field_id = trigger_field
        then
          actions_log := actions_log || jsonb_build_array(
            jsonb_build_object(
              'kind', 'setField',
              'fieldId', field_id,
              'deferredUntilAllAssignees', true
            )
          );
        else
          rec.field_values := jsonb_set(
            coalesce(rec.field_values, '{}'::jsonb),
            array[field_id],
            to_jsonb(field_value),
            true
          );
          values_changed := true;
          actions_log := actions_log || jsonb_build_array(
            jsonb_build_object('kind', 'setField', 'fieldId', field_id)
          );
        end if;
      end if;
    elsif action->>'kind' = 'setFieldPrevious' then
      field_id := coalesce(
        nullif(trim(coalesce(action->>'fieldId', '')), ''),
        nullif(trim(coalesce(action->>'field_id', '')), '')
      );
      if field_id is not null then
        actions_log := actions_log || jsonb_build_array(
          jsonb_build_object('kind', 'setFieldPrevious', 'fieldId', field_id, 'deferred', true)
        );
      end if;
    elsif action->>'kind' = 'noop' then
      actions_log := actions_log || jsonb_build_array(jsonb_build_object('kind', 'noop'));
    elsif action->>'kind' = 'cancelTasks' then
      update public.automation_tasks t
      set status = 'cancelled', updated_at = now()
      where t.record_id = task.record_id
        and t.status in ('pending', 'completed')
        and t.id <> task.id
        and (
          action->'templateIds' is null
          or jsonb_array_length(coalesce(action->'templateIds', '[]'::jsonb)) = 0
          or t.template_id in (
            select jsonb_array_elements_text(coalesce(action->'templateIds', '[]'::jsonb))
          )
        );
      actions_log := actions_log || jsonb_build_array(jsonb_build_object('kind', 'cancelTasks'));
    end if;
  end loop;

  launch_phase := task_phase;
  dest_option := task_stage;

  if launch_phase = 'beforeEnter'
     and dest_option <> ''
     and trigger_field is not null
     and not wait_for_siblings
  then
    select exists (
      select 1
      from jsonb_array_elements(actions) as a(value)
      where a.value->>'kind' = 'setField'
        and coalesce(
          nullif(trim(coalesce(a.value->>'fieldId', '')), ''),
          nullif(trim(coalesce(a.value->>'field_id', '')), '')
        ) = trigger_field
    ) into stage_already_set;

    if not stage_already_set then
      rec.field_values := jsonb_set(
        coalesce(rec.field_values, '{}'::jsonb),
        array[trigger_field],
        to_jsonb(dest_option),
        true
      );
      values_changed := true;
      actions_log := actions_log || jsonb_build_array(
        jsonb_build_object(
          'kind', 'setField',
          'fieldId', trigger_field,
          'autoBeforeEnter', true
        )
      );
    end if;
  elsif launch_phase = 'beforeEnter' and wait_for_siblings then
    actions_log := actions_log || jsonb_build_array(
      jsonb_build_object(
        'kind', 'setField',
        'fieldId', trigger_field,
        'autoBeforeEnter', true,
        'deferredUntilAllAssignees', true
      )
    );
  end if;

  update public.automation_tasks
  set
    status = 'completed',
    outcome_id = coalesce(outcome->>'id', p_outcome_id),
    completed_at = now(),
    updated_at = now()
  where id = task.id;

  begin
    perform public.automation_notify_from_rules(
      task.template_id,
      'completed',
      coalesce(rec.field_values, '{}'::jsonb),
      coalesce(rec.field_values, '{}'::jsonb),
      p_actor_user_id,
      'Завершена задача',
      'Завершена задача: ' || task.name,
      task.entity_id,
      task.record_id,
      task.id,
      task.assignee_user_id
    );
  exception when others then
    raise warning 'automation complete notify failed: %', sqlerrm;
  end;

  -- Allow spawn trigger; suppress blocking assert for this stage write.
  perform set_config('automation.execution_depth', '0', true);
  perform set_config('automation.inside_complete', '1', true);

  select * into task from public.automation_tasks where id = p_task_id;
  next_task_id := public.automation_spawn_next_sequential_task(task, p_actor_user_id);
  if next_task_id is not null then
    actions_log := actions_log || jsonb_build_array(
      jsonb_build_object('kind', 'spawnNextSequential', 'taskId', next_task_id)
    );
  end if;

  if values_changed then
    update public.entity_records
    set field_values = rec.field_values, updated_at = now()
    where id = rec.id;
  end if;

  perform set_config('automation.inside_complete', '0', true);

  run_id := 'arun-' || gen_random_uuid()::text;
  insert into public.automation_runs (id, cause, entity_id, record_id, task_id, actions_log, status)
  values (run_id, 'complete', task.entity_id, task.record_id, task.id, actions_log, 'ok');

  return jsonb_build_object(
    'taskId', task.id,
    'runId', run_id,
    'outcomeId', coalesce(outcome->>'id', p_outcome_id),
    'actionsLog', actions_log,
    'nextTaskId', next_task_id,
    'waitingForAssignees', wait_for_siblings,
    'fieldValues', coalesce(rec.field_values, '{}'::jsonb)
  );
exception
  when others then
    perform set_config('automation.execution_depth', '0', true);
    perform set_config('automation.inside_complete', '0', true);
    raise;
end;
$$;

grant execute on function public.complete_automation_task(text, text, text)
  to authenticated, service_role;
