-- Карточка сделки: формулы рентабельности и числовые поля показателей.
-- 1) «Плановая / Фактическая рентабельность» = (выручка − себестоимость) / выручка × 100
--    (было деление на себестоимость).
-- 2) «Плановая / Фактическая себестоимость» и «… часы» — тип number вместо text.
-- Публикует новую версию схемы: новые записи получают исправленные формулы,
-- существующие остаются на своей версии. Повторный запуск ничего не меняет.

do $$
declare
  deal_entity constant text := 'entity-6a8d74cf-db2d-4374-84ae-0946f385f79e';
  amount_field constant text := 'field-651d6463-5738-496b-9689-84fd19fc774d';
  plan_cost_field constant text := 'field-b80701ef-6ef3-45a7-996b-73924359d13b';
  fact_cost_field constant text := 'field-13232682-ab2a-455c-94e0-d7a3d54fb09d';
  plan_hours_field constant text := 'field-d5652e73-e0fa-46a1-934c-219e102b4767';
  fact_hours_field constant text := 'field-49d739c9-ad55-4bd7-9443-e33e40bfc5c8';
  plan_rent_field constant text := 'field-a3799bed-2e12-4337-9afc-8075a2f5d728';
  fact_rent_field constant text := 'field-f6ef3c7e-4467-41b7-ba68-8f3b7b4b4b5e';
  current_def jsonb;
  next_def jsonb;
  next_version int;
begin
  select definition into current_def
  from public.entities
  where id = deal_entity;

  if current_def is null then
    return;
  end if;

  select jsonb_set(
    current_def,
    '{fields}',
    jsonb_agg(
      case f->>'id'
        when plan_rent_field then jsonb_set(
          f,
          '{formula,expression}',
          to_jsonb(format('({{%s}}-{{%s}})/{{%s}}*100', amount_field, plan_cost_field, amount_field))
        )
        when fact_rent_field then jsonb_set(
          f,
          '{formula,expression}',
          to_jsonb(format('({{%s}}-{{%s}})/{{%s}}*100', amount_field, fact_cost_field, amount_field))
        )
        when plan_cost_field then f || '{"type": "number", "unitSuffix": "₽", "decimals": 2}'::jsonb
        when fact_cost_field then f || '{"type": "number", "unitSuffix": "₽", "decimals": 2}'::jsonb
        when plan_hours_field then f || '{"type": "number", "unitSuffix": "ч", "decimals": 2}'::jsonb
        when fact_hours_field then f || '{"type": "number", "unitSuffix": "ч", "decimals": 2}'::jsonb
        else f
      end
      order by ord
    )
  )
  into next_def
  from jsonb_array_elements(current_def->'fields') with ordinality as t(f, ord);

  if next_def is null or next_def = current_def then
    return;
  end if;

  update public.entities
  set definition = next_def
  where id = deal_entity;

  select greatest(
    coalesce((select published_version from public.entities where id = deal_entity), 1),
    coalesce((select max(version) from public.entity_schema_versions where entity_id = deal_entity), 0)
  ) + 1
  into next_version;

  insert into public.entity_schema_versions (entity_id, version, definition, message)
  values (
    deal_entity,
    next_version,
    next_def,
    'Карточка сделки: рентабельность от выручки, числовые поля себестоимости и часов'
  );

  update public.entities
  set published_version = next_version
  where id = deal_entity;
end;
$$;
