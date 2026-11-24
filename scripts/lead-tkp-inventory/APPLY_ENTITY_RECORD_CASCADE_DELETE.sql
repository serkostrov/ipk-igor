-- Cascade delete for relation/belonging fields with relationCascadeDelete.
-- Deleting a parent record also deletes dependents that reference it via
-- those fields (recursively), so orphaned tasks/subtasks do not remain.

create or replace function public.entity_record_cascade_collect(
  p_record_id text,
  p_depth integer default 0,
  p_visited text[] default array[]::text[]
) returns table (record_id text, entity_id text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  root_entity_id text;
  host_entity_id text;
  field_def jsonb;
  field_id text;
  field_type text;
  target_entity_id text;
  child record;
  cascade_on boolean;
begin
  if p_record_id is null or btrim(p_record_id) = '' then
    return;
  end if;
  if p_depth > 32 then
    return;
  end if;
  if p_record_id = any (p_visited) then
    return;
  end if;

  select er.entity_id into root_entity_id
  from public.entity_records er
  where er.id = p_record_id
  limit 1;
  if root_entity_id is null then
    return;
  end if;

  -- Dependents first (depth-first), then the root itself.
  for host_entity_id, field_def in
    select e.id, f
    from public.entities e,
         lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
    where coalesce(f->>'type', '') in ('relation', 'belonging')
  loop
    cascade_on := coalesce(
      (field_def->>'relationCascadeDelete')::boolean,
      (field_def->>'relation_cascade_delete')::boolean,
      false
    );
    if not cascade_on then
      continue;
    end if;

    field_id := nullif(trim(coalesce(field_def->>'id', '')), '');
    field_type := coalesce(field_def->>'type', '');
    if field_id is null then
      continue;
    end if;

    target_entity_id := nullif(trim(coalesce(field_def->>'relationEntityId', '')), '');
    if field_type = 'belonging' then
      -- Belonging always targets the same entity as the host.
      if host_entity_id is distinct from root_entity_id then
        continue;
      end if;
    else
      if target_entity_id is distinct from root_entity_id then
        continue;
      end if;
    end if;

    for child in
      select er.id, er.entity_id
      from public.entity_records er
      where er.entity_id = host_entity_id
        and er.id is distinct from p_record_id
        and not (er.id = any (p_visited))
        and p_record_id = any (
          public.automation_field_ids(coalesce(er.field_values->>field_id, ''))
        )
    loop
      return query
        select *
        from public.entity_record_cascade_collect(
          child.id,
          p_depth + 1,
          p_visited || p_record_id
        );
    end loop;
  end loop;

  record_id := p_record_id;
  entity_id := root_entity_id;
  return next;
end;
$$;

create or replace function public.delete_entity_record_cascade(
  p_record_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  collected jsonb := '[]'::jsonb;
  ids text[] := array[]::text[];
  row_item record;
begin
  if p_record_id is null or btrim(p_record_id) = '' then
    return '[]'::jsonb;
  end if;

  for row_item in
    select c.record_id, c.entity_id
    from public.entity_record_cascade_collect(p_record_id) as c
  loop
    collected := collected || jsonb_build_array(
      jsonb_build_object(
        'id', row_item.record_id,
        'entityId', row_item.entity_id
      )
    );
    ids := ids || row_item.record_id;
  end loop;

  if cardinality(ids) = 0 then
    return '[]'::jsonb;
  end if;

  -- Best-effort cleanup of automation tasks tied to deleted records.
  begin
    delete from public.automation_tasks
    where record_id = any (ids);
  exception when undefined_table then
    null;
  when others then
    null;
  end;

  begin
    delete from public.notifications
    where record_id = any (ids);
  exception when undefined_table then
    null;
  when others then
    null;
  end;

  delete from public.entity_records
  where id = any (ids);

  return collected;
end;
$$;

grant execute on function public.entity_record_cascade_collect(text, integer, text[])
  to authenticated, service_role;
grant execute on function public.delete_entity_record_cascade(text)
  to authenticated, service_role;
