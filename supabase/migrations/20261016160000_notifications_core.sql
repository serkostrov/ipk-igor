-- Unified notifications inbox + entity notification rules.
-- Migrates legacy automation_notifications into public.notifications.

-- ─── Tables ────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id text primary key,
  user_id text not null,
  title text not null default '',
  message text not null default '',
  source text not null default 'rule'
    check (source in ('rule', 'automation', 'action')),
  rule_id text,
  entity_id text,
  record_id text,
  task_id text,
  show_toast boolean not null default true,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id, created_at desc);

create table if not exists public.notification_rules (
  id text primary key,
  name text not null default '',
  enabled boolean not null default true,
  entity_id text not null,
  trigger_kind text not null default 'recordCreated',
  field_id text not null default '',
  option_id text not null default '',
  from_option_id text not null default '',
  to_option_id text not null default '',
  conditions jsonb not null default '{"version":1,"match":"all","rules":[]}'::jsonb,
  recipients jsonb not null default '{"type":"currentUser"}'::jsonb,
  title_template text not null default '',
  message_template text not null default '',
  show_toast boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_rules_entity_id_idx
  on public.notification_rules (entity_id);
create index if not exists notification_rules_enabled_idx
  on public.notification_rules (enabled)
  where enabled = true;

-- ─── Migrate legacy rows ───────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'automation_notifications'
  ) then
    insert into public.notifications (
      id, user_id, title, message, source, rule_id,
      entity_id, record_id, task_id, show_toast, read_at, created_at
    )
    select
      a.id,
      a.user_id,
      left(coalesce(nullif(a.message, ''), 'Уведомление'), 120),
      coalesce(a.message, ''),
      'automation',
      null,
      null,
      null,
      a.task_id,
      true,
      a.read_at,
      a.created_at
    from public.automation_notifications a
    on conflict (id) do nothing;
  end if;
end $$;

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.notifications enable row level security;
alter table public.notification_rules enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['notifications', 'notification_rules']
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      t || '_select', t
    );
    execute format(
      'drop policy if exists %I on public.%I',
      t || '_insert', t
    );
    execute format(
      'drop policy if exists %I on public.%I',
      t || '_update', t
    );
    execute format(
      'drop policy if exists %I on public.%I',
      t || '_delete', t
    );
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (true)',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (true) with check (true)',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to anon, authenticated using (true)',
      t || '_delete', t
    );
  end loop;
end $$;

-- ─── Helpers ───────────────────────────────────────────────────────────────

create or replace function public.notification_render_template(
  p_template text,
  p_values jsonb
) returns text
language plpgsql
immutable
as $$
declare
  result text := coalesce(p_template, '');
  key text;
  val text;
begin
  for key in select jsonb_object_keys(coalesce(p_values, '{}'::jsonb))
  loop
    val := coalesce(p_values->>key, '');
    begin
      if jsonb_typeof((p_values->key)) = 'string' then
        -- try parse JSON array encoded as string
        if left(val, 1) = '[' then
          begin
            val := coalesce(
              (
                select string_agg(x, ', ')
                from jsonb_array_elements_text(val::jsonb) as t(x)
              ),
              val
            );
          exception when others then
            null;
          end;
        end if;
      end if;
    exception when others then
      null;
    end;
    result := replace(result, '{{' || key || '}}', val);
  end loop;
  return result;
