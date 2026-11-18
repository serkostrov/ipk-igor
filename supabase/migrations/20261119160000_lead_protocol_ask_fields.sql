-- Step 4 «Заполнить данные» stored protocol asks as fieldAccess.relatedFields.
-- The task form reads relatedVisibleFields / relatedRequiredIds, so the button
-- completed with an empty form and the next task failed with
-- AUTOMATION_ASSIGNEE_MISSING (no protocol, no leading-department head).

create or replace function public.automation_normalize_related_field_access(access jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  fields jsonb;
  item jsonb;
  visible jsonb := '[]'::jsonb;
  required jsonb := '[]'::jsonb;
  ask_id text;
  result jsonb;
begin
  if access is null or jsonb_typeof(access) <> 'object' then
    return access;
  end if;
  if jsonb_typeof(access->'relatedVisibleFields') = 'array'
     and jsonb_array_length(access->'relatedVisibleFields') > 0 then
    return access;
  end if;
  fields := access->'relatedFields';
  if jsonb_typeof(fields) <> 'array' or jsonb_array_length(fields) = 0 then
    return access;
  end if;

  for item in select value from jsonb_array_elements(fields)
  loop
    ask_id := coalesce(
      nullif(btrim(item->>'id'), ''),
      'related-' || coalesce(item->>'fieldId', '')
    );
    visible := visible || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', ask_id,
        'fieldId', item->>'fieldId',
        'linkedTabId', nullif(btrim(coalesce(item->>'linkedTabId', '')), ''),
        'relationFieldId', coalesce(item->>'relationFieldId', '')
      ))
    );
    if coalesce(item->>'required', '') in ('true', 't') then
      required := required || jsonb_build_array(to_jsonb(ask_id));
    end if;
  end loop;

  result := (access - 'relatedFields');
  result := jsonb_set(result, '{relatedVisibleFields}', visible, true);
  if jsonb_typeof(result->'relatedRequiredIds') is distinct from 'array'
     or jsonb_array_length(coalesce(result->'relatedRequiredIds', '[]'::jsonb)) = 0 then
    result := jsonb_set(result, '{relatedRequiredIds}', required, true);
  end if;
  return result;
end;
$$;

update public.automation_task_templates t
set outcomes = (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(o->'fieldAccess') = 'object' then
        jsonb_set(
          o,
          '{fieldAccess}',
          public.automation_normalize_related_field_access(o->'fieldAccess'),
          true
        )
      else o
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(t.outcomes, '[]'::jsonb)) with ordinality as x(o, ord)
)
where t.outcomes::text like '%relatedFields%';

update public.automation_tasks task
set config = jsonb_set(
  task.config,
  '{outcomes}',
  (
    select coalesce(jsonb_agg(
      case
        when jsonb_typeof(o->'fieldAccess') = 'object' then
          jsonb_set(
            o,
            '{fieldAccess}',
            public.automation_normalize_related_field_access(o->'fieldAccess'),
            true
          )
        else o
      end
      order by ord
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(task.config->'outcomes', '[]'::jsonb)) with ordinality as x(o, ord)
  ),
  true
)
where task.config::text like '%relatedFields%';

-- Step 5: GIP description is read-only. The editable ask is the department text.
update public.automation_task_templates t
set outcomes = (
  select coalesce(jsonb_agg(
    case
      when ord = 1 then
        jsonb_set(
          jsonb_set(
            jsonb_set(
              o,
              '{fieldAccess,relatedVisibleFields}',
              (
                select coalesce(jsonb_agg(f), '[]'::jsonb)
                from jsonb_array_elements(coalesce(o->'fieldAccess'->'relatedVisibleFields', '[]'::jsonb)) f
                where f->>'id' is distinct from 'rel-proto-gip-ro'
              ),
              true
            ),
            '{fieldAccess,relatedRequiredIds}',
            (
              select coalesce(jsonb_agg(x), '[]'::jsonb)
              from jsonb_array_elements(coalesce(o->'fieldAccess'->'relatedRequiredIds', '[]'::jsonb)) x
              where x #>> '{}' is distinct from 'rel-proto-gip-ro'
            ),
            true
          ),
          '{actions}',
          case
            when coalesce(o->'actions', '[]'::jsonb)::text like '%rel-proto-gip-ro%' then coalesce(o->'actions', '[]'::jsonb)
            else coalesce(o->'actions', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
              'id', 'aact-view-proto-gip-desc',
              'kind', 'viewField',
              'fieldIds', '[]'::jsonb,
              'relatedFields', jsonb_build_array(jsonb_build_object(
                'id', 'rel-proto-gip-ro',
                'linkedTabId', 'tab-2f1f0176-8a95-4622-acb7-c5cc4683e16c',
                'relationFieldId', '',
                'fieldId', 'field-114ed87b-6b59-48ed-a175-1220f2d55dc8'
              ))
            ))
          end,
          true
        )
      else o
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(t.outcomes, '[]'::jsonb)) with ordinality as x(o, ord)
)
where t.id = 'atpl-lead-dept-head-tz';

-- One «Протокол запуска» per lead once the lead is on «ГИП / ведущий отдел»,
-- so step 4 can edit it instead of completing against an empty relation.
create or replace function public.lead_ensure_launch_protocol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stage_field constant text := 'field-09cf11df-e26b-4d70-840a-9cc71c825016';
  gip_stage constant text := 'list-aad1e473-4c06-4e58-a615-f175c091d282';
  proto_entity constant text := 'entity-7ecbb3e8-ec93-4e16-9539-7272ff979839';
  proto_lead constant text := 'field-5da97a4c-d240-43f2-80d8-d35eddecb7c1';
  proto_name constant text := 'field-e9da05d5-93d2-4d3a-8cef-e97bc639f2df';
  lead_name_field constant text := 'field-c071107e-4baf-4926-ac0b-a1822a0d364b';
  stage text;
  lead_name text;
begin
  if NEW.entity_id is distinct from 'entity-92b11740-64de-40bc-9687-3194f33fdba0' then
    return NEW;
  end if;
  stage := coalesce(NEW.field_values->>stage_field, '');
  if stage <> gip_stage then
    return NEW;
  end if;
  if exists (
    select 1
    from public.entity_records er
    where er.entity_id = proto_entity
      and NEW.id = any (
        public.automation_field_ids(coalesce(er.field_values->>proto_lead, ''))
      )
  ) then
    return NEW;
  end if;

  lead_name := nullif(btrim(coalesce(NEW.field_values->>lead_name_field, '')), '');
  insert into public.entity_records (id, entity_id, field_values)
  values (
    'record-' || gen_random_uuid()::text,
    proto_entity,
    jsonb_strip_nulls(jsonb_build_object(
      proto_lead, NEW.id,
      proto_name, coalesce(lead_name, 'Протокол запуска')
    ))
  );
  return NEW;
end;
$$;

drop trigger if exists trg_lead_ensure_launch_protocol on public.entity_records;
create trigger trg_lead_ensure_launch_protocol
  after insert or update of field_values on public.entity_records
  for each row
  execute function public.lead_ensure_launch_protocol();

-- Leads already sitting on the stage (the open step-4 task).
update public.entity_records
set field_values = field_values
where entity_id = 'entity-92b11740-64de-40bc-9687-3194f33fdba0'
  and coalesce(field_values->>'field-09cf11df-e26b-4d70-840a-9cc71c825016', '')
    = 'list-aad1e473-4c06-4e58-a615-f175c091d282';
