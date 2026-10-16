-- Automation core: config + runtime + conditions + spawn + blocking.
-- Domainless: processes bind to entity_id + list trigger_field_id.

-- ─── Config ───────────────────────────────────────────────────────────────

create table if not exists public.automation_processes (
  id text primary key,
  name text not null,
  description text not null default '',
  entity_id text not null,
  trigger_field_id text not null default '',
  trigger_kind text not null default 'fieldEnter',
  enabled boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_processes_entity_id_idx
  on public.automation_processes (entity_id);

create table if not exists public.automation_scenarios (
  id text primary key,
  process_id text not null references public.automation_processes (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  entry_conditions jsonb not null default '{"version":1,"match":"all","rules":[]}'::jsonb,
  priority integer not null default 0,
  canvas_layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_scenarios_process_id_idx
  on public.automation_scenarios (process_id);

create table if not exists public.automation_task_templates (
  id text primary key,
  scenario_id text not null references public.automation_scenarios (id) on delete cascade,
  name text not null,
  name_template text not null default '',
  trigger_option_id text not null default '',
  step_order integer not null default 0,
  is_blocking boolean not null default false,
  kind text not null default 'decision',
  launch_conditions jsonb not null default '{"version":1,"match":"all","rules":[]}'::jsonb,
  assignee jsonb not null default '{"type":"currentUser"}'::jsonb,
  watchers jsonb not null default '{"type":"currentUser"}'::jsonb,
  outcomes jsonb not null default '[]'::jsonb,
  sla jsonb,
  materials jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_task_templates_scenario_id_idx
  on public.automation_task_templates (scenario_id);
create index if not exists automation_task_templates_trigger_option_idx
  on public.automation_task_templates (trigger_option_id);

create table if not exists public.automation_notification_rules (
  id text primary key,
  template_id text not null references public.automation_task_templates (id) on delete cascade,
  event text not null default 'assigned',
  recipients jsonb not null default '{"type":"currentUser"}'::jsonb,
  conditions jsonb not null default '{"version":1,"match":"all","rules":[]}'::jsonb,
  message_template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_notification_rules_template_id_idx
  on public.automation_notification_rules (template_id);

-- ─── Runtime ──────────────────────────────────────────────────────────────

create table if not exists public.automation_tasks (
  id text primary key,
  process_id text not null references public.automation_processes (id) on delete cascade,
  scenario_id text not null references public.automation_scenarios (id) on delete cascade,
  template_id text not null references public.automation_task_templates (id) on delete cascade,
  entity_id text not null,
  record_id text not null,
  trigger_field_id text not null default '',
  trigger_option_id text not null default '',
  assignee_user_id text,
  status text not null default 'pending',
  outcome_id text,
  is_blocking boolean not null default false,
  step_order integer not null default 0,
  name text not null default '',
  config jsonb not null default '{}'::jsonb,
  due_at timestamptz,
  parent_task_id text references public.automation_tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists automation_tasks_spawn_uidx
  on public.automation_tasks (
    record_id,
    template_id,
    trigger_option_id,
    (coalesce(assignee_user_id, ''))
  )
  where status in ('pending', 'returned');

create index if not exists automation_tasks_record_id_idx
  on public.automation_tasks (record_id);
create index if not exists automation_tasks_assignee_status_idx
  on public.automation_tasks (assignee_user_id, status);
create index if not exists automation_tasks_entity_record_idx
  on public.automation_tasks (entity_id, record_id);

create table if not exists public.automation_task_watchers (
  task_id text not null references public.automation_tasks (id) on delete cascade,
  user_id text not null,
  primary key (task_id, user_id)
);

create table if not exists public.automation_task_comments (
  id text primary key,
  task_id text not null references public.automation_tasks (id) on delete cascade,
  author_user_id text,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.automation_task_attachments (
  id text primary key,
  task_id text not null references public.automation_tasks (id) on delete cascade,
  file_path text not null,
  file_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.automation_task_sla_events (
  id text primary key,
  task_id text not null references public.automation_tasks (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.automation_task_time_sessions (
  id text primary key,
  task_id text not null references public.automation_tasks (id) on delete cascade,
  user_id text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds integer not null default 0
);

create table if not exists public.automation_runs (
  id text primary key,
  cause text not null,
  entity_id text not null,
  record_id text not null,
  task_id text,
  actions_log jsonb not null default '[]'::jsonb,
  status text not null default 'ok',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists automation_runs_record_id_idx
  on public.automation_runs (record_id);

create table if not exists public.automation_notifications (
  id text primary key,
  user_id text not null,
  task_id text references public.automation_tasks (id) on delete set null,
  message text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists automation_notifications_user_id_idx
  on public.automation_notifications (user_id, created_at desc);

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.automation_processes enable row level security;
alter table public.automation_scenarios enable row level security;
alter table public.automation_task_templates enable row level security;
alter table public.automation_notification_rules enable row level security;
alter table public.automation_tasks enable row level security;
alter table public.automation_task_watchers enable row level security;
alter table public.automation_task_comments enable row level security;
alter table public.automation_task_attachments enable row level security;
alter table public.automation_task_sla_events enable row level security;
alter table public.automation_task_time_sessions enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_notifications enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'automation_processes',
    'automation_scenarios',
    'automation_task_templates',
    'automation_notification_rules',
    'automation_tasks',
    'automation_task_watchers',
    'automation_task_comments',
    'automation_task_attachments',
    'automation_task_sla_events',
    'automation_task_time_sessions',
    'automation_runs',
    'automation_notifications'
  ]
  loop
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
exception
  when duplicate_object then null;
end $$;

-- ─── Conditions match (TS parity) ──────────────────────────────────────────

create or replace function public.automation_field_ids(value text)
returns text[]
language plpgsql
immutable
as $$
declare
  parsed jsonb;
begin
  if value is null or btrim(value) = '' then
    return array[]::text[];
  end if;
  begin
    parsed := value::jsonb;
    if jsonb_typeof(parsed) = 'array' then
      return coalesce(
        (select array_agg(x) from jsonb_array_elements_text(parsed) as t(x)),
        array[]::text[]
      );
    end if;
  exception when others then
    null;
  end;
  if position(',' in value) > 0 then
    return array(select btrim(x) from unnest(string_to_array(value, ',')) as x where btrim(x) <> '');
  end if;
  return array[btrim(value)];
end;
$$;

create or replace function public.automation_condition_rule_match(
  rule jsonb,
  p_values jsonb,
  previous_values jsonb
) returns boolean
language plpgsql
immutable
as $$
declare
  field_id text := coalesce(rule->>'fieldId', '');
  op text := coalesce(rule->>'operator', '');
  current text := coalesce(p_values->>field_id, '');
  previous text := coalesce(previous_values->>field_id, '');
  current_ids text[] := public.automation_field_ids(current);
  wanted text[];
  rule_value text := rule->>'value';
  left_n numeric;
  right_n numeric;
  from_v text;
  to_v text;
begin
  if field_id = '' or op = '' then
    return true;
  end if;

  if jsonb_typeof(rule->'values') = 'array' then
    wanted := coalesce(
      (select array_agg(x) from jsonb_array_elements_text(rule->'values') as t(x)),
      array[]::text[]
    );
  elsif rule_value is not null and rule_value <> '' then
    wanted := array[rule_value];
  else
    wanted := array[]::text[];
  end if;

  case op
    when 'empty' then
      return current = '' or cardinality(current_ids) = 0;
    when 'notEmpty' then
      return current <> '';
    when 'equals' then
      return current = coalesce(rule_value, '') or coalesce(rule_value, '') = any(current_ids);
    when 'notEquals' then
      return current <> coalesce(rule_value, '') and not (coalesce(rule_value, '') = any(current_ids));
    when 'contains' then
      return position(lower(coalesce(rule_value, '')) in lower(current)) > 0;
    when 'notContains' then
      return position(lower(coalesce(rule_value, '')) in lower(current)) = 0;
    when 'gt', 'gte', 'lt', 'lte' then
      begin
        left_n := replace(current, ',', '.')::numeric;
        right_n := replace(coalesce(rule_value, ''), ',', '.')::numeric;
      exception when others then
        return false;
      end;
      if op = 'gt' then return left_n > right_n; end if;
      if op = 'gte' then return left_n >= right_n; end if;
      if op = 'lt' then return left_n < right_n; end if;
      return left_n <= right_n;
    when 'in' then
      return exists (select 1 from unnest(wanted) w where w = current or w = any(current_ids));
    when 'notIn' then
      return not exists (select 1 from unnest(wanted) w where w = current or w = any(current_ids));
    when 'includesAny' then
      return exists (select 1 from unnest(wanted) w where w = any(current_ids));
    when 'includesAll' then
      return wanted <@ current_ids;
    when 'true' then
      return current = 'true';
    when 'false' then
      return current is distinct from 'true';
    when 'fieldChanged' then
      return current is distinct from previous;
    when 'fieldTransition' then
      begin
        from_v := rule_value::jsonb->>'from';
        to_v := rule_value::jsonb->>'to';
      exception when others then
        to_v := rule_value;
        from_v := null;
      end;
      if from_v is not null and from_v <> '' and previous is distinct from from_v then
        return false;
      end if;
      if to_v is not null and to_v <> '' and current is distinct from to_v and not (to_v = any(current_ids)) then
        return false;
      end if;
      return current is distinct from previous;
    else
      return true;
  end case;
end;
$$;

create or replace function public.automation_conditions_match(
  conditions jsonb,
  p_values jsonb,
  previous_values jsonb default '{}'::jsonb
) returns boolean
language plpgsql
immutable
as $$
declare
  match_mode text := coalesce(conditions->>'match', 'all');
  rules jsonb := coalesce(conditions->'rules', '[]'::jsonb);
  rule jsonb;
  node_kind text;
  group_match text;
  group_rules jsonb;
  group_rule jsonb;
  any_ok boolean;
  all_ok boolean;
begin
  if rules is null or jsonb_typeof(rules) <> 'array' or jsonb_array_length(rules) = 0 then
    return true;
  end if;

  if match_mode = 'any' then
    for rule in select * from jsonb_array_elements(rules)
    loop
      node_kind := coalesce(rule->>'kind', 'rule');
      if node_kind = 'group' then
        group_match := coalesce(rule->>'match', 'all');
        group_rules := coalesce(rule->'rules', '[]'::jsonb);
        if group_match = 'any' then
          any_ok := false;
          for group_rule in select * from jsonb_array_elements(group_rules)
          loop
            if public.automation_condition_rule_match(group_rule, p_values, previous_values) then
              any_ok := true;
              exit;
            end if;
          end loop;
          if any_ok or jsonb_array_length(group_rules) = 0 then
            return true;
          end if;
        else
          all_ok := true;
          for group_rule in select * from jsonb_array_elements(group_rules)
          loop
            if not public.automation_condition_rule_match(group_rule, p_values, previous_values) then
              all_ok := false;
              exit;
            end if;
          end loop;
          if all_ok then
            return true;
          end if;
        end if;
      else
        if public.automation_condition_rule_match(rule, p_values, previous_values) then
          return true;
        end if;
      end if;
    end loop;
    return false;
  end if;

  -- match = all
  for rule in select * from jsonb_array_elements(rules)
  loop
    node_kind := coalesce(rule->>'kind', 'rule');
    if node_kind = 'group' then
      group_match := coalesce(rule->>'match', 'all');
      group_rules := coalesce(rule->'rules', '[]'::jsonb);
      if group_match = 'any' then
        any_ok := jsonb_array_length(group_rules) = 0;
        for group_rule in select * from jsonb_array_elements(group_rules)
        loop
          if public.automation_condition_rule_match(group_rule, p_values, previous_values) then
            any_ok := true;
            exit;
          end if;
        end loop;
        if not any_ok then
          return false;
        end if;
      else
        for group_rule in select * from jsonb_array_elements(group_rules)
        loop
          if not public.automation_condition_rule_match(group_rule, p_values, previous_values) then
            return false;
          end if;
        end loop;
      end if;
    else
      if not public.automation_condition_rule_match(rule, p_values, previous_values) then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

-- ─── Blocking guard ────────────────────────────────────────────────────────

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
begin
  select count(*)::integer into pending_count
  from public.automation_tasks t
  where t.entity_id = p_entity_id
    and t.record_id = p_record_id
    and t.trigger_field_id = p_trigger_field_id
    and t.trigger_option_id = p_current_option_id
    and t.status = 'pending'
    and t.is_blocking = true;

  if pending_count > 0 then
    raise exception 'AUTOMATION_BLOCKED: Сначала выполните блокирующие задачи автоматизации (%).', pending_count
      using errcode = 'P0001';
  end if;
end;
$$;

-- ─── Resolve assignee user ids from jsonb resolver ─────────────────────────

create or replace function public.automation_resolve_assignees(
  resolver jsonb,
  p_values jsonb,
  auth_user_id text default null
) returns text[]
language plpgsql
stable
as $$
declare
  rtype text := coalesce(resolver->>'type', 'currentUser');
  field_id text;
  raw text;
  ids text[];
  creator text;
begin
  case rtype
    when 'fixedUsers' then
      return coalesce(
        (select array_agg(x) from jsonb_array_elements_text(resolver->'userIds') as t(x)),
        array[]::text[]
      );
    when 'field', 'relationFieldFanOut' then
      field_id := coalesce(resolver->>'fieldId', '');
      raw := coalesce(p_values->>field_id, '');
      ids := public.automation_field_ids(raw);
      return ids;
    when 'recordCreator' then
      -- Prefer explicit system field if present; else empty (client fills).
      creator := coalesce(p_values->>'__createdByUserId', p_values->>'createdBy', '');
      if creator <> '' then
        return array[creator];
      end if;
      if auth_user_id is not null then
        return array[auth_user_id];
      end if;
      return array[]::text[];
    else
      if auth_user_id is not null then
        return array[auth_user_id];
      end if;
      return array[]::text[];
  end case;
end;
$$;

-- ─── Spawn on record change ────────────────────────────────────────────────

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
begin
  -- Anti-loop: skip when executor marks the write.
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

    -- Blocking: leaving current option while pending blocking tasks.
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

    -- Pick scenario: first matching non-default by priority, else default.
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

      -- CamelCase snapshot for TS normalizeAutomationTaskTemplate.
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

          -- Notification rules: assigned
          insert into public.automation_notifications (id, user_id, task_id, message)
          select
            'anot-' || gen_random_uuid()::text,
            coalesce(assignee_id, auth.uid()::text),
            task_id,
            coalesce(nullif(r.message_template, ''), 'Назначена задача: ' || task_name)
          from public.automation_notification_rules r
          where r.template_id = tmpl.id
            and r.event = 'assigned'
            and coalesce(assignee_id, auth.uid()::text) is not null;
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

drop trigger if exists trg_automation_spawn_on_record_change on public.entity_records;
create trigger trg_automation_spawn_on_record_change
  after insert or update of field_values on public.entity_records
  for each row
  execute function public.automation_spawn_on_record_change();

-- ─── Complete task (basic) ─────────────────────────────────────────────────

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
begin
  select * into task from public.automation_tasks where id = p_task_id for update;
  if task.id is null then
    raise exception 'Task not found';
  end if;
  if task.status <> 'pending' and task.status <> 'returned' then
    raise exception 'Task is not pending';
  end if;

  -- Sequential blocking order.
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
    -- single-outcome fallback: first outcome
    select o into outcome
    from jsonb_array_elements(coalesce(task.config->'outcomes', '[]'::jsonb)) as o
    limit 1;
  end if;

  if outcome is null then
    raise exception 'Outcome not found';
  end if;

  actions := coalesce(outcome->'actions', '[]'::jsonb);

  select * into rec from public.entity_records where id = task.record_id for update;
  if rec.id is null then
    raise exception 'Record not found';
  end if;

  perform set_config('automation.execution_depth', '1', true);

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
        -- Previous value from TG isn't available here; leave for client executor.
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

  -- Notification rules: completed
  if task.assignee_user_id is not null then
    insert into public.automation_notifications (id, user_id, task_id, message)
    select
      'anot-' || gen_random_uuid()::text,
      task.assignee_user_id,
      task.id,
      coalesce(nullif(r.message_template, ''), 'Завершена задача: ' || task.name)
    from public.automation_notification_rules r
    where r.template_id = task.template_id
      and r.event = 'completed';
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

create or replace function public.return_automation_task_for_revision(
  p_task_id text,
  p_actor_user_id text default null
) returns text
language plpgsql
security definer
as $$
declare
  task public.automation_tasks%rowtype;
  new_id text;
begin
  select * into task from public.automation_tasks where id = p_task_id for update;
  if task.id is null then
    raise exception 'Task not found';
  end if;

  update public.automation_tasks
  set status = 'returned', updated_at = now()
  where id = task.id;

  new_id := 'atask-' || gen_random_uuid()::text;
  insert into public.automation_tasks (
    id, process_id, scenario_id, template_id,
    entity_id, record_id, trigger_field_id, trigger_option_id,
    assignee_user_id, status, is_blocking, step_order, name, config, due_at, parent_task_id
  ) values (
    new_id,
    task.process_id,
    task.scenario_id,
    task.template_id,
    task.entity_id,
    task.record_id,
    task.trigger_field_id,
    task.trigger_option_id,
    task.assignee_user_id,
    'pending',
    task.is_blocking,
    task.step_order,
    task.name,
    task.config,
    task.due_at,
    task.id
  );

  return new_id;
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
      insert into public.automation_notifications (id, user_id, task_id, message)
      values (
        'anot-' || gen_random_uuid()::text,
        task.assignee_user_id,
        task.id,
        'Просрочена задача: ' || task.name
      );
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Realtime for tasks inbox
do $$
begin
  alter publication supabase_realtime add table public.automation_tasks;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.automation_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
