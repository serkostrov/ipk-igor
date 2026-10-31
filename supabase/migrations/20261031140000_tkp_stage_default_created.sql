-- «Разбор ТКП».«Стадия» default must be «Создано», not «Выбор отделов».
-- Otherwise Lead createRecord lands on «Выбор отделов» and immediately spawns
-- «Выбрать руководителей» while Lead «Ознакомиться с ТЗ» is still open.

update public.entities e
set
  definition = jsonb_set(
    e.definition,
    array['fields', idx.ordinal::text, 'defaultValue'],
    jsonb_build_object(
      'kind', 'value',
      'value', 'list-f0e5e1c4-3702-4680-bbeb-222e35edb8f3'
    ),
    true
  ),
  updated_at = now()
from (
  select
    (ord - 1) as ordinal
  from public.entities e2
  cross join lateral jsonb_array_elements(
    coalesce(e2.definition->'fields', '[]'::jsonb)
  ) with ordinality as f(field, ord)
  where e2.id = 'entity-d5de40cb-617e-40dd-834a-e9895a432898'
    and f.field->>'id' = 'field-b1da7b05-3eb6-4bc0-87a7-1de79068749b'
  limit 1
) as idx
where e.id = 'entity-d5de40cb-617e-40dd-834a-e9895a432898';

-- Keep published schema snapshot aligned when present.
update public.entity_schema_versions v
set
  definition = jsonb_set(
    v.definition,
    array['fields', idx.ordinal::text, 'defaultValue'],
    jsonb_build_object(
      'kind', 'value',
      'value', 'list-f0e5e1c4-3702-4680-bbeb-222e35edb8f3'
    ),
    true
  )
from (
  select
    v2.id as version_id,
    (ord - 1) as ordinal
  from public.entity_schema_versions v2
  cross join lateral jsonb_array_elements(
    coalesce(v2.definition->'fields', '[]'::jsonb)
  ) with ordinality as f(field, ord)
  where v2.entity_id = 'entity-d5de40cb-617e-40dd-834a-e9895a432898'
    and v2.version = (
      select max(v3.version)
      from public.entity_schema_versions v3
      where v3.entity_id = 'entity-d5de40cb-617e-40dd-834a-e9895a432898'
    )
    and f.field->>'id' = 'field-b1da7b05-3eb6-4bc0-87a7-1de79068749b'
  limit 1
) as idx
where v.id = idx.version_id;
