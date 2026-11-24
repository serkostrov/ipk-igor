-- Automation conditions (incl. conditional assignee) previously read only raw
-- field_values[fieldId]. Lookup fields like «Отдел менеджера» are computed in
-- the UI from a bridge (Менеджер → Users.Отдел) and are usually empty in
-- field_values — so «equals Отдел ЛИНК» never matched and ИНАЧЕ always won.
--
-- Materialize lookup ids into the values map before condition evaluation.

create or replace function public.automation_entity_field_def(
  p_entity_id text,
  p_field_id text
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select f
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = p_entity_id
    and f->>'id' = p_field_id
  limit 1;
$$;

create or replace function public.automation_lookup_field_ids(
  p_entity_id text,
  p_field_id text,
  p_values jsonb,
  p_depth integer default 0
) returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  field_def jsonb;
  field_type text;
  lookup jsonb;
  bridge_field_id text;
  target_field_id text;
  via_field_id text;
  groups_depth integer;
  via_groups_depth integer;
  bridge_ids text[];
  bridge_id text;
  bridge_entity_id text;
  bridge_values jsonb;
  via_ids text[];
  via_id text;
  via_values jsonb;
  via_entity_id text;
  leaf_entity_id text;
  leaf_values jsonb;
  target_def jsonb;
  target_type text;
  target_raw text;
  target_ids text[];
  collected text[] := array[]::text[];
  item text;
begin
  if p_entity_id is null or btrim(p_entity_id) = '' then
    return array[]::text[];
  end if;
  if p_field_id is null or btrim(p_field_id) = '' then
    return array[]::text[];
  end if;
  if p_depth > 6 then
    return array[]::text[];
  end if;

  field_def := public.automation_entity_field_def(p_entity_id, p_field_id);
  if field_def is null then
    return public.automation_field_ids(coalesce(p_values->>p_field_id, ''));
  end if;

  field_type := coalesce(field_def->>'type', '');
  if field_type is distinct from 'lookup' then
    return public.automation_field_ids(coalesce(p_values->>p_field_id, ''));
  end if;

  lookup := field_def->'lookup';
  if lookup is null or jsonb_typeof(lookup) <> 'object' then
    return public.automation_field_ids(coalesce(p_values->>p_field_id, ''));
  end if;

  bridge_field_id := nullif(trim(coalesce(lookup->>'relationFieldId', '')), '');
  target_field_id := nullif(trim(coalesce(lookup->>'targetFieldId', '')), '');
  via_field_id := nullif(trim(coalesce(lookup->>'viaFieldId', '')), '');
  if bridge_field_id is null or target_field_id is null then
    return public.automation_field_ids(coalesce(p_values->>p_field_id, ''));
  end if;

  begin
    groups_depth := (lookup->>'relationGroupsDepth')::int;
  exception when others then
    groups_depth := null;
  end;
  begin
    via_groups_depth := (lookup->>'viaRelationGroupsDepth')::int;
  exception when others then
    via_groups_depth := null;
  end;

  bridge_ids := public.automation_bridge_record_ids(
    coalesce(p_values->>bridge_field_id, ''),
    groups_depth
  );
  if cardinality(bridge_ids) = 0 then
    -- Manual override on the lookup key itself (rare).
    return public.automation_field_ids(coalesce(p_values->>p_field_id, ''));
  end if;

  foreach bridge_id in array bridge_ids
  loop
    select er.entity_id, er.field_values
      into bridge_entity_id, bridge_values
    from public.entity_records er
    where er.id = bridge_id
    limit 1;
    if bridge_values is null then
      continue;
    end if;

    if via_field_id is null then
      leaf_entity_id := bridge_entity_id;
      leaf_values := bridge_values;
      target_def := public.automation_entity_field_def(leaf_entity_id, target_field_id);
      target_type := coalesce(target_def->>'type', '');
      if target_type = 'lookup' then
        foreach item in array public.automation_lookup_field_ids(
          leaf_entity_id,
          target_field_id,
          leaf_values,
          p_depth + 1
        )
        loop
          if item is not null and btrim(item) <> '' and not (item = any (collected)) then
            collected := collected || item;
          end if;
        end loop;
      else
        target_raw := coalesce(leaf_values->>target_field_id, '');
        target_ids := public.automation_field_ids(target_raw);
        if cardinality(target_ids) = 0 and btrim(target_raw) <> '' then
          target_ids := array[btrim(target_raw)];
        end if;
        foreach item in array target_ids
        loop
          if item is not null and btrim(item) <> '' and not (item = any (collected)) then
            collected := collected || item;
          end if;
        end loop;
      end if;
    else
      via_ids := public.automation_bridge_record_ids(
        coalesce(bridge_values->>via_field_id, ''),
        via_groups_depth
      );
      foreach via_id in array via_ids
      loop
        select er.entity_id, er.field_values
          into via_entity_id, via_values
        from public.entity_records er
        where er.id = via_id
        limit 1;
        if via_values is null then
          continue;
        end if;
        leaf_entity_id := via_entity_id;
        leaf_values := via_values;
        target_def := public.automation_entity_field_def(leaf_entity_id, target_field_id);
        target_type := coalesce(target_def->>'type', '');
        if target_type = 'lookup' then
          foreach item in array public.automation_lookup_field_ids(
            leaf_entity_id,
            target_field_id,
            leaf_values,
            p_depth + 1
          )
          loop
            if item is not null and btrim(item) <> '' and not (item = any (collected)) then
              collected := collected || item;
            end if;
          end loop;
        else
          target_raw := coalesce(leaf_values->>target_field_id, '');
          target_ids := public.automation_field_ids(target_raw);
          if cardinality(target_ids) = 0 and btrim(target_raw) <> '' then
            target_ids := array[btrim(target_raw)];
          end if;
          foreach item in array target_ids
          loop
            if item is not null and btrim(item) <> '' and not (item = any (collected)) then
              collected := collected || item;
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end loop;

  if cardinality(collected) = 0 then
    return public.automation_field_ids(coalesce(p_values->>p_field_id, ''));
  end if;
  return collected;
end;
$$;

create or replace function public.automation_enrich_lookup_values(
  p_entity_id text,
  p_values jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb := coalesce(p_values, '{}'::jsonb);
  field_def jsonb;
  field_id text;
  ids text[];
  encoded text;
begin
  if p_entity_id is null or btrim(p_entity_id) = '' then
    return result;
  end if;

  for field_def in
    select f
    from public.entities e,
         lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
    where e.id = p_entity_id
      and coalesce(f->>'type', '') = 'lookup'
  loop
    field_id := nullif(trim(coalesce(field_def->>'id', '')), '');
    if field_id is null then
      continue;
    end if;
    ids := public.automation_lookup_field_ids(p_entity_id, field_id, result, 0);
    if cardinality(ids) = 0 then
      continue;
    end if;
    if cardinality(ids) = 1 then
      encoded := ids[1];
    else
      encoded := to_jsonb(ids)::text;
    end if;
    result := jsonb_set(result, array[field_id], to_jsonb(encoded), true);
  end loop;

  return result;
end;
$$;

grant execute on function public.automation_entity_field_def(text, text)
  to authenticated, service_role;
grant execute on function public.automation_lookup_field_ids(text, text, jsonb, integer)
  to authenticated, service_role;
grant execute on function public.automation_enrich_lookup_values(text, jsonb)
  to authenticated, service_role;

-- Resolve lookups before conditional assignee branches are evaluated.
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
  values_eff jsonb := coalesce(p_values, '{}'::jsonb);
begin
  -- Lookups (e.g. «Отдел менеджера») are not stored on the host key — resolve
  -- them so conditional branches see the same ids the UI shows.
  if nullif(trim(coalesce(p_record_id, '')), '') is not null then
    select er.entity_id into trigger_entity_id
    from public.entity_records er
    where er.id = p_record_id
    limit 1;
    if trigger_entity_id is not null then
      values_eff := public.automation_enrich_lookup_values(
        trigger_entity_id,
        values_eff
      );
    end if;
  end if;

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
          values_eff,
          values_eff
        ) then
          nested_resolver := coalesce(branch->'resolver', '{"type":"currentUser"}'::jsonb);
          if coalesce(nested_resolver->>'type', '') = 'conditional' then
            nested_resolver := '{"type":"currentUser"}'::jsonb;
          end if;
          return public.automation_resolve_assignees(
            nested_resolver,
            values_eff,
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
        values_eff,
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
      raw := coalesce(values_eff->>field_id, '');
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
      raw := coalesce(values_eff->>field_id, '');
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

      cursors := array[values_eff];
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
            values_eff
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
      if role_id = 'role-general-director' then
        if cardinality(ids) = 0 or ids is null then
          raise exception 'AUTOMATION_GENERAL_DIRECTOR: Для согласования нужен генеральный директор (роль не назначена ни одному пользователю)'
            using errcode = 'P0001';
        end if;
        if cardinality(ids) > 1 then
          ids := array[ids[1]];
        end if;
      end if;
      return ids;

    when 'recordCreator' then
      creator := coalesce(values_eff->>'__createdByUserId', values_eff->>'createdBy', '');
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
