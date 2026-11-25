-- Stage transitions with conditions (folderHasFiles etc.) still gate the
-- exact from→to edge. Free manual moves to other stages are allowed — the
-- graph is not a destination whitelist.

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
    end if;
  end loop;

  -- No matching from→to edge: allow free manual stage moves.
  -- Conditioned edges are enforced only when matched_to above.
  return NEW;
end;
$$;

comment on function public.automation_gate_stage_transitions() is
  'BEFORE UPDATE: enforce conditioned stage_transitions (folderHasFiles etc.); free moves to other stages are allowed.';
