-- Fix return-for-revision targeting on stand:
-- 1) GD template → role-general-director (not role-system-admin)
-- 2) RKO template → lead → manager → department → department head
--    (do not overwrite if assignee is already conditional / custom)
-- 3) Return outcomes → reasonFieldId so respawned tasks for the returnee
--    get the «Причина возврата» highlight
--
-- Destination stages (already correct in seed/export):
--   «Вернуть менеджеру» → price → «Сформировать ТКП» (lead manager)
--   «Не согласовано»    → gipFill → «Проверить и утвердить…» (lead GIP)

do $$
declare
  heads_comment constant text := 'field-tkp-heads-comment-seed';
  lead_reject constant text := 'field-lead-reject-reason-seed';
  lead_manager constant text := 'field-d8ec5a44-6c39-4a73-8a38-103b271f3e17';
  user_dept constant text := 'field-868917ac-2d79-4e8a-b28d-165f7b126ce7';
  dept_head constant text := 'field-640540ba-4b47-4e22-8270-b4bfbff081fd';
  tkp_lead constant text := 'field-9fe24291-44ca-4031-b47f-cb99898564bc';
  role_gd constant text := 'role-general-director';
  tmpl record;
  outcomes jsonb;
  outcome jsonb;
  next_outcomes jsonb;
  access jsonb;
  label text;
  i int;
  rko_type text;
begin
  -- GD assignee
  update public.automation_task_templates
  set
    assignee = jsonb_build_object(
      'type', 'role',
      'roleId', role_gd,
      'completeWhen', 'any'
    ),
    updated_at = now()
  where id = 'atpl-tkp-approve-gd';

  -- RKO assignee: ТКП → лид → менеджер → отдел → руководитель
  -- Skip when stand already uses a custom conditional assignee.
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

  -- Wire reasonFieldId on return / reject outcomes
  for tmpl in
    select id, outcomes
    from public.automation_task_templates
    where id in (
      'atpl-tkp-approve-gip',
      'atpl-tkp-approve-rko',
      'atpl-tkp-approve-gd',
      'atpl-tkp-chief-approve',
      'atpl-lead-chief-decision'
    )
  loop
    next_outcomes := '[]'::jsonb;
    for i in 0 .. greatest(jsonb_array_length(coalesce(tmpl.outcomes, '[]'::jsonb)) - 1, -1)
    loop
      outcome := tmpl.outcomes->i;
      label := lower(replace(coalesce(outcome->>'label', ''), 'ё', 'е'));
      access := coalesce(outcome->'fieldAccess', outcome->'field_access', '{}'::jsonb);

      if label in ('вернуть менеджеру', 'не согласовано') then
        access := access
          || jsonb_build_object(
            'visibleFieldIds', jsonb_build_array(heads_comment),
            'requiredFieldIds', jsonb_build_array(heads_comment),
            'reasonFieldId', heads_comment,
            'relatedReasonId', null
          );
        outcome := outcome || jsonb_build_object(
          'fieldAccess', access,
          'isReturn', true,
          'keepFilledData', coalesce((outcome->>'keepFilledData')::boolean, true)
        );
      elsif label = 'не берем в работу' then
        access := access
          || jsonb_build_object(
            'visibleFieldIds', jsonb_build_array(lead_reject),
            'requiredFieldIds', jsonb_build_array(lead_reject),
            'reasonFieldId', lead_reject,
            'relatedReasonId', null
          );
        outcome := outcome || jsonb_build_object(
          'fieldAccess', access,
          'isReturn', true,
          'keepFilledData', coalesce((outcome->>'keepFilledData')::boolean, true)
        );
      else
        outcome := outcome || jsonb_build_object(
          'isReturn', false,
          'keepFilledData', true
        );
      end if;

      next_outcomes := next_outcomes || jsonb_build_array(outcome);
    end loop;

    update public.automation_task_templates
    set outcomes = next_outcomes, updated_at = now()
    where id = tmpl.id;
  end loop;
end;
$$;
