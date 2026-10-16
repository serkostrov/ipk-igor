-- Conditions: folderHasFiles / folderEmpty against files-tree JSON values.

create or replace function public.automation_count_files_in_named_folder(
  p_raw text,
  p_folder_name text
) returns integer
language plpgsql
immutable
as $$
declare
  entries jsonb;
  folder_id text;
  folder_name text := lower(btrim(coalesce(p_folder_name, '')));
  cnt integer := 0;
  item jsonb;
begin
  if folder_name = '' or p_raw is null or btrim(p_raw) = '' then
    return 0;
  end if;

  begin
    entries := p_raw::jsonb;
  exception when others then
    return 0;
  end;

  if jsonb_typeof(entries) <> 'array' then
    return 0;
  end if;

  folder_id := null;
  for item in select * from jsonb_array_elements(entries)
  loop
    if coalesce(item->>'kind', '') = 'folder'
       and lower(btrim(coalesce(item->>'name', ''))) = folder_name
    then
      folder_id := item->>'id';
      exit;
    end if;
  end loop;

  if folder_id is null or folder_id = '' then
    return 0;
  end if;

  select count(*)::integer into cnt
  from jsonb_array_elements(entries) as t(item)
  where coalesce(item->>'kind', '') = 'file'
    and coalesce(item->>'parentId', '') = folder_id;

  return coalesce(cnt, 0);
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
  file_count integer;
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
    when 'folderHasFiles' then
      file_count := public.automation_count_files_in_named_folder(current, coalesce(rule_value, ''));
      return file_count > 0;
    when 'folderEmpty' then
      file_count := public.automation_count_files_in_named_folder(current, coalesce(rule_value, ''));
      return file_count = 0;
    else
      return true;
  end case;
end;
$$;
