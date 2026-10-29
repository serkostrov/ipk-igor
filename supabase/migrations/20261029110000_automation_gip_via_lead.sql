-- Resolve lead «ГИП» via field «лид» when «ГИП» is not on the trigger itself.
-- Never uses «Главный инженер».

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
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'гип %'
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

  -- 2) Hop via «лид» → Lead.ГИП (not «Главный инженер»).
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
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'лид %'
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

  -- Prefer Lead.«руководитель» (product rule for GIP), then «ГИП».
  -- Never «Главный инженер».
  select nullif(trim(f->>'id'), '')
    into lead_gip_field_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = lead_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководитель'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководители'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'руководитель %'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководитель' then 0
    else 1
  end
  limit 1;

  if lead_gip_field_id is null then
    select nullif(trim(f->>'id'), '')
      into lead_gip_field_id
    from public.entities e,
         lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
    where e.id = lead_entity_id
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
  end if;

  if lead_gip_field_id is null then
    return array[]::text[];
  end if;

  return public.automation_field_ids(coalesce(lead_live->>lead_gip_field_id, ''));
end;
$$;

grant execute on function public.automation_trigger_gip_user_ids(text, jsonb)
  to authenticated, service_role;
