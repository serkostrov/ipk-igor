-- Страховка: связать «Протокол запуска» с «Разбором ТКП» того же лида.
-- Основной путь — createRecord в автоматизации (см. 20261123130000): там
-- связь видна и настраивается в UI. Здесь — если протокол создали триггером
-- при смене стадии или разбор появился позже.
--
-- Поле связи на протоколе (field-42853a00… «Разбор ТКП»);
-- вкладка «Протокол запуска» на разборе читает его как parentLink.

-- ── 1) Создание протокола: сразу указать существующий разбор лида ────────────

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
  proto_tkp constant text := 'field-42853a00-aadc-40eb-b6f6-98bb0dbe541a';
  lead_name_field constant text := 'field-c071107e-4baf-4926-ac0b-a1822a0d364b';
  tkp_entity constant text := 'entity-33de9416-88f2-4360-9f96-9c71d0886fbc';
  tkp_lead constant text := 'field-9fe24291-44ca-4031-b47f-cb99898564bc';
  stage text;
  lead_name text;
  tkp_id text;
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

  -- Разбор ТКП этого лида (последний, если их несколько).
  select er.id
    into tkp_id
  from public.entity_records er
  where er.entity_id = tkp_entity
    and NEW.id = any (
      public.automation_field_ids(coalesce(er.field_values->>tkp_lead, ''))
    )
  order by er.created_at desc nulls last, er.id desc
  limit 1;

  insert into public.entity_records (id, entity_id, field_values)
  values (
    'record-' || gen_random_uuid()::text,
    proto_entity,
    jsonb_strip_nulls(jsonb_build_object(
      proto_lead, NEW.id,
      proto_name, coalesce(lead_name, 'Протокол запуска'),
      proto_tkp, nullif(tkp_id, '')
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

-- ── 2) Создание / привязка разбора: дописать ссылку на уже существующий протокол

create or replace function public.tkp_link_launch_protocol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tkp_entity constant text := 'entity-33de9416-88f2-4360-9f96-9c71d0886fbc';
  tkp_lead constant text := 'field-9fe24291-44ca-4031-b47f-cb99898564bc';
  proto_entity constant text := 'entity-7ecbb3e8-ec93-4e16-9539-7272ff979839';
  proto_lead constant text := 'field-5da97a4c-d240-43f2-80d8-d35eddecb7c1';
  proto_tkp constant text := 'field-42853a00-aadc-40eb-b6f6-98bb0dbe541a';
  lead_id text;
  old_lead_id text;
begin
  if NEW.entity_id is distinct from tkp_entity then
    return NEW;
  end if;

  lead_id := coalesce(
    (public.automation_field_ids(NEW.field_values->>tkp_lead))[1],
    ''
  );
  if lead_id = '' then
    return NEW;
  end if;

  -- Не гоняем update на каждом сохранении разбора без смены лида.
  if TG_OP = 'UPDATE' then
    old_lead_id := coalesce(
      (public.automation_field_ids(OLD.field_values->>tkp_lead))[1],
      ''
    );
    if old_lead_id = lead_id then
      return NEW;
    end if;
  end if;

  update public.entity_records er
  set field_values = jsonb_set(
    coalesce(er.field_values, '{}'::jsonb),
    array[proto_tkp],
    to_jsonb(NEW.id),
    true
  )
  where er.entity_id = proto_entity
    and lead_id = any (
      public.automation_field_ids(coalesce(er.field_values->>proto_lead, ''))
    )
    and coalesce(
      (public.automation_field_ids(er.field_values->>proto_tkp))[1],
      ''
    ) = '';

  return NEW;
end;
$$;

drop trigger if exists trg_tkp_link_launch_protocol on public.entity_records;
create trigger trg_tkp_link_launch_protocol
  after insert or update of field_values on public.entity_records
  for each row
  execute function public.tkp_link_launch_protocol();

-- ── 3) Бэкфилл: протоколы с лидом, но без разбора ───────────────────────────

update public.entity_records proto
set field_values = jsonb_set(
  coalesce(proto.field_values, '{}'::jsonb),
  array['field-42853a00-aadc-40eb-b6f6-98bb0dbe541a'],
  to_jsonb(matched.tkp_id),
  true
)
from (
  select
    proto.id as proto_id,
    (
      select er.id
      from public.entity_records er
      where er.entity_id = 'entity-33de9416-88f2-4360-9f96-9c71d0886fbc'
        and (
          public.automation_field_ids(
            coalesce(
              proto.field_values->>'field-5da97a4c-d240-43f2-80d8-d35eddecb7c1',
              ''
            )
          )
        )[1] = any (
          public.automation_field_ids(
            coalesce(
              er.field_values->>'field-9fe24291-44ca-4031-b47f-cb99898564bc',
              ''
            )
          )
        )
      order by er.created_at desc nulls last, er.id desc
      limit 1
    ) as tkp_id
  from public.entity_records proto
  where proto.entity_id = 'entity-7ecbb3e8-ec93-4e16-9539-7272ff979839'
    and coalesce(
      (public.automation_field_ids(
        proto.field_values->>'field-42853a00-aadc-40eb-b6f6-98bb0dbe541a'
      ))[1],
      ''
    ) = ''
    and coalesce(
      (public.automation_field_ids(
        proto.field_values->>'field-5da97a4c-d240-43f2-80d8-d35eddecb7c1'
      ))[1],
      ''
    ) <> ''
) as matched
where proto.id = matched.proto_id
  and matched.tkp_id is not null;
