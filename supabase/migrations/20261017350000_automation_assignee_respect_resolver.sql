-- Fix assignee: respect template «Поле связи» / role / fixed users.
-- 1) Do not rewrite empty field/role resolves to currentUser (sysadmin actor).
-- 2) Harden fieldId / roleId key aliases.
-- 3) Merge-update entity field_values so partial patches cannot wipe Manager.

-- Resolve assignees: field/role/fixedUsers never silently become currentUser.
-- Accept camelCase and snake_case keys for fieldId / roleId.

create or replace function public.automation_resolve_assignees(
  resolver jsonb,
  p_values jsonb,
  auth_user_id text default null
) returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rtype text := coalesce(resolver->>'type', 'currentUser');
  field_id text;
  role_id text;
  raw text;
  ids text[];
  creator text;
  user_record_id text;
  auth_uuid uuid;
begin
  case rtype
    when 'fixedUsers' then
      return coalesce(
        (select array_agg(x) from jsonb_array_elements_text(
          coalesce(resolver->'userIds', resolver->'user_ids', '[]'::jsonb)
        ) as t(x)),
        array[]::text[]
      );

    when 'field' then
      field_id := coalesce(
        nullif(trim(coalesce(resolver->>'fieldId', '')), ''),
        nullif(trim(coalesce(resolver->>'field_id', '')), '')
      );
      if field_id is null then
        return array[]::text[];
      end if;
      raw := coalesce(p_values->>field_id, '');
      ids := public.automation_field_ids(raw);
      if cardinality(ids) > 0 then
        return array[ids[1]];
      end if;
      return array[]::text[];

    when 'relationFieldFanOut' then
      field_id := coalesce(
        nullif(trim(coalesce(resolver->>'fieldId', '')), ''),
        nullif(trim(coalesce(resolver->>'field_id', '')), '')
      );
      if field_id is null then
        return array[]::text[];
      end if;
      raw := coalesce(p_values->>field_id, '');
      return public.automation_field_ids(raw);

    when 'role' then
      role_id := coalesce(
        nullif(trim(coalesce(resolver->>'roleId', '')), ''),
        nullif(trim(coalesce(resolver->>'role_id', '')), '')
      );
      if role_id is null then
        return array[]::text[];
      end if;
      select coalesce(array_agg(er.id order by er.id), array[]::text[])
      into ids
      from public.entity_records er
      where er.entity_id = 'entity-system-users'
        and coalesce(er.field_values->>'field-system-users-role', '') = role_id;
      return ids;

    when 'recordCreator' then
      creator := coalesce(p_values->>'__createdByUserId', p_values->>'createdBy', '');
      if creator <> '' then
        return array[creator];
      end if;
      -- fall through to current user
    else
      null;
  end case;

  -- currentUser / recordCreator fallback
  begin
    if auth_user_id is not null and length(trim(auth_user_id)) > 0 then
      begin
        auth_uuid := auth_user_id::uuid;
      exception when others then
        auth_uuid := null;
      end;
      if auth_uuid is not null then
        select er.id into user_record_id
        from public.entity_records er
        where er.entity_id = 'entity-system-users'
          and er.auth_user_id = auth_uuid
        limit 1;
        if user_record_id is not null then
          return array[user_record_id];
        end if;
        return array[trim(auth_user_id)];
      end if;
      return array[trim(auth_user_id)];
    end if;

    if auth.uid() is not null then
      select er.id into user_record_id
      from public.entity_records er
      where er.entity_id = 'entity-system-users'
        and er.auth_user_id = auth.uid()
      limit 1;
      if user_record_id is not null then
        return array[user_record_id];
      end if;
      return array[auth.uid()::text];
    end if;
  exception when others then
    null;
  end;

  return array[]::text[];
end;
$$;

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
  n_msg text;
  first_task_id text := null;
begin
  launch_phase := coalesce(nullif(p_tmpl.launch_phase, ''), 'onEnter');

  if p_tmpl.kind = 'autofill' then
    assignee_ids := array[null::text];
  else
    assignee_ids := public.automation_resolve_assignees(p_tmpl.assignee, p_values, p_actor);
    -- Only fall back to currentUser when the template itself asks for it
    -- (or recordCreator with no creator). Explicit field/role/fixedUsers
    -- must stay empty → unassigned, never silently rewrite to the actor.
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
      for n_msg in
        select coalesce(nullif(r.message_template, ''), 'Назначена задача: ' || task_name)
        from public.automation_notification_rules r
        where r.template_id = p_tmpl.id
          and r.event = 'assigned'
      loop
        perform public.create_notification(
          coalesce(assignee_id, auth.uid()::text),
          'Назначена задача',
          n_msg,
          'automation',
          null,
          p_entity_id,
          p_record_id,
          task_id,
          true
        );
      end loop;
    exception when others then
      raise warning 'automation spawn notify failed: %', sqlerrm;
    end;
  end loop;

  return first_task_id;
end;
$$;

-- After a sequential task completes, spawn the next template on the same stage/phase.

-- Merge patch into field_values (do not replace the whole object).
-- Prevents partial writers from wiping assignee fields like «Менеджер».

create or replace function public.update_entity_record_values(
  p_record_id text,
  p_patch jsonb
) returns public.entity_records
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.entity_records;
  patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if p_record_id is null or btrim(p_record_id) = '' then
    raise exception 'record id required';
  end if;
  if jsonb_typeof(patch) <> 'object' then
    raise exception 'patch must be a jsonb object';
  end if;

  update public.entity_records er
  set
    field_values = coalesce(er.field_values, '{}'::jsonb) || patch,
    updated_at = now()
  where er.id = p_record_id
  returning * into row;

  if row.id is null then
    raise exception 'Record not found';
  end if;
  return row;
end;
$$;

grant execute on function public.update_entity_record_values(text, jsonb) to authenticated;
grant execute on function public.update_entity_record_values(text, jsonb) to service_role;

