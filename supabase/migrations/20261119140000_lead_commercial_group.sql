-- Фиксирует коммерческую группу лида при сохранении (ТЗ §1).
-- Отдел менеджера «ЛИНК» → группа ЛИНК, иначе основная.
-- Пустую группу разбора ТКП копирует с лида.

create or replace function public.lead_fill_commercial_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_entity constant text := 'entity-92b11740-64de-40bc-9687-3194f33fdba0';
  tkp_entity constant text := 'entity-33de9416-88f2-4360-9f96-9c71d0886fbc';
  lead_group_field constant text := 'field-lead-commercial-group';
  tkp_group_field constant text := 'field-tkp-commercial-group';
  lead_manager_field constant text := 'field-d8ec5a44-6c39-4a73-8a38-103b271f3e17';
  tkp_lead_field constant text := 'field-9fe24291-44ca-4031-b47f-cb99898564bc';
  user_dept_field constant text := 'field-868917ac-2d79-4e8a-b28d-165f7b126ce7';
  dept_name_field constant text := 'field-3c5803f4-9bbe-4749-868c-ed0e13497252';
  group_main constant text := 'record-commercial-group-main';
  group_link constant text := 'record-commercial-group-link';
  current_group text;
  manager_id text;
  dept_id text;
  dept_name text;
  lead_id text;
  lead_group text;
  chosen text;
begin
  if NEW.entity_id = lead_entity then
    current_group := coalesce(
      (public.automation_field_ids(NEW.field_values->>lead_group_field))[1],
      ''
    );
    if current_group <> '' then
      return NEW;
    end if;
    manager_id := coalesce(
      (public.automation_field_ids(NEW.field_values->>lead_manager_field))[1],
      ''
    );
    chosen := group_main;
    if manager_id <> '' then
      select coalesce((public.automation_field_ids(er.field_values->>user_dept_field))[1], '')
        into dept_id
      from public.entity_records er
      where er.id = manager_id;
      if dept_id <> '' then
        select lower(replace(coalesce(d.field_values->>dept_name_field, ''), 'ё', 'е'))
          into dept_name
        from public.entity_records d
        where d.id = dept_id;
        if dept_name like '%линк%' then
          chosen := group_link;
        end if;
      end if;
    end if;
    NEW.field_values := jsonb_set(
      coalesce(NEW.field_values, '{}'::jsonb),
      array[lead_group_field],
      to_jsonb(chosen),
      true
    );
    return NEW;
  end if;

  if NEW.entity_id = tkp_entity then
    current_group := coalesce(
      (public.automation_field_ids(NEW.field_values->>tkp_group_field))[1],
      ''
    );
    if current_group <> '' then
      return NEW;
    end if;
    lead_id := coalesce(
      (public.automation_field_ids(NEW.field_values->>tkp_lead_field))[1],
      ''
    );
    if lead_id = '' then
      return NEW;
    end if;
    select coalesce((public.automation_field_ids(er.field_values->>lead_group_field))[1], '')
      into lead_group
    from public.entity_records er
    where er.id = lead_id;
    if lead_group <> '' then
      NEW.field_values := jsonb_set(
        coalesce(NEW.field_values, '{}'::jsonb),
        array[tkp_group_field],
        to_jsonb(lead_group),
        true
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_lead_fill_commercial_group on public.entity_records;
create trigger trg_lead_fill_commercial_group
before insert or update of field_values on public.entity_records
for each row
execute function public.lead_fill_commercial_group();

-- Ручное создание разбора на «Создано», пока лид ещё «Черновик»,
-- переводит лид на «Принятие решения» и выпускает задание 2.
-- Шаг 3 («Берём») создаёт разбор, когда лид уже не на «Черновике», и не задевается.
create or replace function public.tkp_start_lead_chain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tkp_entity constant text := 'entity-33de9416-88f2-4360-9f96-9c71d0886fbc';
  status_field constant text := 'field-ebd4459c-2cc4-463a-80f5-cbbc35a95a82';
  created_option constant text := 'list-e52005a1-7ef4-4e84-b3a4-51eae02b8fc1';
  lead_field constant text := 'field-9fe24291-44ca-4031-b47f-cb99898564bc';
  lead_stage constant text := 'field-09cf11df-e26b-4d70-840a-9cc71c825016';
  draft_option constant text := 'list-c1cc666d-75c5-42b6-a1cc-62e00622c27c';
  decision_option constant text := 'list-50b1cc0b-593a-4fcf-bc18-be4250a91bfe';
  status_id text;
  lead_id text;
  stage_id text;
begin
  if NEW.entity_id is distinct from tkp_entity then
    return NEW;
  end if;
  status_id := coalesce((public.automation_field_ids(NEW.field_values->>status_field))[1], '');
  if status_id is distinct from created_option then
    return NEW;
  end if;
  lead_id := coalesce((public.automation_field_ids(NEW.field_values->>lead_field))[1], '');
  if lead_id = '' then
    return NEW;
  end if;
  select coalesce((public.automation_field_ids(er.field_values->>lead_stage))[1], '')
    into stage_id
  from public.entity_records er
  where er.id = lead_id;
  if stage_id <> '' and stage_id is distinct from draft_option then
    return NEW;
  end if;
  update public.entity_records
  set field_values = jsonb_set(
    coalesce(field_values, '{}'::jsonb),
    array[lead_stage],
    to_jsonb(decision_option),
    true
  )
  where id = lead_id
    and coalesce((public.automation_field_ids(field_values->>lead_stage))[1], '')
        is distinct from decision_option;
  return NEW;
end;
$$;

drop trigger if exists trg_tkp_start_lead_chain on public.entity_records;
create trigger trg_tkp_start_lead_chain
after insert or update of field_values on public.entity_records
for each row
execute function public.tkp_start_lead_chain();
