-- Templates can be disabled: skipped at spawn, sequential chain continues.

alter table public.automation_task_templates
  add column if not exists enabled boolean not null default true;

-- ─── Spawn one template (skip when disabled) ───────────────────────────────

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
  if coalesce(p_tmpl.enabled, true) = false then
    return null;
  end if;

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
    'enabled', coalesce(p_tmpl.enabled, true),
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

-- ─── Sequential next: only enabled templates ───────────────────────────────

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

  v_launch_phase := coalesce(
    nullif(p_task.config->>'launchPhase', ''),
    'onEnter'
  );

  select * into rec from public.entity_records where id = p_task.record_id;
  if rec.id is null then
    return null;
  end if;
  values := coalesce(rec.field_values, '{}'::jsonb);

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
    and not exists (
      select 1
      from public.automation_tasks existing
      where existing.record_id = p_task.record_id
        and existing.template_id = t.id
        and existing.status in ('pending', 'returned', 'completed')
    )
  order by t.step_order asc, t.created_at asc
  limit 1;

  if next_tmpl.id is null then
    return null;
  end if;

  return public.automation_spawn_template_for_record(
    next_tmpl,
    p_task.process_id,
    p_task.entity_id,
    p_task.record_id,
    p_task.trigger_field_id,
    p_task.trigger_option_id,
    values,
    values,
    p_actor
  );
end;
$$;

-- ─── Stage enter spawn: skip disabled; earlier = enabled only ──────────────

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
  list_options jsonb;
  next_option_id text;
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
      order by s.created_at asc
      limit 1;
    end if;

    if not found then
      continue;
    end if;

    next_option_id := null;
    select coalesce(
      (
        select f->'listOptions'
        from public.entities e
        cross join lateral jsonb_array_elements(
          coalesce(e.definition->'fields', '[]'::jsonb)
        ) as f
        where e.id = NEW.entity_id
          and f->>'id' = proc.trigger_field_id
        limit 1
      ),
      '[]'::jsonb
    ) into list_options;

    select opts.opt->>'id' into next_option_id
    from jsonb_array_elements(list_options) with ordinality as opts(opt, ord)
    where exists (
      select 1
      from jsonb_array_elements(list_options) with ordinality as cur(opt, ord)
      where coalesce(cur.opt->>'id', '') in (new_opt_id, new_opt)
        and cur.ord + 1 = opts.ord
    )
    limit 1;

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
              (
                next_option_id is not null
                and t.trigger_option_id = next_option_id
              )
              or exists (
                select 1
                from jsonb_array_elements(
                  coalesce(scenario.stage_transitions, '[]'::jsonb)
                ) st
                where coalesce(st->>'fromOptionId', st->>'from_option_id', '')
                      in (new_opt_id, new_opt)
                  and coalesce(st->>'toOptionId', st->>'to_option_id', '')
                      = t.trigger_option_id
              )
            )
          )
        )
      order by t.step_order asc, t.created_at asc
    loop
      v_launch_phase := coalesce(nullif(tmpl.launch_phase, ''), 'onEnter');
      store_on_prev := v_launch_phase = 'beforeEnter';

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
            and earlier.step_order < tmpl.step_order
            and public.automation_conditions_match(
              earlier.launch_conditions,
              new_values,
              old_values
            )
        ) into has_earlier;
        if has_earlier then
          continue;
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

-- ─── beforeEnter prep: skip disabled ───────────────────────────────────────

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
      order by s.created_at asc
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
  to authenticated;
grant execute on function public.automation_ensure_before_enter_prep(text, text)
  to service_role;
