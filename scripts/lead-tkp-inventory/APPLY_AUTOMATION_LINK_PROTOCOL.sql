-- Apply on stand: link Protocol ↔ TKP in «Берем в работу» (update existing + create under TKP tab).
-- Safe to re-run. Also apply APPLY_LINK_PROTOCOL_TO_TKP.sql to backfill existing rows.

-- Исход «Берем в работу»:
--   1) createRecord «Разбор ТКП»
--   2) updateRecords «Протокол запуска» (где Лид = этот лид):
--        «Разбор ТКП» ← {{created}}
--      — чинит случай «протокол уже был до разбора» (SQL / прошлый шаг)
--   3) createRecord «Протокол запуска» во вкладке «Разборы ТКП» + к лиду
--      (reuse, если протокол уже на лиде)
--   4) setField стадии → ГИП
-- SQL-триггеры из 20261123120000 — страховка.

create or replace function public.automation_protocol_link_update_action()
returns jsonb
language plpgsql
immutable
as $$
declare
  proto_entity constant text := 'entity-7ecbb3e8-ec93-4e16-9539-7272ff979839';
  proto_lead constant text := 'field-5da97a4c-d240-43f2-80d8-d35eddecb7c1';
  proto_tkp constant text := 'field-42853a00-aadc-40eb-b6f6-98bb0dbe541a';
begin
  return jsonb_build_object(
    'id', 'aact-link-protocol-to-tkp',
    'kind', 'updateRecords',
    'entityId', proto_entity,
    'linkMode', 'backRelation',
    'linkFieldId', proto_lead,
    'mappings', jsonb_build_array(
      jsonb_build_object(
        'targetFieldId', proto_tkp,
        'source', '{{created}}'
      )
    )
  );
end;
$$;

create or replace function public.automation_protocol_create_under_tkp_action()
returns jsonb
language plpgsql
immutable
as $$
declare
  proto_entity constant text := 'entity-7ecbb3e8-ec93-4e16-9539-7272ff979839';
  proto_name constant text := 'field-e9da05d5-93d2-4d3a-8cef-e97bc639f2df';
  lead_name constant text := 'field-c071107e-4baf-4926-ac0b-a1822a0d364b';
  lead_tkp_tab constant text := 'tab-4b478146-7a94-4679-b2fa-ea49af4ec263';
begin
  return jsonb_build_object(
    'id', 'aact-create-launch-protocol',
    'kind', 'createRecord',
    'entityId', proto_entity,
    'mappings', jsonb_build_array(
      jsonb_build_object(
        'targetFieldId', proto_name,
        'source', '{{' || lead_name || '}}'
      )
    ),
    'parentFromRelated', jsonb_build_array(
      jsonb_build_object('linkedTabId', lead_tkp_tab)
    ),
    'alsoLinkTrigger', true,
    'askFieldIds', '[]'::jsonb,
    'multiple', true
  );
end;
$$;

