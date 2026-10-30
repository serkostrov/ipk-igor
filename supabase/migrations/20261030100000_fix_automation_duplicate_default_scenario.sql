-- Fix: duplicate empty default scenarios hid templates in the builder and
-- could make spawn pick a scenario with zero templates. Also fall back from
-- empty Lead.«руководитель» to Lead.«ГИП» when resolving GIP assignees.

-- 1) Drop empty duplicate defaults when another default has templates.
delete from public.automation_scenarios s
where s.is_default = true
  and not exists (
    select 1
    from public.automation_task_templates t
    where t.scenario_id = s.id
  )
  and exists (
    select 1
    from public.automation_scenarios other
    where other.process_id = s.process_id
      and other.id is distinct from s.id
      and other.is_default = true
      and exists (
        select 1
        from public.automation_task_templates t
        where t.scenario_id = other.id
      )
  );

-- 2) If several empty defaults remain, keep the oldest.
delete from public.automation_scenarios s
where s.is_default = true
  and not exists (
    select 1
    from public.automation_task_templates t
    where t.scenario_id = s.id
  )
  and exists (
    select 1
    from public.automation_scenarios older
    where older.process_id = s.process_id
      and older.id is distinct from s.id
      and older.is_default = true
      and older.created_at < s.created_at
  );

-- 3) Demote any remaining extra defaults (keep the one with most templates).
update public.automation_scenarios s
set is_default = false,
    updated_at = now()
where s.is_default = true
  and s.id is distinct from (
    select x.id
    from public.automation_scenarios x
    where x.process_id = s.process_id
      and x.is_default = true
    order by (
      select count(*)::int
      from public.automation_task_templates t
      where t.scenario_id = x.id
        and coalesce(t.enabled, true) = true
    ) desc,
    x.created_at asc
    limit 1
  );

-- 4) At most one default scenario per process.
create unique index if not exists automation_scenarios_one_default_uidx
  on public.automation_scenarios (process_id)
  where is_default = true;


create or replace function public.automation_trigger_gip_user_ids(
  p_record_id text,
  p_values jsonb default '{}'::jsonb
) returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  trigger_entity_id text;
  gip_field_id text;
  lead_field_id text;
  lead_entity_id text;
  lead_record_id text;
  lead_manager_field_id text;
  lead_gip_field_id text;
  live jsonb := '{}'::jsonb;
  merged jsonb := '{}'::jsonb;
  lead_live jsonb := '{}'::jsonb;
  k text;
  draft text;
  ids text[];
begin
  if p_record_id is null or btrim(p_record_id) = '' then
    return array[]::text[];
  end if;

  select er.entity_id, coalesce(er.field_values, '{}'::jsonb)
    into trigger_entity_id, live
  from public.entity_records er
  where er.id = p_record_id
  limit 1;
  if trigger_entity_id is null then
    return array[]::text[];
  end if;

  merged := coalesce(live, '{}'::jsonb);
  for k, draft in
    select key, value from jsonb_each_text(coalesce(p_values, '{}'::jsonb)) as t(key, value)
  loop
    if draft is not null and btrim(draft) <> '' then
      merged := jsonb_set(merged, array[k], to_jsonb(draft), true);
    end if;
  end loop;

  -- 1) Direct «ГИП» on the trigger / «Разбор ТКП».
  select nullif(trim(f->>'id'), '')
    into gip_field_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = trigger_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гипы'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'гип %'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип' then 0
    else 1
  end
  limit 1;

  if gip_field_id is not null then
    ids := public.automation_field_ids(coalesce(merged->>gip_field_id, ''));
    if coalesce(array_length(ids, 1), 0) > 0 then
      return ids;
    end if;
  end if;

  -- 2) Hop via «лид» → Lead.руководитель, else Lead.ГИП (never «Главный инженер»).
  select nullif(trim(f->>'id'), ''),
         nullif(trim(coalesce(f->>'relationEntityId', '')), '')
    into lead_field_id, lead_entity_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = trigger_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'лид'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'лиды'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'лид %'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'лид' then 0
    else 1
  end
  limit 1;

  if lead_field_id is null or lead_entity_id is null then
    return array[]::text[];
  end if;

  lead_record_id := (
    public.automation_field_ids(coalesce(merged->>lead_field_id, ''))
  )[1];
  if lead_record_id is null or btrim(lead_record_id) = '' then
    return array[]::text[];
  end if;

  select coalesce(er.field_values, '{}'::jsonb)
    into lead_live
  from public.entity_records er
  where er.id = lead_record_id
    and er.entity_id = lead_entity_id
  limit 1;
  if lead_live is null then
    return array[]::text[];
  end if;

  select nullif(trim(f->>'id'), '')
    into lead_manager_field_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = lead_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководитель'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководители'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'руководитель %'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'руководитель' then 0
    else 1
  end
  limit 1;

  if lead_manager_field_id is not null then
    ids := public.automation_field_ids(coalesce(lead_live->>lead_manager_field_id, ''));
    if coalesce(array_length(ids, 1), 0) > 0 then
      return ids;
    end if;
  end if;

  select nullif(trim(f->>'id'), '')
    into lead_gip_field_id
  from public.entities e,
       lateral jsonb_array_elements(coalesce(e.definition->'fields', '[]'::jsonb)) as f
  where e.id = lead_entity_id
    and coalesce(f->>'type', '') in ('relation', 'belonging')
    and (
      lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гипы'
      or lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) like 'гип %'
    )
  order by case
    when lower(replace(coalesce(f->>'name', ''), 'ё', 'е')) = 'гип' then 0
    else 1
  end
  limit 1;

  if lead_gip_field_id is null then
    return array[]::text[];
  end if;

  return public.automation_field_ids(coalesce(lead_live->>lead_gip_field_id, ''));
