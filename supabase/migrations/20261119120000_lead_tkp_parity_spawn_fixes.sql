-- Lead → TKP parity: spawn assignees, GIP resolve, fanOut flag, return revision.
-- Fixes ТЗ §10 points 1,4,5,6 and return unique-index collision (§9).



-- Match department «ГИП» by exact name/code only — not arbitrary text containing «гип».
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
  entity_id text;
  name_field_id text;
  code_field_id text;
  v text;
  leaf_id text;
  leaf_vals jsonb;
  leaf_entity_id text;
  leaf_name_field_id text;
  leaf_code_field_id text;
  norm text;
begin
  if p_record_id is not null and btrim(p_record_id) <> '' then
    select er.entity_id, coalesce(er.field_values, '{}'::jsonb)
      into entity_id, vals
    from public.entity_records er
    where er.id = p_record_id
    limit 1;
    if p_values is not null then
      vals := coalesce(p_values, vals);
    end if;
  end if;
  vals := coalesce(vals, '{}'::jsonb);

  if entity_id is not null then
    select nullif(trim(f->>'id'), '')
      into name_field_id
    from public.entities e,
         lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
    where e.id = entity_id
      and (
        lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) in ('название', 'имя', 'name')
        or coalesce(f->>'systemKey', '') in ('name', 'title')
        or coalesce(f->>'isName', '') in ('true', 't', '1')
      )
    order by case
      when coalesce(f->>'systemKey', '') = 'name' then 0
      when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'название' then 1
      else 2
    end
    limit 1;

    select nullif(trim(f->>'id'), '')
      into code_field_id
    from public.entities e,
         lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
    where e.id = entity_id
      and lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) in ('код', 'code')
    limit 1;

    if code_field_id is not null then
      norm := lower(replace(btrim(coalesce(vals->>code_field_id, '')), 'ё', 'е'));
      if norm = 'gip' or norm = 'гип' then
        return true;
      end if;
    end if;

    if name_field_id is not null then
      norm := lower(replace(btrim(coalesce(vals->>name_field_id, '')), 'ё', 'е'));
      if norm = 'гип' then
        return true;
      end if;
    end if;
  end if;

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
        select er.entity_id, er.field_values into leaf_entity_id, leaf_vals
        from public.entity_records er
        where er.id = leaf_id
        limit 1;
        if leaf_vals is null or leaf_entity_id is null then
          continue;
        end if;

        select nullif(trim(f->>'id'), '')
          into leaf_code_field_id
        from public.entities e,
             lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
        where e.id = leaf_entity_id
          and lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) in ('код', 'code')
        limit 1;
        if leaf_code_field_id is not null then
          norm := lower(replace(btrim(coalesce(leaf_vals->>leaf_code_field_id, '')), 'ё', 'е'));
          if norm = 'gip' or norm = 'гип' then
            return true;
          end if;
        end if;

        select nullif(trim(f->>'id'), '')
          into leaf_name_field_id
        from public.entities e,
             lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
        where e.id = leaf_entity_id
          and (
            lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) in ('название', 'имя', 'name')
            or coalesce(f->>'systemKey', '') in ('name', 'title')
          )
        order by case when coalesce(f->>'systemKey', '') = 'name' then 0 else 1 end
        limit 1;
        if leaf_name_field_id is not null then
          norm := lower(replace(btrim(coalesce(leaf_vals->>leaf_name_field_id, '')), 'ё', 'е'));
          if norm = 'гип' then
            return true;
          end if;
        end if;
      end loop;
    exception when others then
      null;
    end;
  end loop;

  return false;
end;
$$;


