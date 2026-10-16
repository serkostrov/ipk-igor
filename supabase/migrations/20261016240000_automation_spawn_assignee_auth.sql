-- Resolve currentUser assignees from auth.uid() → users entity record at spawn.

create or replace function public.automation_resolve_assignees(
  resolver jsonb,
  p_values jsonb,
  auth_user_id text default null
) returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rtype text := coalesce(resolver->>'type', 'currentUser');
  field_id text;
  raw text;
  ids text[];
  creator text;
  user_record_id text;
  auth_uuid uuid;
begin
  case rtype
    when 'fixedUsers' then
      return coalesce(
        (select array_agg(x) from jsonb_array_elements_text(resolver->'userIds') as t(x)),
        array[]::text[]
      );
    when 'field', 'relationFieldFanOut' then
      field_id := coalesce(resolver->>'fieldId', '');
      raw := coalesce(p_values->>field_id, '');
      ids := public.automation_field_ids(raw);
      return ids;
    when 'recordCreator' then
      creator := coalesce(p_values->>'__createdByUserId', p_values->>'createdBy', '');
      if creator <> '' then
        return array[creator];
      end if;
      -- fall through to current user
    else
      null;
  end case;

  -- currentUser / recordCreator fallback
  begin
    if auth_user_id is not null and length(trim(auth_user_id)) > 0 then
      begin
        auth_uuid := auth_user_id::uuid;
      exception when others then
        auth_uuid := null;
      end;
      if auth_uuid is not null then
        select er.id into user_record_id
        from public.entity_records er
        where er.entity_id = 'entity-system-users'
          and er.auth_user_id = auth_uuid
        limit 1;
        if user_record_id is not null then
          return array[user_record_id];
        end if;
        return array[trim(auth_user_id)];
      end if;
      return array[trim(auth_user_id)];
    end if;

    if auth.uid() is not null then
      select er.id into user_record_id
      from public.entity_records er
      where er.entity_id = 'entity-system-users'
        and er.auth_user_id = auth.uid()
      limit 1;
      if user_record_id is not null then
        return array[user_record_id];
      end if;
      return array[auth.uid()::text];
    end if;
  exception when others then
    null;
  end;

  return array[]::text[];
end;
$$;

create or replace function public.automation_spawn_on_record_change()
returns trigger
language plpgsql
security definer
as $$
declare
  old_values jsonb := coalesce(OLD.field_values, '{}'::jsonb);
  new_values jsonb := coalesce(NEW.field_values, '{}'::jsonb);
  proc record;
  scenario record;
  tmpl record;
  old_opt text;
  new_opt text;
  assignee_ids text[];
  assignee_id text;
  task_id text;
  task_name text;
  task_description text;
  due timestamptz;
  template_snapshot jsonb;
  entered boolean;
  depth text;
  n_msg text;
  actor text;
