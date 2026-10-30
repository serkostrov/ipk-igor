-- Template setting: where read-only «Для просмотра» appears relative to
-- outcome buttons. Outcome `buttonMode` lives inside outcomes jsonb.

alter table public.automation_task_templates
  add column if not exists view_fields_placement text not null default 'beforeOutcomes';

alter table public.automation_task_templates
  drop constraint if exists automation_task_templates_view_fields_placement_check;

alter table public.automation_task_templates
  add constraint automation_task_templates_view_fields_placement_check
  check (view_fields_placement in ('beforeOutcomes', 'afterSelect'));

create or replace function public.automation_spawn_template_for_record(
  p_tmpl public.automation_task_templates,
  p_process_id text,
  p_entity_id text,
  p_record_id text,
  p_trigger_field_id text,
  p_stored_option_id text,
  p_values jsonb,
  p_old_values jsonb,
  p_actor text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  assignee_ids text[];
  assignee_id text;
  rtype text;
  task_id text;
  task_name text;
  task_description text;
  due timestamptz;
  template_snapshot jsonb;
  launch_phase text;
  autofill_outcome_id text;
  outcome_elem jsonb;
  first_task_id text := null;
  is_silent boolean;
  already boolean;
begin
  if coalesce(p_tmpl.enabled, true) = false then
    return null;
  end if;

  launch_phase := coalesce(nullif(p_tmpl.launch_phase, ''), 'onEnter');
  is_silent := p_tmpl.kind in ('autofill', 'actions');

  if is_silent then
    assignee_ids := array[null::text];
  else
    assignee_ids := public.automation_resolve_assignees(
      p_tmpl.assignee,
      p_values,
      p_actor,
      p_record_id
    );
    if cardinality(assignee_ids) = 0 then
      rtype := coalesce(p_tmpl.assignee->>'type', 'currentUser');
      if rtype in ('currentUser', 'recordCreator') then
        assignee_ids := public.automation_resolve_assignees(
          '{"type":"currentUser"}'::jsonb,
          p_values,
          p_actor,
          p_record_id
        );
      end if;
    end if;
    if cardinality(assignee_ids) = 0 then
      assignee_ids := array[null::text];
    end if;
  end if;

  template_snapshot := jsonb_build_object(
    'id', p_tmpl.id,
    'scenarioId', p_tmpl.scenario_id,
    'name', p_tmpl.name,
    'nameTemplate', p_tmpl.name_template,
    'description', p_tmpl.description,
    'triggerOptionId', p_tmpl.trigger_option_id,
    'stepOrder', p_tmpl.step_order,
    'isBlocking', p_tmpl.is_blocking,
    'enabled', coalesce(p_tmpl.enabled, true),
    'kind', p_tmpl.kind,
    'launchPhase', launch_phase,
    'launchConditions', p_tmpl.launch_conditions,
    'assignee', p_tmpl.assignee,
    'watchers', p_tmpl.watchers,
    'outcomes', p_tmpl.outcomes,
    'sla', p_tmpl.sla,
    'materials', p_tmpl.materials,
    'viewFieldsPlacement', coalesce(
      nullif(p_tmpl.view_fields_placement, ''),
      'beforeOutcomes'
    )
  );

  task_name := public.automation_render_template(
    case
      when nullif(btrim(p_tmpl.name_template), '') is not null then p_tmpl.name_template
      else p_tmpl.name
    end,
    p_values
  );
  if nullif(btrim(task_name), '') is null then
    task_name := p_tmpl.name;
  end if;

  task_description := public.automation_render_template(
    coalesce(p_tmpl.description, ''),
    p_values
  );

  due := null;
  if p_tmpl.sla is not null and (p_tmpl.sla->>'hours') is not null then
    begin
      due := now() + ((p_tmpl.sla->>'hours')::numeric || ' hours')::interval;
    exception when others then
      due := null;
    end;
  end if;

  autofill_outcome_id := null;
  if is_silent then
    for outcome_elem in
      select value
      from jsonb_array_elements(coalesce(p_tmpl.outcomes, '[]'::jsonb)) as value
    loop
      if public.automation_conditions_match(
        coalesce(
          outcome_elem->'conditions',
          '{"version":1,"match":"all","rules":[]}'::jsonb
        ),
        p_values,
        p_old_values
      ) then
        autofill_outcome_id := outcome_elem->>'id';
        exit;
      end if;
    end loop;
    if autofill_outcome_id is null then
      autofill_outcome_id := coalesce(p_tmpl.outcomes->0->>'id', '');
    end if;
  end if;

  foreach assignee_id in array assignee_ids
  loop
    select exists (
      select 1
      from public.automation_tasks existing
      where existing.record_id = p_record_id
        and existing.template_id = p_tmpl.id
        and coalesce(existing.assignee_user_id, '') = coalesce(assignee_id, '')
        and existing.status in ('pending', 'returned', 'completed')
    ) into already;
    if already then
      continue;
    end if;

    task_id := 'atask-' || gen_random_uuid()::text;
    begin
      insert into public.automation_tasks (
        id, process_id, scenario_id, template_id,
        entity_id, record_id, trigger_field_id, trigger_option_id,
        assignee_user_id, status, is_blocking, step_order,
        name, description, config, due_at, outcome_id
      ) values (
        task_id,
        p_process_id,
        p_tmpl.scenario_id,
        p_tmpl.id,
        p_entity_id,
        p_record_id,
        p_trigger_field_id,
        p_stored_option_id,
        assignee_id,
        'pending',
        p_tmpl.is_blocking,
        p_tmpl.step_order,
        task_name,
        task_description,
        template_snapshot,
        due,
        autofill_outcome_id
      );
      if first_task_id is null then
        first_task_id := task_id;
      end if;
    exception
      when unique_violation then
        continue;
      when others then
        raise warning 'automation spawn insert failed: %', sqlerrm;
        continue;
    end;

    if is_silent then
      continue;
    end if;

    begin
      perform public.automation_notify_from_rules(
        p_tmpl.id,
        'assigned',
        p_values,
        p_old_values,
        p_actor,
        'Назначена задача',
        'Назначена задача: ' || task_name,
        p_entity_id,
        p_record_id,
        task_id,
        assignee_id
      );
    exception when others then
      raise warning 'automation spawn notify failed: %', sqlerrm;
    end;
  end loop;

  return first_task_id;
end;
$$;

grant execute on function public.automation_spawn_template_for_record(
  public.automation_task_templates,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  text
) to authenticated, service_role;