create or replace function public.automation_normalize_protocol_create_action(
  action jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  proto_entity constant text := 'entity-7ecbb3e8-ec93-4e16-9539-7272ff979839';
  proto_name constant text := 'field-e9da05d5-93d2-4d3a-8cef-e97bc639f2df';
  proto_tkp constant text := 'field-42853a00-aadc-40eb-b6f6-98bb0dbe541a';
  lead_name constant text := 'field-c071107e-4baf-4926-ac0b-a1822a0d364b';
  lead_tkp_tab constant text := 'tab-4b478146-7a94-4679-b2fa-ea49af4ec263';
  mappings jsonb := '[]'::jsonb;
  mapping jsonb;
  has_name boolean := false;
begin
  if action->>'kind' is distinct from 'createRecord'
     or action->>'entityId' is distinct from proto_entity then
    return action;
  end if;

  for mapping in
    select value from jsonb_array_elements(coalesce(action->'mappings', '[]'::jsonb))
  loop
    if mapping->>'targetFieldId' = proto_tkp then
      continue;
    end if;
    if mapping->>'targetFieldId' = proto_name then
      has_name := true;
    end if;
    mappings := mappings || jsonb_build_array(mapping);
  end loop;

  if not has_name then
    mappings := mappings || jsonb_build_array(
      jsonb_build_object(
        'targetFieldId', proto_name,
        'source', '{{' || lead_name || '}}'
      )
    );
  end if;

  action := jsonb_set(action, '{mappings}', mappings, true);
  action := jsonb_set(
    action,
    '{parentFromRelated}',
    jsonb_build_array(jsonb_build_object('linkedTabId', lead_tkp_tab)),
    true
  );
  action := jsonb_set(action, '{alsoLinkTrigger}', 'true'::jsonb, true);
  action := jsonb_set(action, '{multiple}', 'true'::jsonb, true);
  if action->'askFieldIds' is null then
    action := jsonb_set(action, '{askFieldIds}', '[]'::jsonb, true);
  end if;
  return action;
end;
$$;

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
  proto_tkp constant text := 'field-42853a00-aadc-40eb-b6f6-98bb0dbe541a';
  before_tkp jsonb := '[]'::jsonb;
  after_tkp jsonb := '[]'::jsonb;
  other jsonb := '[]'::jsonb;
  tkp_action jsonb := null;
  proto_create jsonb := null;
  proto_update jsonb := null;
  action jsonb;
  seen_tkp boolean := false;
  is_link_update boolean;
begin
  if jsonb_typeof(actions) is distinct from 'array' then
    return coalesce(actions, '[]'::jsonb);
  end if;

  for action in select value from jsonb_array_elements(actions)
  loop
    if action->>'kind' = 'createRecord'
       and action->>'entityId' = tkp_entity
       and tkp_action is null then
      tkp_action := action;
      seen_tkp := true;
      continue;
    end if;

    if action->>'kind' = 'createRecord'
       and action->>'entityId' = proto_entity then
      proto_create := public.automation_normalize_protocol_create_action(action);
      continue;
    end if;

    is_link_update :=
      action->>'kind' = 'updateRecords'
      and action->>'entityId' = proto_entity
      and coalesce(action->>'linkMode', '') = 'backRelation'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(action->'mappings', '[]'::jsonb)) m
        where m->>'targetFieldId' = proto_tkp
      );

    if is_link_update then
      proto_update := action;
      continue;
    end if;

    if seen_tkp then
      after_tkp := after_tkp || jsonb_build_array(action);
    else
      before_tkp := before_tkp || jsonb_build_array(action);
    end if;
  end loop;

  if proto_update is null then
    proto_update := public.automation_protocol_link_update_action();
  end if;
  if proto_create is null then
    proto_create := public.automation_protocol_create_under_tkp_action();
  end if;

  if tkp_action is not null then
    return before_tkp
      || jsonb_build_array(tkp_action)
      || jsonb_build_array(proto_update)
      || jsonb_build_array(proto_create)
      || after_tkp;
  end if;

  for action in select value from jsonb_array_elements(before_tkp || after_tkp)
  loop
    other := other || jsonb_build_array(action);
  end loop;

  before_tkp := '[]'::jsonb;
  seen_tkp := false;
  for action in select value from jsonb_array_elements(other)
  loop
    if not seen_tkp and action->>'kind' = 'setField' then
      before_tkp := before_tkp
        || jsonb_build_array(proto_update)
        || jsonb_build_array(proto_create);
      seen_tkp := true;
    end if;
    before_tkp := before_tkp || jsonb_build_array(action);
  end loop;

  if not seen_tkp then
    before_tkp := before_tkp
      || jsonb_build_array(proto_update)
      || jsonb_build_array(proto_create);
  end if;

  return before_tkp;
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

-- Verify
select
  o->>'label' as outcome,
  a->>'kind' as kind,
  a->>'entityId' as entity_id,
  a->>'linkMode' as link_mode,
  a->'parentFromRelated' as parent_from_related,
  a->'alsoLinkTrigger' as also_link_trigger,
  a->'mappings' as mappings
from public.automation_task_templates t
cross join lateral jsonb_array_elements(t.outcomes) with ordinality as x(o, oord)
cross join lateral jsonb_array_elements(coalesce(o->'actions', '[]'::jsonb))
  with ordinality as y(a, aord)
where t.id = 'atpl-lead-chief-decision'
  and o->>'label' = 'Берем в работу'
order by aord;
