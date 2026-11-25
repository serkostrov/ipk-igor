-- Enforce scenario stage_transitions (incl. folderHasFiles) on record write.
-- Client already gates moves; this blocks API/SQL bypasses and duplicate
-- empty-transition processes that previously skipped folder checks.

create or replace function public.automation_pick_scenario_for_stage_gate(
  p_process_id text,
  p_values jsonb,
  p_previous jsonb
) returns public.automation_scenarios
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  scenario public.automation_scenarios%rowtype;
begin
  select * into scenario
  from public.automation_scenarios s
  where s.process_id = p_process_id
    and s.is_default = false
    and jsonb_typeof(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) > 0
    and public.automation_conditions_match(s.entry_conditions, p_values, p_previous)
  order by s.priority desc, s.created_at asc
  limit 1;

  if found then
    return scenario;
  end if;

  select * into scenario
  from public.automation_scenarios s
  where s.process_id = p_process_id
    and s.is_default = true
  order by
    jsonb_array_length(coalesce(s.stage_transitions, '[]'::jsonb)) desc,
    (
      select count(*)::int
      from public.automation_task_templates t
      where t.scenario_id = s.id
        and coalesce(t.enabled, true) = true
    ) desc,
    s.created_at asc
  limit 1;

  return scenario;
end;
$$;

create or replace function public.automation_gate_stage_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_values jsonb := coalesce(OLD.field_values, '{}'::jsonb);
  new_values jsonb := coalesce(NEW.field_values, '{}'::jsonb);
  proc public.automation_processes%rowtype;
  scenario public.automation_scenarios%rowtype;
  st jsonb;
  trigger_field text;
  from_id text;
  to_id text;
  else_id text;
  old_opt text;
  new_opt text;
  old_opt_id text;
  new_opt_id text;
  matched_to boolean;
  matched_else boolean;
  has_from_edge boolean;
  conditions_ok boolean;
  best_transitions jsonb := null;
  best_trigger text := null;
  best_len int := -1;
  edge_len int;
begin
  if TG_OP <> 'UPDATE' then
    return NEW;
  end if;

  for proc in
    select *
    from public.automation_processes p
    where p.entity_id = NEW.entity_id
      and p.enabled = true
      and nullif(btrim(p.trigger_field_id), '') is not null
  loop
    old_opt := coalesce(old_values->>proc.trigger_field_id, '');
    new_opt := coalesce(new_values->>proc.trigger_field_id, '');
    old_opt_id := coalesce((public.automation_field_ids(old_opt))[1], '');
    new_opt_id := coalesce((public.automation_field_ids(new_opt))[1], '');

    if old_opt_id = '' or new_opt_id = '' or old_opt_id = new_opt_id then
      continue;
    end if;

    scenario := public.automation_pick_scenario_for_stage_gate(
      proc.id,
      new_values,
      old_values
    );
    if scenario.id is null then
      continue;
    end if;

    edge_len := jsonb_array_length(coalesce(scenario.stage_transitions, '[]'::jsonb));
    if edge_len > best_len then
      best_len := edge_len;
      best_transitions := coalesce(scenario.stage_transitions, '[]'::jsonb);
      best_trigger := proc.trigger_field_id;
    end if;
  end loop;

  if best_len is null or best_len <= 0 or best_trigger is null then
    return NEW;
  end if;

  trigger_field := best_trigger;
  old_opt := coalesce(old_values->>trigger_field, '');
  new_opt := coalesce(new_values->>trigger_field, '');
  old_opt_id := coalesce((public.automation_field_ids(old_opt))[1], '');
  new_opt_id := coalesce((public.automation_field_ids(new_opt))[1], '');
  if old_opt_id = '' or new_opt_id = '' or old_opt_id = new_opt_id then
    return NEW;
  end if;

  matched_to := false;
  matched_else := false;
  has_from_edge := false;

  for st in
    select value
    from jsonb_array_elements(best_transitions) as t(value)
  loop
    from_id := coalesce(st->>'fromOptionId', st->>'from_option_id', '');
    to_id := coalesce(st->>'toOptionId', st->>'to_option_id', '');
    else_id := coalesce(st->>'elseOptionId', st->>'else_option_id', '');

    if from_id <> old_opt_id then
      continue;
    end if;
    has_from_edge := true;

    if to_id = new_opt_id then
      matched_to := true;
      conditions_ok :=
        jsonb_array_length(
          coalesce(st->'conditions'->'rules', '[]'::jsonb)
        ) = 0
        or public.automation_conditions_match(
          coalesce(
            st->'conditions',
            '{"match":"all","rules":[],"version":1}'::jsonb
          ),
          new_values,
          old_values
        );
      if not conditions_ok then
        if else_id <> '' and else_id <> old_opt_id then
          NEW.field_values := jsonb_set(
            new_values,
            array[trigger_field],
            to_jsonb(else_id),
            true
          );
          return NEW;
        end if;
        raise exception
          'AUTOMATION_BLOCKED: Условия перехода на эту стадию не выполнены'
          using errcode = 'P0001';
      end if;
    elsif else_id = new_opt_id then
      matched_else := true;
    end if;
  end loop;

  if has_from_edge and not matched_to and not matched_else then
    raise exception
      'AUTOMATION_BLOCKED: Переход на эту стадию недоступен'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_automation_gate_stage_transitions on public.entity_records;
create trigger trg_automation_gate_stage_transitions
  before update on public.entity_records
  for each row
  execute function public.automation_gate_stage_transitions();

comment on function public.automation_gate_stage_transitions() is
  'BEFORE UPDATE: enforce scenario stage_transitions (folderHasFiles etc.), redirect to else or block.';