-- Prefer Lead.«ГИП» over «Руководитель» (client parity; «Руководитель» often defaults to currentUser).
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
  lead_field_id text;
  lead_entity_id text;
  lead_record_id text;
  lead_manager_field_id text;
  lead_gip_field_id text;
  live jsonb := '{}'::jsonb;
  merged jsonb := '{}'::jsonb;
  lead_live jsonb := '{}'::jsonb;
  k text;
  draft text;
  ids text[];
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

  merged := coalesce(live, '{}'::jsonb);
  for k, draft in
    select key, value from jsonb_each_text(coalesce(p_values, '{}'::jsonb)) as t(key, value)
  loop
    if draft is not null and btrim(draft) <> '' then
      merged := jsonb_set(merged, array[k], to_jsonb(draft), true);
    end if;
  end loop;

  -- 1) Direct «ГИП» on the trigger / «Разбор ТКП».
  select nullif(trim(f->>'id'), '')
    into gip_field_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = trigger_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гипы'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип' then 0
    else 1
  end
  limit 1;

  if gip_field_id is not null then
    ids := public.automation_field_ids(coalesce(merged->>gip_field_id, ''));
    if coalesce(array_length(ids, 1), 0) > 0 then
      return ids;
    end if;
  end if;

  -- 2) Hop via «лид» → Lead.ГИП, else Lead.руководитель (never «Главный инженер»).
  select nullif(trim(f->>'id'), ''),
         nullif(trim(coalesce(f->>'relationEntityId', '')), '')
    into lead_field_id, lead_entity_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = trigger_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'лид'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'лиды'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'лид' then 0
    else 1
  end
  limit 1;

  if lead_field_id is null or lead_entity_id is null then
    return array[]::text[];
  end if;

  lead_record_id := (
    public.automation_field_ids(coalesce(merged->>lead_field_id, ''))
  )[1];
  if lead_record_id is null or btrim(lead_record_id) = '' then
    return array[]::text[];
  end if;

  select coalesce(er.field_values, '{}'::jsonb)
    into lead_live
  from public.entity_records er
  where er.id = lead_record_id
    and er.entity_id = lead_entity_id
  limit 1;
  if lead_live is null then
    return array[]::text[];
  end if;

  -- Prefer «ГИП» first.
  select nullif(trim(f->>'id'), '')
    into lead_gip_field_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = lead_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гипы'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип' then 0
    else 1
  end
  limit 1;

  if lead_gip_field_id is not null then
    ids := public.automation_field_ids(coalesce(lead_live->>lead_gip_field_id, ''));
    if coalesce(array_length(ids, 1), 0) > 0 then
      return ids;
    end if;
  end if;

  select nullif(trim(f->>'id'), '')
    into lead_manager_field_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = lead_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководитель'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководители'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководитель' then 0
    else 1
  end
  limit 1;

  if lead_manager_field_id is null then
    return array[]::text[];
  end if;

  return public.automation_field_ids(coalesce(lead_live->>lead_manager_field_id, ''));
