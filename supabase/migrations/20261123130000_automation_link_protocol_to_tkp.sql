-- Исход «Берем в работу»: явно создать «Протокол запуска» и связать
-- его с лидом (withParentLink) и с только что созданным «Разбором ТКП»
-- (маппинг {{created}}). Так процесс виден и настраивается в UI
-- автоматизации. SQL-триггеры из 20261123120000 остаются страховкой
-- (ручной переход стадии / порядок «протокол раньше разбора»).

create or replace function public.automation_inject_protocol_create_after_tkp(
  actions jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  tkp_entity constant text := 'entity-33de9416-88f2-4360-9f96-9c71d0886fbc';
  proto_entity constant text := 'entity-7ecbb3e8-ec93-4e16-9539-7272ff979839';
  proto_name constant text := 'field-e9da05d5-93d2-4d3a-8cef-e97bc639f2df';
  proto_tkp constant text := 'field-42853a00-aadc-40eb-b6f6-98bb0dbe541a';
  lead_name constant text := 'field-c071107e-4baf-4926-ac0b-a1822a0d364b';
  result jsonb := '[]'::jsonb;
  action jsonb;
  has_proto_create boolean := false;
  inserted boolean := false;
  proto_action jsonb;
begin
  if jsonb_typeof(actions) is distinct from 'array' then
    return coalesce(actions, '[]'::jsonb);
  end if;

  for action in select value from jsonb_array_elements(actions)
  loop
    if action->>'kind' = 'createRecord'
       and action->>'entityId' = proto_entity then
      has_proto_create := true;
    end if;
  end loop;

  if has_proto_create then
    return actions;
  end if;

  proto_action := jsonb_build_object(
    'id', 'aact-create-launch-protocol',
    'kind', 'createRecord',
    'entityId', proto_entity,
    'mappings', jsonb_build_array(
      jsonb_build_object(
        'targetFieldId', proto_name,
        'source', '{{' || lead_name || '}}'
      ),
      jsonb_build_object(
        'targetFieldId', proto_tkp,
        'source', '{{created}}'
      )
    ),
    'askFieldIds', '[]'::jsonb,
    'multiple', false
  );

  for action in select value from jsonb_array_elements(actions)
  loop
    result := result || jsonb_build_array(action);
    if not inserted
       and action->>'kind' = 'createRecord'
       and action->>'entityId' = tkp_entity then
      result := result || jsonb_build_array(proto_action);
      inserted := true;
    end if;
  end loop;

  if not inserted then
    -- Нет createRecord ТКП — ставим протокол перед первым setField стадии.
    result := '[]'::jsonb;
    inserted := false;
    for action in select value from jsonb_array_elements(actions)
    loop
      if not inserted and action->>'kind' = 'setField' then
        result := result || jsonb_build_array(proto_action);
        inserted := true;
      end if;
      result := result || jsonb_build_array(action);
    end loop;
    if not inserted then
      result := actions || jsonb_build_array(proto_action);
    end if;
  end if;

  return result;
end;
$$;

update public.automation_task_templates t
set
  outcomes = (
    select coalesce(jsonb_agg(
      case
        when coalesce(o->>'label', '') = 'Берем в работу' then
          jsonb_set(
            o,
            '{actions}',
            public.automation_inject_protocol_create_after_tkp(
              coalesce(o->'actions', '[]'::jsonb)
            ),
            true
          )
        else o
      end
      order by ord
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(t.outcomes, '[]'::jsonb))
      with ordinality as x(o, ord)
  ),
  updated_at = now()
where t.id = 'atpl-lead-chief-decision';

update public.automation_tasks task
set config = jsonb_set(
  task.config,
  '{outcomes}',
  (
    select coalesce(jsonb_agg(
      case
        when coalesce(o->>'label', '') = 'Берем в работу' then
          jsonb_set(
            o,
            '{actions}',
            public.automation_inject_protocol_create_after_tkp(
              coalesce(o->'actions', '[]'::jsonb)
            ),
            true
          )
        else o
      end
      order by ord
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(task.config->'outcomes', '[]'::jsonb))
      with ordinality as x(o, ord)
  ),
  true
)
where task.template_id = 'atpl-lead-chief-decision'
  and task.status in ('open', 'in_progress', 'pending');
