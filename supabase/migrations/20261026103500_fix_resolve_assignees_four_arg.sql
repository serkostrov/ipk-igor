-- spawn_template from 20261025120000 calls automation_resolve_assignees(jsonb,jsonb,text,text).
-- Envs that never applied 20261024140000 only have the 3-arg overload → create record
-- fails with «function … (jsonb, jsonb, text, text) does not exist».


create or replace function public.automation_relation_groups_ids_at_depth(
  p_value text,
  p_depth integer
)
returns text[]
language plpgsql
immutable
as $$
declare
  parsed jsonb;
  result text[] := array[]::text[];
  node jsonb;
  node_id text;
  children jsonb;
  nested_ids jsonb;
  nested_id text;
  child jsonb;
  queue jsonb[] := array[]::jsonb[];
  queue_depth int[] := array[]::int[];
  depth int;
  target int;
begin
  if p_value is null or btrim(p_value) = '' then
    return result;
  end if;

  target := greatest(coalesce(p_depth, 0), 0);

  begin
    parsed := p_value::jsonb;
  exception when others then
    return result;
  end;

  if jsonb_typeof(parsed) <> 'array' or jsonb_array_length(parsed) = 0 then
    return result;
  end if;

  for child in select value from jsonb_array_elements(parsed) as t(value)
  loop
    queue := queue || child;
    queue_depth := queue_depth || 0;
  end loop;

  while cardinality(queue) > 0
  loop
    node := queue[1];
    depth := queue_depth[1];
    queue := queue[2:cardinality(queue)];
    queue_depth := queue_depth[2:cardinality(queue_depth)];

    if node is null or jsonb_typeof(node) <> 'object' then
      continue;
    end if;

    node_id := nullif(trim(coalesce(node->>'id', node->>'itemId', '')), '');
    if node_id is null then
      continue;
    end if;

    if depth = target then
      if not (node_id = any (result)) then
        result := result || node_id;
      end if;
      continue;
    end if;

    children := case
      when jsonb_typeof(node->'children') = 'array' then node->'children'
      else '[]'::jsonb
    end;
    nested_ids := case
      when jsonb_typeof(node->'nestedIds') = 'array' then node->'nestedIds'
      else '[]'::jsonb
    end;

    if jsonb_array_length(children) > 0 then
      for child in select value from jsonb_array_elements(children) as t(value)
      loop
        queue := queue || child;
        queue_depth := queue_depth || (depth + 1);
      end loop;
    else
      for nested_id in
        select nullif(trim(x), '')
        from jsonb_array_elements_text(nested_ids) as t(x)
      loop
        if nested_id is null then
          continue;
        end if;
        queue := queue || jsonb_build_object('id', nested_id, 'children', '[]'::jsonb);
        queue_depth := queue_depth || (depth + 1);
      end loop;
    end if;
  end loop;

  return result;
end;
$$;

create or replace function public.automation_bridge_record_ids(
  p_value text,
  p_groups_depth integer default null
)
returns text[]
language plpgsql
immutable
as $$
declare
  parsed jsonb;
  first_elem jsonb;
begin
  if p_value is null or btrim(p_value) = '' then
    return array[]::text[];
  end if;

  begin
    parsed := p_value::jsonb;
  exception when others then
    return public.automation_field_ids(p_value);
  end;

  if jsonb_typeof(parsed) = 'array' and jsonb_array_length(parsed) > 0 then
    first_elem := parsed->0;
    if jsonb_typeof(first_elem) = 'object' then
      if p_groups_depth is not null then
        return public.automation_relation_groups_ids_at_depth(p_value, p_groups_depth);
      end if;
      return public.automation_relation_groups_leaf_ids(p_value);
    end if;
  end if;

  return public.automation_field_ids(p_value);
end;
$$;

drop function if exists public.automation_resolve_assignees(jsonb, jsonb, text);

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
      cursors := array[coalesce(p_values, '{}'::jsonb)];

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

        next_cursors := array[]::jsonb[];
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
            if not fan_out then
              exit;
            end if;
          end if;
        end loop;
        cursors := next_cursors;
        if cardinality(cursors) = 0 then
          return array[]::text[];
        end if;
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
            end if;
          end loop;
        end loop;
        cursors := next_cursors;
        if cardinality(cursors) = 0 then
          return array[]::text[];
        end if;
      end loop;

      collected := array[]::text[];
      foreach cursor_values in array cursors
      loop
        ids := public.automation_field_ids(coalesce(cursor_values->>nested_field_id, ''));
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
