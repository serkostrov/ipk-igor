-- Resolve dynamic setField tokens (__today__, __tomorrow__, __now__, …)
-- and {{fieldId}} placeholders when completing automation tasks in SQL.

create or replace function public.automation_resolve_action_value(
  p_value text,
  p_field_values jsonb,
  p_actor_user_id text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text := coalesce(p_value, '');
  user_id text;
begin
  if v = '' then
    return '';
  end if;

  if v = '__today__' then
    return to_char(current_date, 'YYYY-MM-DD');
  end if;

  if v = '__tomorrow__' then
    return to_char(current_date + 1, 'YYYY-MM-DD');
  end if;

  if v = '__now__' then
    return to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI');
  end if;

  if v = '__timeNow__' then
    return to_char(clock_timestamp(), 'HH24:MI');
  end if;

  if v = '__currentUser__' then
    if p_actor_user_id is not null and length(trim(p_actor_user_id)) > 0 then
      return trim(p_actor_user_id);
    end if;
    select er.id into user_id
    from public.entity_records er
    where er.entity_id = 'entity-system-users'
      and er.auth_user_id = auth.uid()
    limit 1;
    return coalesce(user_id, '');
  end if;

  if v = '{{created}}' or v = 'created' then
    return '';
  end if;

  return public.automation_render_template(v, p_field_values);
end;
$$;

create or replace function public.complete_automation_task(
  p_task_id text,
  p_outcome_id text,
  p_actor_user_id text default null
) returns jsonb
language plpgsql
security definer
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
  run_id text;
  actions_log jsonb := '[]'::jsonb;
  n_msg text;
begin
  select * into task from public.automation_tasks where id = p_task_id for update;
  if task.id is null then
    raise exception 'Task not found';
  end if;
  if task.status <> 'pending' and task.status <> 'returned' then
    raise exception 'Task is not pending';
  end if;

  select count(*)::integer into lower_pending
  from public.automation_tasks t
  where t.record_id = task.record_id
    and t.trigger_option_id = task.trigger_option_id
    and t.status = 'pending'
    and t.is_blocking = true
    and t.step_order < task.step_order
    and t.id <> task.id;

  if lower_pending > 0 then
    raise exception 'AUTOMATION_ORDER: Сначала выполните предыдущие блокирующие задачи.';
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

  perform set_config('automation.execution_depth', '1', true);

  actions := coalesce(outcome->'actions', '[]'::jsonb);
  for action in select * from jsonb_array_elements(actions)
  loop
    if action->>'kind' = 'setField' then
      field_id := action->>'fieldId';
      field_value := public.automation_resolve_action_value(
        coalesce(action->>'value', ''),
        coalesce(rec.field_values, '{}'::jsonb),
        p_actor_user_id
      );
      if field_id is not null and field_id <> '' then
        rec.field_values := jsonb_set(
          coalesce(rec.field_values, '{}'::jsonb),
          array[field_id],
          to_jsonb(field_value),
          true
        );
        actions_log := actions_log || jsonb_build_array(
          jsonb_build_object('kind', 'setField', 'fieldId', field_id)
        );
      end if;
    elsif action->>'kind' = 'setFieldPrevious' then
      field_id := action->>'fieldId';
      if field_id is not null and field_id <> '' then
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

  update public.entity_records
  set field_values = rec.field_values, updated_at = now()
  where id = rec.id;

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

  run_id := 'arun-' || gen_random_uuid()::text;
  insert into public.automation_runs (id, cause, entity_id, record_id, task_id, actions_log, status)
  values (run_id, 'complete', task.entity_id, task.record_id, task.id, actions_log, 'ok');

  perform set_config('automation.execution_depth', '0', true);

  return jsonb_build_object(
    'taskId', task.id,
    'runId', run_id,
    'outcomeId', coalesce(outcome->>'id', p_outcome_id),
    'actionsLog', actions_log
  );
exception
  when others then
    perform set_config('automation.execution_depth', '0', true);
    raise;
end;
$$;
