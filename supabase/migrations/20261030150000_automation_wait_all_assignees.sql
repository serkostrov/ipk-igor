-- Multi-assignee (fan-out / role / fixed users): the next sequential task
-- must wait until every sibling for the same template is done — not the
-- first assignee to click «Готово».

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

  -- AND-join: one open task per assignee for the same template. Hold the
  -- next step while any sibling is still pending / returned.
  if nullif(trim(coalesce(p_task.template_id, '')), '') is not null then
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

  -- Same phase: the immediate next template by step_order (conditions match).
  select * into next_tmpl
  from public.automation_task_templates t
  where t.scenario_id = p_task.scenario_id
    and coalesce(t.enabled, true) = true
    and t.trigger_option_id = stage_option_id
    and coalesce(nullif(t.launch_phase, ''), 'onEnter') = v_launch_phase
    and t.step_order > p_task.step_order
    and public.automation_conditions_match(
      t.launch_conditions,
      values,
      values
    )
  order by t.step_order asc, t.created_at asc
  limit 1;

  -- Cross beforeEnter → first onEnter only when no same-phase next remains.
  if next_tmpl.id is null and v_launch_phase = 'beforeEnter' then
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
    order by t.step_order asc, t.created_at asc
    limit 1;
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

-- Same AND-join for stage writes: completing one of N must not move the
-- process stage (setField on trigger / beforeEnter auto) while siblings remain.
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

  -- Other assignees still open for this template → defer stage moves.
  if nullif(trim(coalesce(task.template_id, '')), '') is not null then
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
        and t.status = 'pending'
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
