-- Remove obsolete «Коммерческие группы» catalog and auto-fill trigger.
-- Lead/TKP now use lookup «Отдел менеджера»; seed no longer recreates the entity.

drop trigger if exists trg_lead_fill_commercial_group on public.entity_records;
drop function if exists public.lead_fill_commercial_group();

-- Cascade removes entity_records for this entity.
delete from public.entities
where id = 'entity-commercial-groups';

-- Repair RKO assignee if it still points at the deleted commercial-group path.
-- Keep stand customizations that already use conditional routing.
do $$
declare
  lead_manager constant text := 'field-d8ec5a44-6c39-4a73-8a38-103b271f3e17';
  user_dept constant text := 'field-868917ac-2d79-4e8a-b28d-165f7b126ce7';
  dept_head constant text := 'field-640540ba-4b47-4e22-8270-b4bfbff081fd';
  tkp_lead constant text := 'field-9fe24291-44ca-4031-b47f-cb99898564bc';
  rko_type text;
begin
  select coalesce(assignee->>'type', '')
    into rko_type
  from public.automation_task_templates
  where id = 'atpl-tkp-approve-rko';

  if rko_type is distinct from 'conditional' then
    update public.automation_task_templates
    set
      assignee = jsonb_build_object(
        'type', 'relatedField',
        'relationFieldId', tkp_lead,
        'via', jsonb_build_array(lead_manager, user_dept),
        'fieldId', dept_head
      ),
      name = 'Согласовать ТКП — Руководитель отдела менеджера',
      updated_at = now()
    where id = 'atpl-tkp-approve-rko';
  end if;
end;
$$;