end;
$$;

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
begin
  if uid is null then
    return null;
  end if;
  nid := 'ntf-' || gen_random_uuid()::text;
  insert into public.notifications (
    id, user_id, title, message, source, rule_id,
    entity_id, record_id, task_id, show_toast
  ) values (
    nid,
    uid,
    coalesce(nullif(btrim(p_title), ''), left(coalesce(p_message, 'Уведомление'), 120)),
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

-- ─── Entity rule dispatcher ────────────────────────────────────────────────

create or replace function public.notification_dispatch_on_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_values jsonb := coalesce(OLD.field_values, '{}'::jsonb);
  new_values jsonb := coalesce(NEW.field_values, '{}'::jsonb);
  rule record;
  matched boolean;
  old_opt text;
  new_opt text;
  recipient_ids text[];
  recipient_id text;
  title text;
  message text;
  depth text;
  actor text;
begin
  depth := coalesce(current_setting('automation.execution_depth', true), '0');
  if depth <> '' and depth::integer > 0 then
    return NEW;
  end if;

  actor := coalesce(auth.uid()::text, '');

  for rule in
    select *
    from public.notification_rules r
    where r.enabled = true
      and r.entity_id = NEW.entity_id
  loop
    matched := false;
    old_opt := '';
    new_opt := '';
    if rule.field_id <> '' then
      old_opt := coalesce(old_values->>rule.field_id, '');
      new_opt := coalesce(new_values->>rule.field_id, '');
    end if;

    if rule.trigger_kind = 'recordCreated' and TG_OP = 'INSERT' then
      matched := true;
    elsif rule.trigger_kind = 'recordUpdated' and TG_OP = 'UPDATE' then
      matched := old_values is distinct from new_values;
    elsif rule.trigger_kind = 'fieldEnter' and TG_OP in ('INSERT', 'UPDATE') then
      matched :=
        new_opt is distinct from old_opt
        and new_opt <> ''
        and (
          rule.option_id = ''
          or rule.option_id = new_opt
          or rule.option_id = any(public.automation_field_ids(new_opt))
        );
    elsif rule.trigger_kind = 'fieldLeave' and TG_OP = 'UPDATE' then
      matched :=
        new_opt is distinct from old_opt
        and old_opt <> ''
        and (
          rule.option_id = ''
          or rule.option_id = old_opt
          or rule.option_id = any(public.automation_field_ids(old_opt))
        );
    elsif rule.trigger_kind = 'fieldTransition' and TG_OP = 'UPDATE' then
      matched :=
        new_opt is distinct from old_opt
        and (
          rule.from_option_id = ''
          or rule.from_option_id = old_opt
          or rule.from_option_id = any(public.automation_field_ids(old_opt))
        )
        and (
          rule.to_option_id = ''
          or rule.to_option_id = new_opt
          or rule.to_option_id = any(public.automation_field_ids(new_opt))
        );
    end if;

    if not matched then
      continue;
    end if;

    if not public.automation_conditions_match(rule.conditions, new_values, old_values) then
      continue;
    end if;

    recipient_ids := public.automation_resolve_assignees(
      rule.recipients,
      new_values,
      nullif(actor, '')
    );

    if cardinality(recipient_ids) = 0 and actor <> '' then
      recipient_ids := array[actor];
    end if;

    title := public.notification_render_template(rule.title_template, new_values);
    message := public.notification_render_template(rule.message_template, new_values);
    if nullif(btrim(title), '') is null then
      title := coalesce(nullif(btrim(rule.name), ''), 'Уведомление');
    end if;
    if nullif(btrim(message), '') is null then
      message := title;
    end if;

    foreach recipient_id in array recipient_ids
    loop
      perform public.create_notification(
        recipient_id,
        title,
        message,
        'rule',
        rule.id,
        NEW.entity_id,
        NEW.id,
        null,
        rule.show_toast
      );
    end loop;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_notification_dispatch_on_record_change on public.entity_records;
create trigger trg_notification_dispatch_on_record_change
  after insert or update of field_values on public.entity_records
  for each row
  execute function public.notification_dispatch_on_record_change();

-- ─── Rewrite automation notification inserts ───────────────────────────────
-- Re-declare spawn / complete / overdue with create_notification.

create or replace function public.automation_spawn_on_record_change()
returns trigger
language plpgsql
security definer
as $$
declare
  old_values jsonb := coalesce(OLD.field_values, '{}'::jsonb);
  new_values jsonb := coalesce(NEW.field_values, '{}'::jsonb);
  proc record;
  scenario record;
  tmpl record;
  old_opt text;
  new_opt text;
  assignee_ids text[];
  assignee_id text;
  task_id text;
  task_name text;
  due timestamptz;
  template_snapshot jsonb;
  entered boolean;
  depth text;
  n_msg text;
begin
  depth := coalesce(current_setting('automation.execution_depth', true), '0');
  if depth <> '' and depth::integer > 0 then
    return NEW;
  end if;

  for proc in
    select *
    from public.automation_processes p
    where p.entity_id = NEW.entity_id
      and p.enabled = true
      and p.trigger_field_id <> ''
  loop
    old_opt := coalesce(old_values->>proc.trigger_field_id, '');
    new_opt := coalesce(new_values->>proc.trigger_field_id, '');

    if TG_OP = 'UPDATE'
       and old_opt <> ''
       and old_opt is distinct from new_opt
    then
      perform public.automation_assert_no_blocking(
        NEW.entity_id,
        NEW.id,
        proc.trigger_field_id,
        (public.automation_field_ids(old_opt))[1]
      );
    end if;

    entered := false;
    if proc.trigger_kind = 'recordCreated' and TG_OP = 'INSERT' then
      entered := true;
    elsif proc.trigger_kind = 'recordUpdated' and TG_OP = 'UPDATE' then
      entered := old_values is distinct from new_values;
    elsif proc.trigger_kind in ('fieldEnter', 'fieldTransition') then
      entered := new_opt is distinct from old_opt and new_opt <> '';
    elsif proc.trigger_kind = 'fieldLeave' then
      entered := new_opt is distinct from old_opt and old_opt <> '';
    end if;

    if not entered then
      continue;
    end if;

    select * into scenario
    from public.automation_scenarios s
    where s.process_id = proc.id
      and s.is_default = false
      and public.automation_conditions_match(s.entry_conditions, new_values, old_values)
    order by s.priority desc, s.created_at asc
    limit 1;

    if scenario.id is null then
      select * into scenario
      from public.automation_scenarios s
      where s.process_id = proc.id
        and s.is_default = true
      order by s.created_at asc
      limit 1;
    end if;

    if scenario.id is null then
      continue;
    end if;

    for tmpl in
      select *
      from public.automation_task_templates t
      where t.scenario_id = scenario.id
        and (
          t.trigger_option_id = ''
          or t.trigger_option_id = new_opt
          or t.trigger_option_id = any(public.automation_field_ids(new_opt))
        )
        and public.automation_conditions_match(t.launch_conditions, new_values, old_values)
    loop
      assignee_ids := public.automation_resolve_assignees(tmpl.assignee, new_values, null);
      if cardinality(assignee_ids) = 0 then
        assignee_ids := array[null::text];
      end if;

      template_snapshot := jsonb_build_object(
        'id', tmpl.id,
        'scenarioId', tmpl.scenario_id,
        'name', tmpl.name,
        'nameTemplate', tmpl.name_template,
        'triggerOptionId', tmpl.trigger_option_id,
        'stepOrder', tmpl.step_order,
        'isBlocking', tmpl.is_blocking,
        'kind', tmpl.kind,
        'launchConditions', tmpl.launch_conditions,
        'assignee', tmpl.assignee,
        'watchers', tmpl.watchers,
        'outcomes', tmpl.outcomes,
        'sla', tmpl.sla,
        'materials', tmpl.materials
      );
      task_name := case
        when nullif(btrim(tmpl.name_template), '') is not null then tmpl.name_template
        else tmpl.name
      end;

      due := null;
      if tmpl.sla is not null and (tmpl.sla->>'hours') is not null then
        begin
          due := now() + ((tmpl.sla->>'hours')::numeric || ' hours')::interval;
        exception when others then
          due := null;
        end;
      end if;

      foreach assignee_id in array assignee_ids
      loop
        task_id := 'atask-' || gen_random_uuid()::text;
        begin
          insert into public.automation_tasks (
            id, process_id, scenario_id, template_id,
            entity_id, record_id, trigger_field_id, trigger_option_id,
            assignee_user_id, status, is_blocking, step_order, name, config, due_at
          ) values (
            task_id,
            proc.id,
            scenario.id,
            tmpl.id,
            NEW.entity_id,
            NEW.id,
            proc.trigger_field_id,
            coalesce(nullif(tmpl.trigger_option_id, ''), new_opt),
            assignee_id,
            'pending',
            tmpl.is_blocking,
            tmpl.step_order,
            task_name,
            template_snapshot,
            due
          );

          for n_msg in
            select coalesce(nullif(r.message_template, ''), 'Назначена задача: ' || task_name)
            from public.automation_notification_rules r
            where r.template_id = tmpl.id
              and r.event = 'assigned'
          loop
            perform public.create_notification(
              coalesce(assignee_id, auth.uid()::text),
              'Назначена задача',
              n_msg,
              'automation',
              null,
              NEW.entity_id,
              NEW.id,
              task_id,
              true
            );
          end loop;
        exception
          when unique_violation then
            null;
        end;
      end loop;
    end loop;
  end loop;

  return NEW;
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
      field_value := coalesce(action->>'value', '');
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

create or replace function public.automation_register_overdue_tasks()
returns integer
language plpgsql
security definer
as $$
declare
  n integer := 0;
  task record;
  ev_id text;
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

    if task.assignee_user_id is not null then
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

-- ─── Drop legacy table ─────────────────────────────────────────────────────

do $$
begin
  begin
    alter publication supabase_realtime drop table public.automation_notifications;
  exception
    when others then null;
  end;
end $$;

drop table if exists public.automation_notifications;

-- ─── Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
