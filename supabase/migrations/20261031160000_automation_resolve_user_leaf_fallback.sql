-- relatedField hop may land on Users rows when «Стадия/отделы» nested slots
-- were filled with managers instead of department catalog ids. Reading
-- Отдел.Руководители on those rows is empty — treat the user record id as the
-- assignee. Also fall back to a catalog «Руководитель(и)» field by name when
-- the configured fieldId is missing on the landed entity.

create or replace function public.automation_resolve_assignees(
  resolver jsonb,
  p_values jsonb,
  auth_user_id text default null,
  p_record_id text default null
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
  relation_field_id text;
  nested_field_id text;
  raw text;
  ids text[];
  creator text;
  user_record_id text;
  auth_uuid uuid;
  branch jsonb;
  nested_resolver jsonb;
  hop_path text[];
  via_elem text;
  fan_out boolean;
  cursors jsonb[] := array[]::jsonb[];
  next_cursors jsonb[] := array[]::jsonb[];
  cursor_values jsonb;
  hop_id text;
  hop_raw text;
  hop_ids text[];
  related_id text;
  related_values jsonb;
  related_entity_id text;
  collected text[] := array[]::text[];
  user_id text;
  hop_index int;
  hop_depth int;
  depths jsonb;
  depth_elem jsonb;
  linked_child jsonb;
  child_entity_id text;
  child_parent_field_id text;
  parent_record_id text;
  child_label text;
  trigger_entity_id text;
  trigger_label text;
  cursor_ids text[] := array[]::text[];
  next_cursor_ids text[] := array[]::text[];
  cursor_id text;
  cursor_entity_id text;
  gip_ids text[];
  manager_field_id text;
  idx int;
begin
  case rtype
    when 'none' then
      return array[]::text[];

    when 'conditional' then
      for branch in
        select value
        from jsonb_array_elements(coalesce(resolver->'branches', '[]'::jsonb)) as t(value)
      loop
        if public.automation_conditions_match(
          coalesce(
            branch->'conditions',
            '{"version":1,"match":"all","rules":[]}'::jsonb
          ),
          coalesce(p_values, '{}'::jsonb),
          coalesce(p_values, '{}'::jsonb)
        ) then
          nested_resolver := coalesce(branch->'resolver', '{"type":"currentUser"}'::jsonb);
          if coalesce(nested_resolver->>'type', '') = 'conditional' then
            nested_resolver := '{"type":"currentUser"}'::jsonb;
          end if;
          return public.automation_resolve_assignees(
            nested_resolver,
            p_values,
            auth_user_id,
            p_record_id
          );
        end if;
      end loop;

      nested_resolver := coalesce(
        resolver->'elseResolver',
        resolver->'else_resolver',
        '{"type":"currentUser"}'::jsonb
      );
      if coalesce(nested_resolver->>'type', '') = 'conditional' then
        nested_resolver := '{"type":"currentUser"}'::jsonb;
      end if;
      return public.automation_resolve_assignees(
        nested_resolver,
        p_values,
        auth_user_id,
        p_record_id
      );

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

    when 'relatedField' then
      relation_field_id := coalesce(
        nullif(trim(coalesce(resolver->>'relationFieldId', '')), ''),
        nullif(trim(coalesce(resolver->>'relation_field_id', '')), '')
      );
      nested_field_id := coalesce(
        nullif(trim(coalesce(resolver->>'fieldId', '')), ''),
        nullif(trim(coalesce(resolver->>'field_id', '')), '')
      );
      linked_child := coalesce(resolver->'linkedChild', resolver->'linked_child');
      if nested_field_id is null then
        return array[]::text[];
      end if;
      if relation_field_id is null and linked_child is null then
        return array[]::text[];
      end if;

      hop_path := array[]::text[];
      if relation_field_id is not null then
        hop_path := array[relation_field_id];
      end if;
      if jsonb_typeof(resolver->'via') = 'array' then
        for via_elem in
          select nullif(trim(x), '')
          from jsonb_array_elements_text(resolver->'via') as t(x)
        loop
          if via_elem is not null then
            hop_path := hop_path || via_elem;
          end if;
        end loop;
      elsif jsonb_typeof(resolver->'relationPath') = 'array' then
        hop_path := array[]::text[];
        for via_elem in
          select nullif(trim(x), '')
          from jsonb_array_elements_text(resolver->'relationPath') as t(x)
        loop
          if via_elem is not null then
            hop_path := hop_path || via_elem;
          end if;
        end loop;
      elsif jsonb_typeof(resolver->'relation_path') = 'array' then
        hop_path := array[]::text[];
        for via_elem in
          select nullif(trim(x), '')
          from jsonb_array_elements_text(resolver->'relation_path') as t(x)
        loop
          if via_elem is not null then
            hop_path := hop_path || via_elem;
          end if;
        end loop;
      end if;

      if cardinality(hop_path) = 0 and linked_child is null then
        return array[]::text[];
      end if;

      depths := coalesce(
        resolver->'relationGroupsDepths',
        resolver->'relation_groups_depths',
        '[]'::jsonb
      );

      fan_out := coalesce(resolver->>'fanOut', resolver->>'fan_out') in ('true', 't', '1');

      select er.entity_id into trigger_entity_id
      from public.entity_records er
      where er.id = nullif(trim(coalesce(p_record_id, '')), '')
      limit 1;
      if trigger_entity_id is not null then
        select lower(replace(
          coalesce(e.definition->>'name', '') || ' ' || coalesce(e.definition->>'namePlural', ''),
          'ё', 'е'
        )) into trigger_label
        from public.entities e
        where e.id = trigger_entity_id
        limit 1;
      end if;

      cursors := array[coalesce(p_values, '{}'::jsonb)];
      cursor_ids := array[nullif(trim(coalesce(p_record_id, '')), '')];

      if linked_child is not null and jsonb_typeof(linked_child) = 'object' then
        child_entity_id := nullif(trim(coalesce(
          linked_child->>'entityId',
          linked_child->>'entity_id',
          ''
        )), '');
        child_parent_field_id := nullif(trim(coalesce(
          linked_child->>'parentFieldId',
          linked_child->>'parent_field_id',
          ''
        )), '');
        parent_record_id := nullif(trim(coalesce(p_record_id, '')), '');
        if child_entity_id is null
           or child_parent_field_id is null
           or parent_record_id is null
        then
          return array[]::text[];
        end if;

        select lower(replace(
          coalesce(e.definition->>'name', '') || ' ' || coalesce(e.definition->>'namePlural', ''),
          'ё', 'е'
        )) into child_label
        from public.entities e
        where e.id = child_entity_id
        limit 1;
        if child_label is not null
           and position('отдел' in child_label) > 0
           and position('расчет' in child_label) > 0
        then
          fan_out := true;
        end if;

        next_cursors := array[]::jsonb[];
        next_cursor_ids := array[]::text[];
        for related_id in
          select er.id
          from public.entity_records er
          where er.entity_id = child_entity_id
            and parent_record_id = any (
              public.automation_field_ids(
                coalesce(er.field_values->>child_parent_field_id, '')
              )
            )
        loop
          select er.field_values
            into related_values
          from public.entity_records er
          where er.id = related_id
          limit 1;
          if related_values is not null then
            next_cursors := next_cursors || related_values;
            next_cursor_ids := next_cursor_ids || related_id;
            if not fan_out then
              exit;
            end if;
          end if;
        end loop;
        cursors := next_cursors;
        cursor_ids := next_cursor_ids;
        if cardinality(cursors) = 0 then
          return array[]::text[];
        end if;
      end if;

      if coalesce(trigger_label, '') like '%разбор%'
         and coalesce(trigger_label, '') like '%ткп%'
         and cardinality(hop_path) > 0
      then
        fan_out := true;
      end if;

      hop_index := 0;
      foreach hop_id in array hop_path
      loop
        hop_index := hop_index + 1;
        hop_depth := null;
        if jsonb_typeof(depths) = 'array' and jsonb_array_length(depths) >= hop_index then
          depth_elem := depths->(hop_index - 1);
          if jsonb_typeof(depth_elem) = 'number' then
            hop_depth := (depth_elem #>> '{}')::int;
          end if;
        end if;

        next_cursors := array[]::jsonb[];
        next_cursor_ids := array[]::text[];
        foreach cursor_values in array cursors
        loop
          hop_raw := coalesce(cursor_values->>hop_id, '');
          hop_ids := public.automation_bridge_record_ids(hop_raw, hop_depth);
          if not fan_out and cardinality(hop_ids) > 1 then
            hop_ids := array[hop_ids[1]];
          end if;
          if cardinality(hop_ids) = 0 then
            continue;
          end if;
          foreach related_id in array hop_ids
          loop
            select er.field_values
              into related_values
            from public.entity_records er
            where er.id = related_id
            limit 1;
            if related_values is not null then
              next_cursors := next_cursors || related_values;
              next_cursor_ids := next_cursor_ids || related_id;
            end if;
          end loop;
        end loop;
        cursors := next_cursors;
        cursor_ids := next_cursor_ids;
        if cardinality(cursors) = 0 then
          return array[]::text[];
        end if;
      end loop;

      collected := array[]::text[];
      idx := 0;
      foreach cursor_values in array cursors
      loop
        idx := idx + 1;
        cursor_id := null;
        if cardinality(cursor_ids) >= idx then
          cursor_id := cursor_ids[idx];
        end if;

        ids := public.automation_field_ids(coalesce(cursor_values->>nested_field_id, ''));

        -- Catalog «Руководитель(и)» by name when configured fieldId is absent/empty.
        if cardinality(ids) = 0 and cursor_id is not null then
          select er.entity_id into cursor_entity_id
          from public.entity_records er
          where er.id = cursor_id
          limit 1;
          if cursor_entity_id is not null then
            select nullif(trim(f->>'id'), '')
              into manager_field_id
            from public.entities e,
                 lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
            where e.id = cursor_entity_id
              and coalesce(f->>'type', '') in ('relation', 'belonging')
              and (
                lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководитель'
                or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководители'
                or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'руководитель %'
              )
            order by case
              when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководитель' then 0
              when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководители' then 1
              else 2
            end
            limit 1;
            if manager_field_id is not null and manager_field_id <> nested_field_id then
              ids := public.automation_field_ids(
                coalesce(cursor_values->>manager_field_id, '')
              );
            end if;
          end if;
        end if;

        -- Users leaf (managers stored as nested ids): the record is the assignee.
        if cardinality(ids) = 0 and cursor_id is not null then
          select er.entity_id into related_entity_id
          from public.entity_records er
          where er.id = cursor_id
          limit 1;
          if related_entity_id = 'entity-system-users' then
            ids := array[cursor_id];
          end if;
        end if;

        if cursor_id is not null
           and public.automation_record_looks_like_gip(cursor_id, cursor_values)
        then
          gip_ids := public.automation_trigger_gip_user_ids(
            nullif(trim(coalesce(p_record_id, '')), ''),
            coalesce(p_values, '{}'::jsonb)
          );
          if cardinality(gip_ids) > 0 then
            ids := gip_ids;
          end if;
        end if;

        if not fan_out and cardinality(ids) > 1 then
          ids := array[ids[1]];
        end if;
        foreach user_id in array ids
        loop
          if user_id is not null
             and btrim(user_id) <> ''
             and not (user_id = any (collected))
          then
            collected := collected || user_id;
          end if;
        end loop;
      end loop;

      return collected;

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
    else
      null;
  end case;

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

grant execute on function public.automation_resolve_assignees(jsonb, jsonb, text, text)
  to authenticated, service_role;

-- Fan-out relatedField: do not create a single unassigned task when resolve
-- returns empty — that hides the data problem and blocks correct re-spawn.
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
  is_silent boolean;
  already boolean;
begin
  if coalesce(p_tmpl.enabled, true) = false then
    return null;
  end if;

  launch_phase := coalesce(nullif(p_tmpl.launch_phase, ''), 'onEnter');
  is_silent := p_tmpl.kind in ('autofill', 'actions');

  if is_silent then
    assignee_ids := array[null::text];
  else
    assignee_ids := public.automation_resolve_assignees(
      p_tmpl.assignee,
      p_values,
      p_actor,
      p_record_id
    );
    if cardinality(assignee_ids) = 0 then
      rtype := coalesce(p_tmpl.assignee->>'type', 'currentUser');
      if rtype in ('currentUser', 'recordCreator') then
        assignee_ids := public.automation_resolve_assignees(
          '{"type":"currentUser"}'::jsonb,
          p_values,
          p_actor,
          p_record_id
        );
      end if;
    end if;
    if cardinality(assignee_ids) = 0 then
      rtype := coalesce(p_tmpl.assignee->>'type', 'currentUser');
      -- relatedField / fan-out: skip null placeholder — fix data / resolve instead.
      if rtype in ('relatedField', 'relationFieldFanOut') then
        return null;
      end if;
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
    'materials', p_tmpl.materials,
    'fieldAccess', coalesce(p_tmpl.field_access, '{}'::jsonb),
    'actions', coalesce(p_tmpl.actions, '[]'::jsonb),
    'viewFieldsPlacement', coalesce(
      nullif(p_tmpl.view_fields_placement, ''),
      'afterSelect'
    )
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
  if is_silent then
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
    select exists (
      select 1
      from public.automation_tasks existing
      where existing.record_id = p_record_id
        and existing.template_id = p_tmpl.id
        and coalesce(existing.assignee_user_id, '') = coalesce(assignee_id, '')
        and existing.status in ('pending', 'returned', 'completed')
    ) into already;
    if already then
      continue;
    end if;

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

    if is_silent then
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

grant execute on function public.automation_spawn_template_for_record(
  public.automation_task_templates, text, text, text, text, text, jsonb, jsonb, text
) to authenticated, service_role;