end;
$$;

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
      -- ТЗ §1 / §8: гендиректор ровно один. Иначе согласование не стартует.
      if role_id = 'role-general-director' and cardinality(ids) is distinct from 1 then
        raise exception 'AUTOMATION_GENERAL_DIRECTOR: Для согласования нужен ровно один генеральный директор'
          using errcode = 'P0001';
      end if;
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
      -- relatedField / fan-out: do not create unassigned interactive tasks.
      if rtype in ('relatedField', 'relationFieldFanOut') then
        insert into public.automation_runs (
          id, cause, entity_id, record_id, task_id, actions_log, status, error
        ) values (
          'arun-' || gen_random_uuid()::text,
          'spawn',
          p_entity_id,
          p_record_id,
          null,
          jsonb_build_array(jsonb_build_object(
            'templateId', p_tmpl.id,
            'templateName', p_tmpl.name,
            'assigneeType', rtype
          )),
          'error',
          format(
            'Не найдены исполнители задания «%s». Сначала сохраните руководителей отделов.',
            coalesce(nullif(btrim(p_tmpl.name), ''), p_tmpl.id)
          )
        );
        raise exception 'AUTOMATION_ASSIGNEE_MISSING: Не найдены исполнители задания «%». Сначала сохраните руководителей отделов.',
          coalesce(nullif(btrim(p_tmpl.name), ''), p_tmpl.id)
          using errcode = 'P0001';
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

  -- Always pass p_entity_id (even null) so Postgres never picks between
  -- legacy (text, jsonb) and (text, jsonb, text) overloads.
  task_name := public.automation_render_template(
    case
      when nullif(btrim(p_tmpl.name_template), '') is not null then p_tmpl.name_template
      else p_tmpl.name
    end,
    p_values,
    p_entity_id
  );
  if nullif(btrim(task_name), '') is null then
    task_name := p_tmpl.name;
  end if;

  task_description := public.automation_render_template(
    coalesce(p_tmpl.description, ''),
    p_values,
    p_entity_id
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
        and existing.status in ('pending', 'returned')
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
  stored_option_id text;
  already_spawned boolean;
  siblings_pending boolean;
  complete_when text;
  current_stage text;
  tmpl_created_at timestamptz;
  tmpl_id text;
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

  complete_when := lower(coalesce(
    nullif(btrim(coalesce(p_task.config->'assignee'->>'completeWhen', '')), ''),
    nullif(btrim(coalesce(p_task.config->'assignee'->>'complete_when', '')), ''),
    'all'
  ));

  -- AND-join when completeWhen = all (default). Skip for «any».
  if nullif(trim(coalesce(p_task.template_id, '')), '') is not null
     and complete_when <> 'any'
  then
    select exists (
      select 1
      from public.automation_tasks sibling
      where sibling.record_id = p_task.record_id
        and sibling.template_id = p_task.template_id
        and sibling.process_id is not distinct from p_task.process_id
        and sibling.id <> p_task.id
        and sibling.status in ('pending', 'returned')
    ) into siblings_pending;
    if siblings_pending then
      return null;
    end if;
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

  tmpl_id := coalesce(nullif(p_task.template_id, ''), '');
  select t.created_at into tmpl_created_at
  from public.automation_task_templates t
  where t.id = tmpl_id;
  tmpl_created_at := coalesce(tmpl_created_at, p_task.created_at, '-infinity'::timestamptz);

  -- Same phase: immediate next by (step_order, created_at, id).
  select * into next_tmpl
  from public.automation_task_templates t
  where t.scenario_id = p_task.scenario_id
    and coalesce(t.enabled, true) = true
    and t.trigger_option_id = stage_option_id
    and coalesce(nullif(t.launch_phase, ''), 'onEnter') = v_launch_phase
    and (
      t.step_order > p_task.step_order
      or (
        t.step_order = p_task.step_order
        and (
          t.created_at > tmpl_created_at
          or (t.created_at = tmpl_created_at and t.id > tmpl_id)
        )
      )
    )
    and public.automation_conditions_match(
      t.launch_conditions,
      values,
      values
    )
  order by t.step_order asc, t.created_at asc, t.id asc
  limit 1;

  -- Cross beforeEnter → first onEnter only when the record has landed on
  -- this stage. Prep stored on the previous stage must not unlock onEnter.
  if next_tmpl.id is null and v_launch_phase = 'beforeEnter' then
    current_stage := coalesce(
      (public.automation_field_ids(values->>p_task.trigger_field_id))[1],
      nullif(values->>p_task.trigger_field_id, ''),
      ''
    );
    if current_stage = stage_option_id then
      select * into next_tmpl
      from public.automation_task_templates t
      where t.scenario_id = p_task.scenario_id
        and coalesce(t.enabled, true) = true
        and t.trigger_option_id = stage_option_id
        and coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'onEnter'
        and public.automation_conditions_match(
          t.launch_conditions,
          values,
          values
        )
      order by t.step_order asc, t.created_at asc, t.id asc
      limit 1;
    end if;
  end if;

  if next_tmpl.id is null then
    return null;
  end if;

  select exists (
    select 1
    from public.automation_tasks existing
    where existing.record_id = p_task.record_id
      and existing.template_id = next_tmpl.id
      and existing.status in ('pending', 'returned')
  ) into already_spawned;

  if already_spawned then
    return null;
  end if;

  stored_option_id := coalesce(
    nullif(btrim(next_tmpl.trigger_option_id), ''),
    stage_option_id,
    p_task.trigger_option_id
  );

  return public.automation_spawn_template_for_record(
    next_tmpl,
    p_task.process_id,
    p_task.entity_id,
    p_task.record_id,
    p_task.trigger_field_id,
    stored_option_id,
    values,
    values,
    p_actor
  );
end;
$$;

-- Unique index held both pending+returned → clone on return always collided.
-- Keep returned row; only one pending per spawn key.
drop index if exists public.automation_tasks_spawn_uidx;
create unique index automation_tasks_spawn_uidx
  on public.automation_tasks (
    record_id,
    template_id,
    trigger_option_id,
    (coalesce(assignee_user_id, ''))
  )
  where status = 'pending';

create or replace function public.return_automation_task_for_revision(
  p_task_id text,
  p_actor_user_id text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  task public.automation_tasks%rowtype;
  new_id text;
begin
  select * into task from public.automation_tasks where id = p_task_id for update;
  if task.id is null then
    raise exception 'Task not found';
  end if;

  if task.status not in ('pending', 'completed') then
    raise exception 'Task cannot be returned from status %', task.status;
  end if;

  update public.automation_tasks
  set status = 'returned', updated_at = now()
  where id = task.id;

  -- Cancel any other open pending clone for same spawn key (idempotent return).
  update public.automation_tasks
  set status = 'cancelled', updated_at = now()
  where record_id = task.record_id
    and template_id = task.template_id
    and coalesce(trigger_option_id, '') = coalesce(task.trigger_option_id, '')
    and coalesce(assignee_user_id, '') = coalesce(task.assignee_user_id, '')
    and status = 'pending'
    and id <> task.id;

  new_id := 'atask-' || gen_random_uuid()::text;
  insert into public.automation_tasks (
    id, process_id, scenario_id, template_id,
    entity_id, record_id, trigger_field_id, trigger_option_id,
    assignee_user_id, status, is_blocking, step_order, name, description, config, due_at, parent_task_id
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
    task.description,
    task.config,
    task.due_at,
    task.id
  );

  return new_id;
end;
$$;


grant execute on function public.automation_record_looks_like_gip(text, jsonb)
  to authenticated, service_role;
grant execute on function public.automation_trigger_gip_user_ids(text, jsonb)
  to authenticated, service_role;
grant execute on function public.return_automation_task_for_revision(text, text)
  to authenticated, service_role;
