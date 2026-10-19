-- Conditional assignee + related-field resolve for automation tasks.
-- type=conditional: first matching branch.conditions, else elseResolver.
-- type=relatedField: user id from a nested field on a related record.

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
  relation_field_id text;
  nested_field_id text;
  raw text;
  ids text[];
  creator text;
  user_record_id text;
  auth_uuid uuid;
  branch jsonb;
  nested_resolver jsonb;
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
          -- Nested conditional is not allowed; treat as currentUser.
          if coalesce(nested_resolver->>'type', '') = 'conditional' then
            nested_resolver := '{"type":"currentUser"}'::jsonb;
          end if;
          return public.automation_resolve_assignees(
            nested_resolver,
            p_values,
            auth_user_id
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
        auth_user_id
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
      if relation_field_id is null or nested_field_id is null then
        return array[]::text[];
      end if;
      raw := public.automation_resolve_related_field_value(
        relation_field_id,
        nested_field_id,
        coalesce(p_values, '{}'::jsonb)
      );
      ids := public.automation_field_ids(raw);
      if cardinality(ids) > 0 then
        return array[ids[1]];
      end if;
      return array[]::text[];

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
