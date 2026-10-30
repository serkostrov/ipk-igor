-- Cleaner automation notification copy:
-- title = task name, message = short status («Вам назначено» / …).
-- Always notify the assignee even when no custom rules exist.

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

  -- Extract task/record label from legacy «Назначена задача: …» fallbacks.
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

  if p_event = 'assigned' then
    fallback_title := coalesce(task_label, nullif(raw_title, ''), 'Новая задача');
    fallback_message := 'Вам назначено';
  elsif p_event = 'completed' then
    fallback_title := coalesce(task_label, nullif(raw_title, ''), 'Задание');
    fallback_message := 'Задание выполнено';
  elsif p_event = 'overdue' then
    fallback_title := coalesce(task_label, nullif(raw_title, ''), 'Задание');
    fallback_message := 'Просрочено';
  else
    fallback_title := coalesce(nullif(raw_title, ''), 'Уведомление');
    fallback_message := coalesce(nullif(raw_fallback, ''), fallback_title);
  end if;

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
      values
    );
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

  -- Assignee always gets a clean default when not covered by a custom rule.
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
