-- Resolve `{{relationFieldId.nestedFieldId}}` action values from a related
-- record when completing automation tasks in SQL.

create or replace function public.automation_resolve_related_field_value(
  p_relation_field_id text,
  p_nested_field_id text,
  p_field_values jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rel_raw text;
  related_id text;
  nested_val text;
begin
  if p_relation_field_id is null or length(trim(p_relation_field_id)) = 0 then
    return '';
  end if;
  if p_nested_field_id is null or length(trim(p_nested_field_id)) = 0 then
    return '';
  end if;

  rel_raw := coalesce(p_field_values->>p_relation_field_id, '');
  if rel_raw = '' then
    return '';
  end if;

  -- Relation values: JSON array, CSV, or a single id.
  if left(rel_raw, 1) = '[' then
    begin
      related_id := nullif(trim(rel_raw::jsonb->>0), '');
    exception when others then
      related_id := null;
    end;
  else
    related_id := nullif(trim(split_part(rel_raw, ',', 1)), '');
  end if;

  if related_id is null then
    return '';
  end if;

  select er.field_values->>p_nested_field_id
    into nested_val
  from public.entity_records er
  where er.id = related_id
  limit 1;

  return coalesce(nested_val, '');
end;
$$;

create or replace function public.automation_resolve_action_value(
  p_value text,
  p_field_values jsonb,
  p_actor_user_id text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text := coalesce(p_value, '');
  user_id text;
  relation_field_id text;
  nested_field_id text;
begin
  if v = '' then
    return '';
  end if;

  if v = '__today__' then
    return to_char(current_date, 'YYYY-MM-DD');
  end if;

  if v = '__tomorrow__' then
    return to_char(current_date + 1, 'YYYY-MM-DD');
  end if;

  if v = '__now__' then
    return to_char(clock_timestamp(), 'YYYY-MM-DD"T"HH24:MI');
  end if;

  if v = '__timeNow__' then
    return to_char(clock_timestamp(), 'HH24:MI');
  end if;

  if v = '__currentUser__' then
    if p_actor_user_id is not null and length(trim(p_actor_user_id)) > 0 then
      return trim(p_actor_user_id);
    end if;
    select er.id into user_id
    from public.entity_records er
    where er.entity_id = 'entity-system-users'
      and er.auth_user_id = auth.uid()
    limit 1;
    return coalesce(user_id, '');
  end if;

  if v = '{{created}}' or v = 'created' then
    return '';
  end if;

  -- `{{relationFieldId.nestedFieldId}}` — value from the related record.
  if v ~ '^\{\{[^.}]+\.[^}]+\}\}$' then
    relation_field_id := substring(v from '\{\{([^.]+)\.');
    nested_field_id := substring(v from '\.([^}]+)\}\}');
    return public.automation_resolve_related_field_value(
      relation_field_id,
      nested_field_id,
      p_field_values
    );
  end if;

  return public.automation_render_template(v, p_field_values);
end;
$$;
