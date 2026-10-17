-- Ensure beforeEnter prep tasks exist when the user tries to move toward a stage.
-- Spawns missing templates so the fill dialog can open even if the record landed
-- on the previous stage before automation was configured / spawn failed.

create or replace function public.automation_ensure_before_enter_prep(
  p_record_id text,
  p_to_option_id text
) returns setof public.automation_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.entity_records%rowtype;
  proc public.automation_processes%rowtype;
  scenario public.automation_scenarios%rowtype;
  tmpl public.automation_task_templates%rowtype;
  values jsonb;
  old_values jsonb := '{}'::jsonb;
  actor text;
  from_opt text;
  to_opt text;
  spawned_id text;
begin
  if p_record_id is null or btrim(p_record_id) = '' then
    return;
  end if;
  to_opt := nullif(btrim(coalesce(p_to_option_id, '')), '');
  if to_opt is null then
    return;
  end if;

  select * into rec from public.entity_records where id = p_record_id;
  if rec.id is null then
    return;
  end if;

  values := coalesce(rec.field_values, '{}'::jsonb);
  actor := coalesce(auth.uid()::text, null);

  for proc in
    select *
    from public.automation_processes p
    where p.entity_id = rec.entity_id
      and p.enabled = true
      and p.trigger_field_id <> ''
  loop
    from_opt := coalesce(
      (public.automation_field_ids(coalesce(values->>proc.trigger_field_id, '')))[1],
      ''
    );
    if from_opt = '' or from_opt = to_opt then
      continue;
    end if;

    select * into scenario
    from public.automation_scenarios s
    where s.process_id = proc.id
      and s.is_default = false
      and jsonb_typeof(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) > 0
      and public.automation_conditions_match(s.entry_conditions, values, old_values)
    order by s.priority desc, s.created_at asc
    limit 1;

    if not found then
      select * into scenario
      from public.automation_scenarios s
      where s.process_id = proc.id
        and s.is_default = true
      order by s.created_at asc
      limit 1;
    end if;

    if not found then
      continue;
    end if;

    for tmpl in
      select *
      from public.automation_task_templates t
      where t.scenario_id = scenario.id
        and coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'beforeEnter'
        and t.trigger_option_id = to_opt
        and public.automation_conditions_match(t.launch_conditions, values, old_values)
      order by t.step_order asc, t.created_at asc
    loop
      if exists (
        select 1
        from public.automation_tasks existing
        where existing.record_id = rec.id
          and existing.template_id = tmpl.id
          and existing.status in ('pending', 'returned', 'completed')
      ) then
        continue;
      end if;

      spawned_id := public.automation_spawn_template_for_record(
        tmpl,
        proc.id,
        rec.entity_id,
        rec.id,
        proc.trigger_field_id,
        from_opt,
        values,
        old_values,
        actor
      );
    end loop;
  end loop;

  return query
  select t.*
  from public.automation_tasks t
  where t.record_id = p_record_id
    and t.status in ('pending', 'returned')
    and (
      coalesce(t.config->>'launchPhase', t.config->>'launch_phase', '') = 'beforeEnter'
      or t.trigger_option_id = to_opt
    );
end;
$$;

grant execute on function public.automation_ensure_before_enter_prep(text, text)
  to authenticated;
grant execute on function public.automation_ensure_before_enter_prep(text, text)
  to service_role;
