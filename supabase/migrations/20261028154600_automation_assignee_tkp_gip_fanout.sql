-- Assignees for «Разбор ТКП» / «Расчёты отделов»:
-- one task per department head, and «ГИП» uses the lead’s ГИП users.

create or replace function public.automation_record_looks_like_gip(
  p_record_id text,
  p_values jsonb default null
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  vals jsonb := coalesce(p_values, '{}'::jsonb);
  v text;
  leaf_id text;
  leaf_vals jsonb;
  norm text;
begin
  if p_record_id is not null and btrim(p_record_id) <> '' and p_values is null then
    select er.field_values into vals
    from public.entity_records er
    where er.id = p_record_id
    limit 1;
  end if;
  vals := coalesce(vals, '{}'::jsonb);

  for v in select value from jsonb_each_text(vals) as t(key, value)
  loop
    norm := lower(replace(btrim(coalesce(v, '')), 'ё', 'е'));
    if norm = 'гип' or norm like 'гип %' then
      return true;
    end if;
  end loop;

  -- «Расчёты отделов» row: relationGroups leaf points at department «ГИП».
  for v in select value from jsonb_each_text(vals) as t(key, value)
  loop
    if v is null or btrim(v) = '' or left(btrim(v), 1) not in ('[', '{') then
      continue;
    end if;
    begin
      for leaf_id in
        select x
        from unnest(public.automation_bridge_record_ids(v, null)) as t(x)
      loop
        select er.field_values into leaf_vals
        from public.entity_records er
        where er.id = leaf_id
        limit 1;
        if leaf_vals is null then
          continue;
        end if;
        for v in select value from jsonb_each_text(leaf_vals) as t2(key, value)
        loop
          norm := lower(replace(btrim(coalesce(v, '')), 'ё', 'е'));
          if norm = 'гип' or norm like 'гип %' then
            return true;
          end if;
        end loop;
      end loop;
    exception when others then
      null;
    end;
  end loop;

  return false;
end;
$$;

create or replace function public.automation_trigger_gip_user_ids(
  p_record_id text,
  p_values jsonb default '{}'::jsonb
) returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  trigger_entity_id text;
  gip_field_id text;
  live jsonb := '{}'::jsonb;
  merged jsonb := '{}'::jsonb;
  k text;
  v text;
  draft text;
begin
  if p_record_id is null or btrim(p_record_id) = '' then
    return array[]::text[];
  end if;

  select er.entity_id, coalesce(er.field_values, '{}'::jsonb)
    into trigger_entity_id, live
  from public.entity_records er
  where er.id = p_record_id
  limit 1;
  if trigger_entity_id is null then
    return array[]::text[];
  end if;

  select nullif(trim(f->>'id'), '')
    into gip_field_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = trigger_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гипы'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'гип %'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип' then 0
    else 1
  end
  limit 1;

  if gip_field_id is null then
    return array[]::text[];
  end if;

  merged := coalesce(live, '{}'::jsonb);
  for k, draft in
    select key, value from jsonb_each_text(coalesce(p_values, '{}'::jsonb)) as t(key, value)
  loop
    if draft is not null and btrim(draft) <> '' then
      merged := jsonb_set(merged, array[k], to_jsonb(draft), true);
    end if;
  end loop;

  return public.automation_field_ids(coalesce(merged->>gip_field_id, ''));
end;
$$;

grant execute on function public.automation_record_looks_like_gip(text, jsonb)
  to authenticated, service_role;
grant execute on function public.automation_trigger_gip_user_ids(text, jsonb)
  to authenticated, service_role;


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
  gip_ids text[];
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

      -- Product: «Разбор ТКП» → stages/departments or «Расчёты отделов» — task per head.
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

      -- Optional first hop: child records of a linked-entity tab.
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

      -- «Разбор ТКП» + relationGroups hops → one assignee per nested department.
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

        -- «ГИП» department (or calc row titled/containing ГИП) → lead «ГИП» users.
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

grant execute on function public.automation_resolve_assignees(jsonb, jsonb, text, text)
  to authenticated, service_role;
