-- Surface concrete blocking task names in AUTOMATION_BLOCKED / AUTOMATION_ORDER
-- so the UI can tell the user exactly what to finish.

create or replace function public.automation_assert_no_blocking(
  p_entity_id text,
  p_record_id text,
  p_trigger_field_id text,
  p_current_option_id text
) returns void
language plpgsql
as $$
declare
  pending_count integer;
  task_names text;
begin
  select
    count(*)::integer,
    string_agg(
      coalesce(nullif(btrim(t.name), ''), 'Задача'),
      ', '
      order by t.step_order, t.created_at
    )
  into pending_count, task_names
  from public.automation_tasks t
  where t.entity_id = p_entity_id
    and t.record_id = p_record_id
    and t.trigger_field_id = p_trigger_field_id
    and t.trigger_option_id = p_current_option_id
    and t.status = 'pending'
    and t.is_blocking = true;

  if pending_count > 0 then
    raise exception 'AUTOMATION_BLOCKED: Сначала выполните: %', task_names
      using errcode = 'P0001';
  end if;
end;
$$;

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
  n_msg text;
  next_task_id text;
  values_changed boolean := false;
  launch_phase text;
  dest_option text;
  trigger_field text;
  stage_already_set boolean := false;
begin
  select * into task from public.automation_tasks where id = p_task_id for update;
  if task.id is null then
    raise exception 'Task not found';
  end if;
  if task.status <> 'pending' and task.status <> 'returned' then
    raise exception 'Task is not pending';
  end if;

  select
    count(*)::integer,
    string_agg(
      coalesce(nullif(btrim(t.name), ''), 'Задача'),
      ', '
      order by t.step_order, t.created_at
    )
  into lower_pending, lower_names
  from public.automation_tasks t
  where t.record_id = task.record_id
    and t.trigger_option_id = task.trigger_option_id
    and t.status = 'pending'
    and t.is_blocking = true
    and t.step_order < task.step_order
    and t.id <> task.id;

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

  -- beforeEnter → land on the stage this prep belongs to when the outcome
  -- did not already set the process trigger field («Перейти на стадию»).
  launch_phase := coalesce(
    nullif(btrim(coalesce(task.config->>'launchPhase', '')), ''),
    nullif(btrim(coalesce(task.config->>'launch_phase', '')), ''),
    'onEnter'
  );
  dest_option := coalesce(
    nullif(btrim(coalesce(task.config->>'triggerOptionId', '')), ''),
    nullif(btrim(coalesce(task.config->>'trigger_option_id', '')), ''),
    ''
  );
  select nullif(btrim(coalesce(p.trigger_field_id, '')), '')
  into trigger_field
  from public.automation_processes p
  where p.id = task.process_id;

  if launch_phase = 'beforeEnter'
     and dest_option <> ''
     and trigger_field is not null
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
  end if;

  update public.automation_tasks
  set
    status = 'completed',
    outcome_id = coalesce(outcome->>'id', p_outcome_id),
    completed_at = now(),
    updated_at = now()
  where id = task.id;

  if task.assignee_user_id is not null then
    for n_msg in
      select coalesce(nullif(r.message_template, ''), 'Завершена задача: ' || task.name)
      from public.automation_notification_rules r
      where r.template_id = task.template_id
        and r.event = 'completed'
    loop
      perform public.create_notification(
        task.assignee_user_id,
        'Завершена задача',
        n_msg,
        'automation',
        null,
        task.entity_id,
        task.record_id,
        task.id,
        true
      );
    end loop;
  end if;

  perform set_config('automation.execution_depth', '0', true);

  if values_changed then
    update public.entity_records
    set field_values = rec.field_values, updated_at = now()
    where id = rec.id;
  end if;

  select * into task from public.automation_tasks where id = p_task_id;
  next_task_id := public.automation_spawn_next_sequential_task(task, p_actor_user_id);
  if next_task_id is not null then
    actions_log := actions_log || jsonb_build_array(
      jsonb_build_object('kind', 'spawnNextSequential', 'taskId', next_task_id)
    );
  end if;

  run_id := 'arun-' || gen_random_uuid()::text;
  insert into public.automation_runs (id, cause, entity_id, record_id, task_id, actions_log, status)
  values (run_id, 'complete', task.entity_id, task.record_id, task.id, actions_log, 'ok');

  return jsonb_build_object(
    'taskId', task.id,
    'runId', run_id,
    'outcomeId', coalesce(outcome->>'id', p_outcome_id),
    'actionsLog', actions_log,
    'nextTaskId', next_task_id,
    'fieldValues', coalesce(rec.field_values, '{}'::jsonb)
  );
exception
  when others then
    perform set_config('automation.execution_depth', '0', true);
    raise;
end;
$$;

grant execute on function public.complete_automation_task(text, text, text)
  to authenticated;
grant execute on function public.complete_automation_task(text, text, text)
  to service_role;