end;
$$;

grant execute on function public.automation_trigger_gip_user_ids(text, jsonb)
  to authenticated, service_role;


-- 5) Prefer the default scenario that actually has templates.
create or replace function public.automation_spawn_on_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_values jsonb := '{}'::jsonb;
  new_values jsonb := '{}'::jsonb;
  proc public.automation_processes%rowtype;
  scenario public.automation_scenarios%rowtype;
  tmpl public.automation_task_templates%rowtype;
  old_opt text;
  new_opt text;
  old_opt_id text;
  new_opt_id text;
  entered boolean;
  depth text;
  actor text;
  stored_option_id text;
  v_launch_phase text;
  store_on_prev boolean;
  is_prep_from_prev boolean;
  list_options jsonb;
  next_option_id text;
  release_mode text;
  has_earlier boolean;
begin
  depth := coalesce(current_setting('automation.execution_depth', true), '0');
  if depth <> '' and depth::integer > 0 then
    return NEW;
  end if;

  if TG_OP <> 'INSERT' then
    old_values := coalesce(OLD.field_values, '{}'::jsonb);
  end if;
  if TG_OP <> 'DELETE' then
    new_values := coalesce(NEW.field_values, '{}'::jsonb);
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
    old_opt_id := coalesce((public.automation_field_ids(old_opt))[1], '');
    new_opt_id := coalesce((public.automation_field_ids(new_opt))[1], '');

    if TG_OP = 'UPDATE'
       and old_opt_id <> ''
       and old_opt_id is distinct from new_opt_id
    then
      perform public.automation_assert_no_blocking(
        NEW.entity_id,
        NEW.id,
        proc.trigger_field_id,
        old_opt_id
      );
    end if;

    entered := false;
    if proc.trigger_kind = 'recordCreated' and TG_OP = 'INSERT' then
      entered := true;
    elsif proc.trigger_kind = 'recordUpdated' and TG_OP = 'UPDATE' then
      entered := old_values is distinct from new_values;
    elsif proc.trigger_kind in ('fieldEnter', 'fieldTransition') then
      entered := new_opt_id is distinct from old_opt_id and new_opt_id <> '';
    elsif proc.trigger_kind = 'fieldLeave' then
      entered := new_opt_id is distinct from old_opt_id and old_opt_id <> '';
    end if;

    if not entered then
      continue;
    end if;

    select * into scenario
    from public.automation_scenarios s
    where s.process_id = proc.id
      and s.is_default = false
      and jsonb_typeof(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(s.entry_conditions->'rules', '[]'::jsonb)) > 0
      and public.automation_conditions_match(s.entry_conditions, new_values, old_values)
    order by s.priority desc, s.created_at asc
    limit 1;

    if not found then
      select * into scenario
      from public.automation_scenarios s
      where s.process_id = proc.id
        and s.is_default = true
      order by (
          select count(*)::int
          from public.automation_task_templates t
          where t.scenario_id = s.id
            and coalesce(t.enabled, true) = true
        ) desc,
        s.created_at asc
      limit 1;
    end if;

    if not found then
      continue;
    end if;

    next_option_id := null;
    select coalesce(
      (
        select f->'listOptions'
        from public.entities e
        cross join lateral jsonb_array_elements(
          coalesce(e.definition->'fields', '[]'::jsonb)
        ) as f
        where e.id = NEW.entity_id
          and f->>'id' = proc.trigger_field_id
        limit 1
      ),
      '[]'::jsonb
    ) into list_options;

    select opts.opt->>'id' into next_option_id
    from jsonb_array_elements(list_options) with ordinality as opts(opt, ord)
    where exists (
      select 1
      from jsonb_array_elements(list_options) with ordinality as cur(opt, ord)
      where coalesce(cur.opt->>'id', '') in (new_opt_id, new_opt)
        and cur.ord + 1 = opts.ord
    )
    limit 1;

    for tmpl in
      select *
      from public.automation_task_templates t
      where t.scenario_id = scenario.id
        and coalesce(t.enabled, true) = true
        and public.automation_conditions_match(t.launch_conditions, new_values, old_values)
        and (
          (
            coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'onEnter'
            and (
              t.trigger_option_id = ''
              or t.trigger_option_id = new_opt
              or t.trigger_option_id = new_opt_id
              or t.trigger_option_id = any(public.automation_field_ids(new_opt))
            )
          )
          or (
            coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'beforeEnter'
            and (
              (
                next_option_id is not null
                and t.trigger_option_id = next_option_id
              )
              or exists (
                select 1
                from jsonb_array_elements(
                  coalesce(scenario.stage_transitions, '[]'::jsonb)
                ) st
                where coalesce(st->>'fromOptionId', st->>'from_option_id', '')
                      in (new_opt_id, new_opt)
                  and coalesce(st->>'toOptionId', st->>'to_option_id', '')
                      = t.trigger_option_id
              )
              or (
                (
                  t.trigger_option_id = new_opt
                  or t.trigger_option_id = new_opt_id
                  or t.trigger_option_id = any(public.automation_field_ids(new_opt))
                )
                and not exists (
                  select 1
                  from public.automation_tasks existing
                  where existing.record_id = NEW.id
                    and existing.template_id = t.id
                    and existing.status in ('pending', 'returned', 'completed')
                )
              )
            )
          )
        )
      order by
        case
          when coalesce(nullif(t.launch_phase, ''), 'onEnter') = 'beforeEnter'
            then 0
          else 1
        end,
        t.step_order asc,
        t.created_at asc
    loop
      v_launch_phase := coalesce(nullif(tmpl.launch_phase, ''), 'onEnter');

      is_prep_from_prev :=
        v_launch_phase = 'beforeEnter'
        and (
          (
            next_option_id is not null
            and tmpl.trigger_option_id = next_option_id
          )
          or exists (
            select 1
            from jsonb_array_elements(
              coalesce(scenario.stage_transitions, '[]'::jsonb)
            ) st
            where coalesce(st->>'fromOptionId', st->>'from_option_id', '')
                  in (new_opt_id, new_opt)
              and coalesce(st->>'toOptionId', st->>'to_option_id', '')
                  = tmpl.trigger_option_id
          )
        );

      store_on_prev := is_prep_from_prev;

      release_mode := coalesce(
        nullif(scenario.stage_task_release->>tmpl.trigger_option_id, ''),
        'parallel'
      );

      if release_mode = 'sequential' then
        select exists (
          select 1
          from public.automation_task_templates earlier
          where earlier.scenario_id = scenario.id
            and coalesce(earlier.enabled, true) = true
            and earlier.trigger_option_id = tmpl.trigger_option_id
            and coalesce(nullif(earlier.launch_phase, ''), 'onEnter') = v_launch_phase
            and earlier.step_order < tmpl.step_order
            and public.automation_conditions_match(
              earlier.launch_conditions,
              new_values,
              old_values
            )
        ) into has_earlier;
        if has_earlier then
          continue;
        end if;

        -- onEnter vs beforeEnter of the same stage:
        -- • interactive beforeEnter → must be completed
        -- • silent beforeEnter (autofill/actions) → must be spawned only
        --   (client completes it; waiting for complete hid the interactive task)
        if v_launch_phase = 'onEnter' then
          select exists (
            select 1
            from public.automation_task_templates be
            where be.scenario_id = scenario.id
              and coalesce(be.enabled, true) = true
              and be.trigger_option_id = tmpl.trigger_option_id
              and coalesce(nullif(be.launch_phase, ''), 'onEnter') = 'beforeEnter'
              and public.automation_conditions_match(
                be.launch_conditions,
                new_values,
                old_values
              )
              and (
                (
                  be.kind not in ('autofill', 'actions')
                  and not exists (
                    select 1
                    from public.automation_tasks done
                    where done.record_id = NEW.id
                      and done.template_id = be.id
                      and done.status = 'completed'
                  )
                )
                or (
                  be.kind in ('autofill', 'actions')
                  and not exists (
                    select 1
                    from public.automation_tasks spawned
                    where spawned.record_id = NEW.id
                      and spawned.template_id = be.id
                      and spawned.status in ('pending', 'returned', 'completed')
                  )
                )
              )
          ) into has_earlier;
          if has_earlier then
            continue;
          end if;
        end if;
      end if;

      if store_on_prev then
        stored_option_id := coalesce(nullif(new_opt_id, ''), new_opt);
      else
        stored_option_id := coalesce(
          nullif(tmpl.trigger_option_id, ''),
          nullif(new_opt_id, ''),
          new_opt
        );
      end if;

      perform public.automation_spawn_template_for_record(
        tmpl,
        proc.id,
        NEW.entity_id,
        NEW.id,
        proc.trigger_field_id,
        stored_option_id,
        new_values,
        old_values,
        actor
      );
    end loop;
  end loop;

  return NEW;
end;
$$;

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
      order by (
          select count(*)::int
          from public.automation_task_templates t
          where t.scenario_id = s.id
            and coalesce(t.enabled, true) = true
        ) desc,
        s.created_at asc
      limit 1;
    end if;

    if not found then
      continue;
    end if;

    for tmpl in
      select *
      from public.automation_task_templates t
      where t.scenario_id = scenario.id
        and coalesce(t.enabled, true) = true
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
