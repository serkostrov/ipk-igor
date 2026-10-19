-- Automation notification rules: respect recipients, conditions, and
-- {{fieldId}} placeholders in message_template (same as task name templates).

create or replace function public.automation_notify_from_rules(
  p_template_id text,
  p_event text,
  p_values jsonb,
  p_old_values jsonb,
  p_actor text,
  p_title text,
  p_fallback_message text,
  p_entity_id text,
  p_record_id text,
  p_task_id text,
  p_fallback_user_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rule public.automation_notification_rules%rowtype;
  recipient_ids text[];
  recipient_id text;
  message text;
  values jsonb := coalesce(p_values, '{}'::jsonb);
  old_values jsonb := coalesce(p_old_values, '{}'::jsonb);
begin
  if p_template_id is null or btrim(p_template_id) = '' then
    return;
  end if;
  if p_event is null or btrim(p_event) = '' then
    return;
  end if;

  for rule in
    select *
    from public.automation_notification_rules r
    where r.template_id = p_template_id
      and r.event = p_event
  loop
    if not public.automation_conditions_match(
      coalesce(
        rule.conditions,
        '{"version":1,"match":"all","rules":[]}'::jsonb
      ),
      values,
      old_values
    ) then
      continue;
    end if;

    recipient_ids := public.automation_resolve_assignees(
      coalesce(rule.recipients, '{"type":"currentUser"}'::jsonb),
      values,
      nullif(btrim(coalesce(p_actor, '')), '')
    );

    if cardinality(recipient_ids) = 0
       and nullif(btrim(coalesce(p_fallback_user_id, '')), '') is not null
    then
      recipient_ids := array[p_fallback_user_id];
    end if;

    if cardinality(recipient_ids) = 0 then
      continue;
    end if;

    message := public.automation_render_template(
      coalesce(rule.message_template, ''),
      values
    );
    if nullif(btrim(message), '') is null then
      message := coalesce(nullif(btrim(p_fallback_message), ''), p_title);
    end if;

    foreach recipient_id in array recipient_ids
    loop
      if nullif(btrim(coalesce(recipient_id, '')), '') is null then
        continue;
      end if;
      perform public.create_notification(
        recipient_id,
        coalesce(nullif(btrim(p_title), ''), 'Уведомление'),
        message,
        'automation',
        null,
        p_entity_id,
        p_record_id,
        p_task_id,
        true
      );
    end loop;
  end loop;
end;
$$;

-- ─── Spawn: assigned ───────────────────────────────────────────────────────

create or replace function public.automation_spawn_template_for_record(
  p_tmpl public.automation_task_templates,
  p_process_id text,
  p_entity_id text,
  p_record_id text,
  p_trigger_field_id text,
  p_stored_option_id text,
  p_values jsonb,
  p_old_values jsonb,
  p_actor text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  assignee_ids text[];
  assignee_id text;
  rtype text;
  task_id text;
  task_name text;
  task_description text;
  due timestamptz;
  template_snapshot jsonb;
  launch_phase text;
  autofill_outcome_id text;
  outcome_elem jsonb;
  first_task_id text := null;
begin
  launch_phase := coalesce(nullif(p_tmpl.launch_phase, ''), 'onEnter');

  if p_tmpl.kind = 'autofill' then
    assignee_ids := array[null::text];
  else
    assignee_ids := public.automation_resolve_assignees(p_tmpl.assignee, p_values, p_actor);
    if cardinality(assignee_ids) = 0 then
      rtype := coalesce(p_tmpl.assignee->>'type', 'currentUser');
      if rtype in ('currentUser', 'recordCreator') then
        assignee_ids := public.automation_resolve_assignees(
          '{"type":"currentUser"}'::jsonb,
          p_values,
          p_actor
        );
      end if;
    end if;
    if cardinality(assignee_ids) = 0 then
      assignee_ids := array[null::text];
    end if;
  end if;

  template_snapshot := jsonb_build_object(
    'id', p_tmpl.id,
    'scenarioId', p_tmpl.scenario_id,
    'name', p_tmpl.name,
    'nameTemplate', p_tmpl.name_template,
    'description', p_tmpl.description,
    'triggerOptionId', p_tmpl.trigger_option_id,
    'stepOrder', p_tmpl.step_order,
    'isBlocking', p_tmpl.is_blocking,
    'kind', p_tmpl.kind,
    'launchPhase', launch_phase,
    'launchConditions', p_tmpl.launch_conditions,
    'assignee', p_tmpl.assignee,
    'watchers', p_tmpl.watchers,
    'outcomes', p_tmpl.outcomes,
    'sla', p_tmpl.sla,
    'materials', p_tmpl.materials
  );

  task_name := public.automation_render_template(
    case
      when nullif(btrim(p_tmpl.name_template), '') is not null then p_tmpl.name_template
      else p_tmpl.name
    end,
    p_values
  );
  if nullif(btrim(task_name), '') is null then
    task_name := p_tmpl.name;
  end if;

  task_description := public.automation_render_template(
    coalesce(p_tmpl.description, ''),
    p_values
  );

  due := null;
  if p_tmpl.sla is not null and (p_tmpl.sla->>'hours') is not null then
    begin
      due := now() + ((p_tmpl.sla->>'hours')::numeric || ' hours')::interval;
    exception when others then
      due := null;
    end;
  end if;

  autofill_outcome_id := null;
  if p_tmpl.kind = 'autofill' then
    for outcome_elem in
      select value
      from jsonb_array_elements(coalesce(p_tmpl.outcomes, '[]'::jsonb)) as value
    loop
      if public.automation_conditions_match(
        coalesce(
          outcome_elem->'conditions',
          '{"version":1,"match":"all","rules":[]}'::jsonb
        ),
        p_values,
        p_old_values
      ) then
        autofill_outcome_id := outcome_elem->>'id';
        exit;
      end if;
    end loop;
    if autofill_outcome_id is null then
      autofill_outcome_id := coalesce(p_tmpl.outcomes->0->>'id', '');
    end if;
  end if;

  foreach assignee_id in array assignee_ids
  loop
    task_id := 'atask-' || gen_random_uuid()::text;
    begin
      insert into public.automation_tasks (
        id, process_id, scenario_id, template_id,
        entity_id, record_id, trigger_field_id, trigger_option_id,
        assignee_user_id, status, is_blocking, step_order,
        name, description, config, due_at, outcome_id
      ) values (
        task_id,
        p_process_id,
        p_tmpl.scenario_id,
        p_tmpl.id,
        p_entity_id,
        p_record_id,
        p_trigger_field_id,
        p_stored_option_id,
        assignee_id,
        'pending',
        p_tmpl.is_blocking,
        p_tmpl.step_order,
        task_name,
        task_description,
        template_snapshot,
        due,
        autofill_outcome_id
      );
      if first_task_id is null then
        first_task_id := task_id;
      end if;
    exception
      when unique_violation then
        continue;
      when others then
        raise warning 'automation spawn insert failed: %', sqlerrm;
        continue;
    end;

    if p_tmpl.kind = 'autofill' then
      continue;
    end if;

    begin
      perform public.automation_notify_from_rules(
        p_tmpl.id,
        'assigned',
        p_values,
        p_old_values,
        p_actor,
        'Назначена задача',
        'Назначена задача: ' || task_name,
        p_entity_id,
        p_record_id,
        task_id,
        assignee_id
      );
    exception when others then
      raise warning 'automation spawn notify failed: %', sqlerrm;
    end;
  end loop;

  return first_task_id;
end;
$$;

-- ─── Complete: completed ───────────────────────────────────────────────────

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

-- ─── Overdue ───────────────────────────────────────────────────────────────

create or replace function public.automation_register_overdue_tasks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  task record;
  ev_id text;
  rec_values jsonb;
  has_rules boolean;
begin
  for task in
    select *
    from public.automation_tasks t
    where t.status = 'pending'
      and t.due_at is not null
      and t.due_at < now()
      and not exists (
        select 1 from public.automation_task_sla_events e
        where e.task_id = t.id and e.kind = 'overdue'
      )
  loop
    ev_id := 'asla-' || gen_random_uuid()::text;
    insert into public.automation_task_sla_events (id, task_id, kind, payload)
    values (ev_id, task.id, 'overdue', jsonb_build_object('dueAt', task.due_at));

    select exists (
      select 1
      from public.automation_notification_rules r
      where r.template_id = task.template_id
        and r.event = 'overdue'
    ) into has_rules;

    if has_rules then
      select coalesce(er.field_values, '{}'::jsonb)
      into rec_values
      from public.entity_records er
      where er.id = task.record_id;

      begin
        perform public.automation_notify_from_rules(
          task.template_id,
          'overdue',
          coalesce(rec_values, '{}'::jsonb),
          coalesce(rec_values, '{}'::jsonb),
          null,
          'Просрочена задача',
          'Просрочена задача: ' || task.name,
          task.entity_id,
          task.record_id,
          task.id,
          task.assignee_user_id
        );
      exception when others then
        raise warning 'automation overdue notify failed: %', sqlerrm;
      end;
    elsif task.assignee_user_id is not null then
      perform public.create_notification(
        task.assignee_user_id,
        'Просрочена задача',
        'Просрочена задача: ' || task.name,
        'automation',
        null,
        task.entity_id,
        task.record_id,
        task.id,
        true
      );
    end if;

    n := n + 1;
  end loop;
  return n;
end;
$$;
