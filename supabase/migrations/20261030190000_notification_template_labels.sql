-- Render notification / automation templates with human labels:
-- relation → record name, list → option name, strip unresolved {{field-…}}.

create or replace function public.entity_record_display_name(p_record_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rid text := nullif(btrim(coalesce(p_record_id, '')), '');
  ent_id text;
  def jsonb;
  field jsonb;
  name_field_id text;
  label text;
begin
  if rid is null then
    return null;
  end if;

  select er.entity_id, e.definition
  into ent_id, def
  from public.entity_records er
  join public.entities e on e.id = er.entity_id
  where er.id = rid
  limit 1;

  if ent_id is null then
    return null;
  end if;

  -- Prefer locked name field, then «Название».
  for field in
    select *
    from jsonb_array_elements(coalesce(def->'fields', '[]'::jsonb))
  loop
    if coalesce((field->>'locked')::boolean, false)
       or lower(coalesce(field->>'name', '')) in ('название', 'name')
    then
      name_field_id := nullif(btrim(coalesce(field->>'id', '')), '');
      exit;
    end if;
  end loop;

  if name_field_id is null then
    return null;
  end if;

  select nullif(btrim(coalesce(er.field_values->>name_field_id, '')), '')
  into label
  from public.entity_records er
  where er.id = rid;

  if label is null or label = 'Без названия' then
    return null;
  end if;
  -- Avoid returning another raw record id as a «name».
  if label ~* '^(record-|user-)[0-9a-f-]{8,}$' then
    return coalesce(public.entity_record_display_name(label), label);
  end if;
  return label;
end;
$$;

create or replace function public.entity_format_field_value(
  p_entity_id text,
  p_field_id text,
  p_raw text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  raw text := coalesce(p_raw, '');
  def jsonb;
  field jsonb;
  field_type text;
  target_id text;
  opt jsonb;
  ids text[];
  id text;
  labels text[] := array[]::text[];
  label text;
  parsed jsonb;
begin
  if nullif(btrim(raw), '') is null then
    return '';
  end if;

  select e.definition into def
  from public.entities e
  where e.id = p_entity_id
  limit 1;

  if def is not null and nullif(btrim(coalesce(p_field_id, '')), '') is not null then
    select f into field
    from jsonb_array_elements(coalesce(def->'fields', '[]'::jsonb)) as f
    where f->>'id' = p_field_id
    limit 1;

    if field is not null then
      field_type := coalesce(field->>'type', '');
      target_id := nullif(btrim(coalesce(field->>'relationEntityId', '')), '');

      if field_type = 'list' then
        -- Single or multi list values.
        ids := array[]::text[];
        if left(btrim(raw), 1) = '[' then
          begin
            parsed := raw::jsonb;
            if jsonb_typeof(parsed) = 'array' then
              select coalesce(array_agg(x), array[]::text[])
              into ids
              from jsonb_array_elements_text(parsed) as t(x);
            end if;
          exception when others then
            ids := string_to_array(raw, ',');
          end;
        else
          ids := string_to_array(raw, ',');
        end if;

        foreach id in array ids
        loop
          id := nullif(btrim(id), '');
          if id is null then
            continue;
          end if;
          if id like '__other__:%' then
            labels := array_append(labels, substr(id, length('__other__:') + 1));
            continue;
          end if;
          label := null;
          for opt in
            select *
            from jsonb_array_elements(coalesce(field->'listOptions', '[]'::jsonb))
          loop
            if opt->>'id' = id then
              label := nullif(btrim(coalesce(opt->>'name', '')), '');
              exit;
            end if;
          end loop;
          labels := array_append(labels, coalesce(label, id));
        end loop;
        return array_to_string(labels, ', ');
      end if;

      if field_type in ('relation', 'belonging', 'users', 'dependencies')
         or target_id is not null
      then
        ids := array[]::text[];
        if left(btrim(raw), 1) = '[' then
          begin
            parsed := raw::jsonb;
            if jsonb_typeof(parsed) = 'array' then
              select coalesce(array_agg(x), array[]::text[])
              into ids
              from jsonb_array_elements_text(parsed) as t(x);
            end if;
          exception when others then
            ids := string_to_array(raw, ',');
          end;
        else
          ids := string_to_array(raw, ',');
        end if;

        foreach id in array ids
        loop
          id := nullif(btrim(id), '');
          if id is null then
            continue;
          end if;
          label := public.entity_record_display_name(id);
          labels := array_append(labels, coalesce(label, id));
        end loop;
        return array_to_string(labels, ', ');
      end if;
    end if;
  end if;

  -- Fallback: bare record id → display name.
  if raw ~* '^(record-|user-)[0-9a-f-]{8,}$' then
    return coalesce(public.entity_record_display_name(raw), raw);
  end if;

  if left(btrim(raw), 1) = '[' then
    begin
      parsed := raw::jsonb;
      if jsonb_typeof(parsed) = 'array' then
        select coalesce(array_agg(coalesce(public.entity_record_display_name(x), x)), array[]::text[])
        into labels
        from jsonb_array_elements_text(parsed) as t(x);
        return array_to_string(labels, ', ');
      end if;
    exception when others then
      null;
    end;
  end if;

  return raw;
end;
$$;

create or replace function public.entity_replace_record_ids_in_text(p_text text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result text := coalesce(p_text, '');
  m text[];
  piece text;
  resolved text;
  pos int;
  after_text text;
  guard int := 0;
begin
  loop
    guard := guard + 1;
    exit when guard > 32;
    m := regexp_match(result, '((?:record-|user-)[0-9a-fA-F-]{8,})');
    exit when m is null;
    piece := m[1];
    pos := position(piece in result);
    after_text := substr(result, pos + length(piece));
    -- Trim one leading space when comparing the following text.
    if left(after_text, 1) = ' ' then
      after_text := substr(after_text, 2);
    end if;
    resolved := public.entity_record_display_name(piece);
    if resolved is null or resolved = '' then
      result := replace(result, piece, '');
    elsif lower(left(after_text, length(resolved))) = lower(resolved) then
      -- «record-… Same Name…» → drop the id, keep the existing name.
      result := replace(result, piece, '');
    else
      result := replace(result, piece, resolved);
    end if;
  end loop;
  result := regexp_replace(result, '\s{2,}', ' ', 'g');
  return btrim(result);
end;
$$;

create or replace function public.notification_render_template(
  p_template text,
  p_values jsonb,
  p_entity_id text default null
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result text := coalesce(p_template, '');
  m text[];
  token text;
  field_id text;
  raw text;
  label text;
begin
  if result = '' then
    return result;
  end if;

  -- Replace placeholders found in the template (not only keys present in values).
  for m in
    select regexp_matches(result, '\{\{([^}]+)\}\}', 'g')
  loop
    field_id := nullif(btrim(coalesce(m[1], '')), '');
    if field_id is null then
      continue;
    end if;
    token := '{{' || field_id || '}}';
    raw := coalesce(p_values->>field_id, '');
    label := public.entity_format_field_value(p_entity_id, field_id, raw);
    result := replace(result, token, coalesce(label, ''));
  end loop;

  -- Drop any leftover tokens, resolve bare record ids, tidy whitespace.
  result := regexp_replace(result, '\{\{[^}]+\}\}', '', 'g');
  result := public.entity_replace_record_ids_in_text(result);
  result := regexp_replace(result, '[ \t]{2,}', ' ', 'g');
  result := regexp_replace(result, ' ?([,;:])', '\1', 'g');
  return btrim(result);
end;
$$;

-- Keep automation_render_template signature; add optional entity id for labels.
create or replace function public.automation_render_template(
  p_template text,
  p_values jsonb,
  p_entity_id text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.notification_render_template(p_template, p_values, p_entity_id);
end;
$$;

-- Entity notification rules: pass entity id into renderer.
create or replace function public.notification_dispatch_on_record_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_values jsonb := coalesce(OLD.field_values, '{}'::jsonb);
  new_values jsonb := coalesce(NEW.field_values, '{}'::jsonb);
  rule record;
  matched boolean;
  old_opt text;
  new_opt text;
  recipient_ids text[];
  recipient_id text;
  title text;
  message text;
  depth text;
  actor text;
begin
  depth := coalesce(current_setting('automation.execution_depth', true), '0');
  if depth <> '' and depth::integer > 0 then
    return NEW;
  end if;

  actor := coalesce(auth.uid()::text, '');

  for rule in
    select *
    from public.notification_rules r
    where r.enabled = true
      and r.entity_id = NEW.entity_id
  loop
    matched := false;
    old_opt := '';
    new_opt := '';

    if rule.field_id <> '' then
      old_opt := coalesce(old_values->>rule.field_id, '');
      new_opt := coalesce(new_values->>rule.field_id, '');
    end if;

    if rule.trigger_kind = 'recordCreated' and TG_OP = 'INSERT' then
      matched := true;
    elsif rule.trigger_kind = 'recordUpdated' and TG_OP = 'UPDATE' then
      matched := old_values is distinct from new_values;
    elsif rule.trigger_kind = 'fieldEnter' and TG_OP in ('INSERT', 'UPDATE') then
      matched :=
        new_opt is distinct from old_opt
        and new_opt <> ''
        and (
          rule.option_id = ''
          or rule.option_id = new_opt
          or rule.option_id = any(public.automation_field_ids(new_opt))
        );
    elsif rule.trigger_kind = 'fieldLeave' and TG_OP = 'UPDATE' then
      matched :=
        new_opt is distinct from old_opt
        and old_opt <> ''
        and (
          rule.option_id = ''
          or rule.option_id = old_opt
          or rule.option_id = any(public.automation_field_ids(old_opt))
        );
    elsif rule.trigger_kind = 'fieldTransition' and TG_OP = 'UPDATE' then
      matched :=
        new_opt is distinct from old_opt
        and (
          rule.from_option_id = ''
          or rule.from_option_id = old_opt
          or rule.from_option_id = any(public.automation_field_ids(old_opt))
        )
        and (
          rule.to_option_id = ''
          or rule.to_option_id = new_opt
          or rule.to_option_id = any(public.automation_field_ids(new_opt))
        );
    end if;

    if not matched then
      continue;
    end if;

    if not public.automation_conditions_match(rule.conditions, new_values, old_values) then
      continue;
    end if;

    recipient_ids := public.automation_resolve_assignees(
      rule.recipients,
      new_values,
      nullif(actor, '')
    );

    if cardinality(recipient_ids) = 0 and actor <> '' then
      recipient_ids := array[actor];
    end if;

    title := public.notification_render_template(
      rule.title_template,
      new_values,
      NEW.entity_id
    );
    message := public.notification_render_template(
      rule.message_template,
      new_values,
      NEW.entity_id
    );
    if nullif(btrim(title), '') is null then
      title := coalesce(nullif(btrim(rule.name), ''), 'Уведомление');
    end if;
    if nullif(btrim(message), '') is null then
      message := title;
    end if;

    foreach recipient_id in array recipient_ids
    loop
      perform public.create_notification(
        recipient_id,
        title,
        message,
        'rule',
        rule.id,
        NEW.entity_id,
        NEW.id,
        null,
        rule.show_toast
      );
    end loop;
  end loop;

  return NEW;
end;
$$;

-- Automation notify rules: render with entity labels.
create or replace function public.automation_notify_from_rules(
  p_template_id text,
  p_event text,
  p_values jsonb,
  p_old_values jsonb,
  p_actor text,
  p_title text,
  p_fallback_message text,
  p_entity_id text,
  p_record_id text,
  p_task_id text,
  p_fallback_user_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rule public.automation_notification_rules%rowtype;
  recipient_ids text[];
  recipient_id text;
  message text;
  title text;
  fallback_title text;
  fallback_message text;
  notified_ids text[] := array[]::text[];
  values jsonb := coalesce(p_values, '{}'::jsonb);
  old_values jsonb := coalesce(p_old_values, '{}'::jsonb);
  raw_title text := coalesce(nullif(btrim(p_title), ''), '');
  raw_fallback text := coalesce(nullif(btrim(p_fallback_message), ''), '');
  task_label text := null;
begin
  if p_template_id is null or btrim(p_template_id) = '' then
    return;
  end if;
  if p_event is null or btrim(p_event) = '' then
    return;
  end if;

  if raw_fallback ~* '^(назначена|завершена|просрочена) задача:\s*.+$' then
    task_label := nullif(
      btrim(regexp_replace(raw_fallback, '^(назначена|завершена|просрочена) задача:\s*', '', 'i')),
      ''
    );
  elsif raw_title not in ('Назначена задача', 'Завершена задача', 'Просрочена задача', 'Уведомление', '')
    and raw_title !~* '^(назначена|завершена|просрочена) задача$'
  then
    task_label := raw_title;
  elsif raw_fallback <> ''
    and raw_fallback not in ('Назначена задача', 'Завершена задача', 'Просрочена задача')
    and raw_fallback !~* '^(назначена|завершена|просрочена) задача:\s*'
  then
    task_label := raw_fallback;
  end if;

  if task_label is not null then
    task_label := public.entity_replace_record_ids_in_text(task_label);
  end if;

  if p_event = 'assigned' then
    fallback_title := coalesce(nullif(task_label, ''), nullif(raw_title, ''), 'Новая задача');
    fallback_message := 'Вам назначено';
  elsif p_event = 'completed' then
    fallback_title := coalesce(nullif(task_label, ''), nullif(raw_title, ''), 'Задание');
    fallback_message := 'Задание выполнено';
  elsif p_event = 'overdue' then
    fallback_title := coalesce(nullif(task_label, ''), nullif(raw_title, ''), 'Задание');
    fallback_message := 'Просрочено';
  else
    fallback_title := coalesce(nullif(raw_title, ''), 'Уведомление');
    fallback_message := coalesce(nullif(raw_fallback, ''), fallback_title);
  end if;

  fallback_title := public.entity_replace_record_ids_in_text(fallback_title);
  fallback_message := public.entity_replace_record_ids_in_text(fallback_message);

  for rule in
    select *
    from public.automation_notification_rules r
    where r.template_id = p_template_id
      and r.event = p_event
  loop
    if not public.automation_conditions_match(
      coalesce(
        rule.conditions,
        '{"version":1,"match":"all","rules":[]}'::jsonb
      ),
      values,
      old_values
    ) then
      continue;
    end if;

    recipient_ids := public.automation_resolve_assignees(
      coalesce(rule.recipients, '{"type":"currentUser"}'::jsonb),
      values,
      nullif(btrim(coalesce(p_actor, '')), '')
    );

    if cardinality(recipient_ids) = 0
       and nullif(btrim(coalesce(p_fallback_user_id, '')), '') is not null
    then
      recipient_ids := array[p_fallback_user_id];
    end if;

    if cardinality(recipient_ids) = 0 then
      continue;
    end if;

    message := public.automation_render_template(
      coalesce(rule.message_template, ''),
      values,
      p_entity_id
    );
    message := public.entity_replace_record_ids_in_text(message);
    if nullif(btrim(message), '') is null then
      message := fallback_message;
    end if;
    title := fallback_title;

    foreach recipient_id in array recipient_ids
    loop
      if nullif(btrim(coalesce(recipient_id, '')), '') is null then
        continue;
      end if;
      perform public.create_notification(
        recipient_id,
        title,
        message,
        'automation',
        null,
        p_entity_id,
        p_record_id,
        p_task_id,
        true
      );
      if not (recipient_id = any (notified_ids)) then
        notified_ids := array_append(notified_ids, recipient_id);
      end if;
    end loop;
  end loop;

  if nullif(btrim(coalesce(p_fallback_user_id, '')), '') is not null
     and not (p_fallback_user_id = any (notified_ids))
  then
    perform public.create_notification(
      p_fallback_user_id,
      fallback_title,
      fallback_message,
      'automation',
      null,
      p_entity_id,
      p_record_id,
      p_task_id,
      true
    );
  end if;
end;
$$;