begin
  depth := coalesce(current_setting('automation.execution_depth', true), '0');
  if depth <> '' and depth::integer > 0 then
    return NEW;
  end if;

  actor := coalesce(auth.uid()::text, null);

  for proc in
    select *
    from public.automation_processes p
    where p.entity_id = NEW.entity_id
      and p.enabled = true
      and p.trigger_field_id <> ''
  loop
    old_opt := coalesce(old_values->>proc.trigger_field_id, '');
    new_opt := coalesce(new_values->>proc.trigger_field_id, '');

    if TG_OP = 'UPDATE'
       and old_opt <> ''
       and old_opt is distinct from new_opt
    then
      perform public.automation_assert_no_blocking(
        NEW.entity_id,
        NEW.id,
        proc.trigger_field_id,
        (public.automation_field_ids(old_opt))[1]
      );
    end if;

    entered := false;
    if proc.trigger_kind = 'recordCreated' and TG_OP = 'INSERT' then
      entered := true;
    elsif proc.trigger_kind = 'recordUpdated' and TG_OP = 'UPDATE' then
      entered := old_values is distinct from new_values;
    elsif proc.trigger_kind in ('fieldEnter', 'fieldTransition') then
      entered := new_opt is distinct from old_opt and new_opt <> '';
    elsif proc.trigger_kind = 'fieldLeave' then
      entered := new_opt is distinct from old_opt and old_opt <> '';
    end if;

    if not entered then
      continue;
    end if;

    select * into scenario
    from public.automation_scenarios s
    where s.process_id = proc.id
      and s.is_default = false
      and public.automation_conditions_match(s.entry_conditions, new_values, old_values)
    order by s.priority desc, s.created_at asc
    limit 1;

    if scenario.id is null then
      select * into scenario
      from public.automation_scenarios s
      where s.process_id = proc.id
        and s.is_default = true
      order by s.created_at asc
      limit 1;
    end if;

    if scenario.id is null then
      continue;
    end if;

    for tmpl in
      select *
      from public.automation_task_templates t
      where t.scenario_id = scenario.id
        and (
          t.trigger_option_id = ''
          or t.trigger_option_id = new_opt
          or t.trigger_option_id = any(public.automation_field_ids(new_opt))
        )
        and public.automation_conditions_match(t.launch_conditions, new_values, old_values)
    loop
      assignee_ids := public.automation_resolve_assignees(tmpl.assignee, new_values, actor);
      if cardinality(assignee_ids) = 0 then
        assignee_ids := array[null::text];
      end if;

      template_snapshot := jsonb_build_object(
        'id', tmpl.id,
        'scenarioId', tmpl.scenario_id,
        'name', tmpl.name,
        'nameTemplate', tmpl.name_template,
        'description', tmpl.description,
        'triggerOptionId', tmpl.trigger_option_id,
        'stepOrder', tmpl.step_order,
        'isBlocking', tmpl.is_blocking,
        'kind', tmpl.kind,
        'launchConditions', tmpl.launch_conditions,
        'assignee', tmpl.assignee,
        'watchers', tmpl.watchers,
        'outcomes', tmpl.outcomes,
        'sla', tmpl.sla,
        'materials', tmpl.materials
      );

      task_name := public.automation_render_template(
        case
          when nullif(btrim(tmpl.name_template), '') is not null then tmpl.name_template
          else tmpl.name
        end,
        new_values
      );
      if nullif(btrim(task_name), '') is null then
        task_name := tmpl.name;
      end if;

      task_description := public.automation_render_template(
        coalesce(tmpl.description, ''),
        new_values
      );

      due := null;
      if tmpl.sla is not null and (tmpl.sla->>'hours') is not null then
        begin
          due := now() + ((tmpl.sla->>'hours')::numeric || ' hours')::interval;
        exception when others then
          due := null;
        end;
      end if;

      foreach assignee_id in array assignee_ids
      loop
        task_id := 'atask-' || gen_random_uuid()::text;
        begin
          insert into public.automation_tasks (
            id, process_id, scenario_id, template_id,
            entity_id, record_id, trigger_field_id, trigger_option_id,
            assignee_user_id, status, is_blocking, step_order,
            name, description, config, due_at
          ) values (
            task_id,
            proc.id,
            scenario.id,
            tmpl.id,
            NEW.entity_id,
            NEW.id,
            proc.trigger_field_id,
            coalesce(nullif(tmpl.trigger_option_id, ''), new_opt),
            assignee_id,
            'pending',
            tmpl.is_blocking,
            tmpl.step_order,
            task_name,
            task_description,
            template_snapshot,
            due
          );

          for n_msg in
            select coalesce(nullif(r.message_template, ''), 'Назначена задача: ' || task_name)
            from public.automation_notification_rules r
            where r.template_id = tmpl.id
              and r.event = 'assigned'
          loop
            perform public.create_notification(
              coalesce(assignee_id, auth.uid()::text),
              'Назначена задача',
              n_msg,
              'automation',
              null,
              NEW.entity_id,
              NEW.id,
              task_id,
              true
            );
          end loop;
        exception
          when unique_violation then
            null;
          when others then
            raise warning 'automation spawn failed: %', sqlerrm;
        end;
      end loop;
    end loop;
  end loop;

  return NEW;
end;
$$;
