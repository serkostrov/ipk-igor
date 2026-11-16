-- Stage-change notifications often fired twice: once from complete_automation_task
-- (inside_complete stage write) and again from a client safety patch of the same
-- stage field. Deduplicate identical toasts within a short window, and skip
-- entity fieldEnter rules while inside_complete (spawn/assigned still notify).

create or replace function public.create_notification(
  p_user_id text,
  p_title text,
  p_message text,
  p_source text default 'rule',
  p_rule_id text default null,
  p_entity_id text default null,
  p_record_id text default null,
  p_task_id text default null,
  p_show_toast boolean default true
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  nid text;
  uid text := nullif(btrim(coalesce(p_user_id, '')), '');
  title text;
  existing_id text;
begin
  if uid is null then
    return null;
  end if;

  title := coalesce(
    nullif(btrim(p_title), ''),
    left(coalesce(p_message, 'Уведомление'), 120)
  );

  -- Collapse duplicate stage / rule toasts from a double field write.
  select n.id
    into existing_id
  from public.notifications n
  where n.user_id = uid
    and n.title = title
    and coalesce(n.entity_id, '') = coalesce(p_entity_id, '')
    and coalesce(n.record_id, '') = coalesce(p_record_id, '')
    and n.created_at > now() - interval '20 seconds'
  order by n.created_at desc
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  nid := 'ntf-' || gen_random_uuid()::text;
  insert into public.notifications (
    id, user_id, title, message, source, rule_id,
    entity_id, record_id, task_id, show_toast
  ) values (
    nid,
    uid,
    title,
    coalesce(p_message, ''),
    coalesce(nullif(p_source, ''), 'rule'),
    p_rule_id,
    p_entity_id,
    p_record_id,
    p_task_id,
    coalesce(p_show_toast, true)
  );
  return nid;
end;
$$;

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
