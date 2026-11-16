-- Internal CRM messenger: chats, members, messages, attachments, audit, storage, RPC.

-- ─── Tables ────────────────────────────────────────────────────────────────

create table if not exists public.messenger_chats (
  id text primary key default gen_random_uuid()::text,
  kind text not null check (kind in ('direct', 'group')),
  title text not null default '',
  avatar_path text,
  created_by text not null,
  status text not null default 'active'
    check (status in ('active', 'archived', 'deleted')),
  entity_id text,
  record_id text,
  entity_title text,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_has_attachment boolean not null default false,
  pinned_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messenger_chats_last_message_at_idx
  on public.messenger_chats (last_message_at desc nulls last);

create index if not exists messenger_chats_entity_record_idx
  on public.messenger_chats (entity_id, record_id)
  where entity_id is not null and record_id is not null and status <> 'deleted';

create table if not exists public.messenger_members (
  id text primary key default gen_random_uuid()::text,
  chat_id text not null references public.messenger_chats (id) on delete cascade,
  user_id text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active'
    check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz,
  is_pinned boolean not null default false,
  is_muted boolean not null default false,
  unique (chat_id, user_id)
);

create index if not exists messenger_members_user_status_idx
  on public.messenger_members (user_id, status);

create index if not exists messenger_members_chat_status_idx
  on public.messenger_members (chat_id, status);

create table if not exists public.messenger_messages (
  id text primary key default gen_random_uuid()::text,
  chat_id text not null references public.messenger_chats (id) on delete cascade,
  author_id text,
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null default '',
  reply_to_id text references public.messenger_messages (id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messenger_messages_chat_created_idx
  on public.messenger_messages (chat_id, created_at desc);

alter table public.messenger_chats
  drop constraint if exists messenger_chats_pinned_message_id_fkey;

alter table public.messenger_chats
  add constraint messenger_chats_pinned_message_id_fkey
  foreign key (pinned_message_id)
  references public.messenger_messages (id)
  on delete set null;

create table if not exists public.messenger_attachments (
  id text primary key default gen_random_uuid()::text,
  message_id text not null references public.messenger_messages (id) on delete cascade,
  file_name text not null,
  extension text not null default '',
  size_bytes bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  storage_path text not null,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists messenger_attachments_message_idx
  on public.messenger_attachments (message_id);

create table if not exists public.messenger_message_reads (
  message_id text not null references public.messenger_messages (id) on delete cascade,
  user_id text not null,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.messenger_audit_log (
  id bigserial primary key,
  actor_id text,
  action text not null,
  chat_id text,
  message_id text,
  target_user_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messenger_audit_log_chat_idx
  on public.messenger_audit_log (chat_id, created_at desc);

-- Direct-chat uniqueness: one active DM per unordered pair of users.
create unique index if not exists messenger_direct_pair_uidx
  on public.messenger_chats (id)
  where false; -- placeholder; uniqueness enforced via helper table

create table if not exists public.messenger_direct_pairs (
  user_a text not null,
  user_b text not null,
  chat_id text not null references public.messenger_chats (id) on delete cascade,
  primary key (user_a, user_b),
  check (user_a < user_b)
);

-- ─── Helpers ───────────────────────────────────────────────────────────────

create or replace function public.messenger_is_active_member(
  p_chat_id text,
  p_user_id text default auth.uid()::text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.messenger_members m
    where m.chat_id = p_chat_id
      and m.user_id = coalesce(p_user_id, auth.uid()::text)
      and m.status = 'active'
  );
$$;

create or replace function public.messenger_can_read_message(
  p_chat_id text,
  p_created_at timestamptz,
  p_user_id text default auth.uid()::text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.messenger_members m
    where m.chat_id = p_chat_id
      and m.user_id = coalesce(p_user_id, auth.uid()::text)
      and (
        m.status = 'active'
        or (m.left_at is not null and p_created_at <= m.left_at)
      )
  );
$$;

create or replace function public.messenger_audit(
  p_action text,
  p_chat_id text default null,
  p_message_id text default null,
  p_target_user_id text default null,
  p_payload jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.messenger_audit_log (
    actor_id, action, chat_id, message_id, target_user_id, payload
  ) values (
    auth.uid()::text,
    p_action,
    p_chat_id,
    p_message_id,
    p_target_user_id,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public.messenger_insert_system_message(
  p_chat_id text,
  p_body text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  insert into public.messenger_messages (chat_id, author_id, kind, body)
  values (p_chat_id, null, 'system', p_body)
  returning id into v_id;

  update public.messenger_chats
  set
    last_message_at = now(),
    last_message_preview = left(p_body, 240),
    last_message_has_attachment = false,
    updated_at = now()
  where id = p_chat_id;

  return v_id;
end;
$$;

-- ─── RPCs ──────────────────────────────────────────────────────────────────

create or replace function public.messenger_get_or_create_direct(
  p_other_user_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_a text;
  v_b text;
  v_chat_id text;
begin
  if v_me is null or v_me = '' then
    raise exception 'Необходима авторизация';
  end if;
  if p_other_user_id is null or p_other_user_id = '' or p_other_user_id = v_me then
    raise exception 'Укажите другого пользователя';
  end if;

  if p_other_user_id < v_me then
    v_a := p_other_user_id;
    v_b := v_me;
  else
    v_a := v_me;
    v_b := p_other_user_id;
  end if;

  select chat_id into v_chat_id
  from public.messenger_direct_pairs
  where user_a = v_a and user_b = v_b;

  if v_chat_id is not null then
    -- Re-activate membership if previously left/removed.
    insert into public.messenger_members (chat_id, user_id, role, status)
    values
      (v_chat_id, v_me, 'member', 'active'),
      (v_chat_id, p_other_user_id, 'member', 'active')
    on conflict (chat_id, user_id) do update
      set status = 'active',
          left_at = null,
          joined_at = case
            when messenger_members.status <> 'active' then now()
            else messenger_members.joined_at
          end;

    update public.messenger_chats
    set status = 'active', updated_at = now()
    where id = v_chat_id and status <> 'active';

    return v_chat_id;
  end if;

  insert into public.messenger_chats (kind, title, created_by, status)
  values ('direct', '', v_me, 'active')
  returning id into v_chat_id;

  insert into public.messenger_direct_pairs (user_a, user_b, chat_id)
  values (v_a, v_b, v_chat_id);

  insert into public.messenger_members (chat_id, user_id, role, status)
  values
    (v_chat_id, v_me, 'member', 'active'),
    (v_chat_id, p_other_user_id, 'member', 'active');

  perform public.messenger_audit('chat.create', v_chat_id, null, p_other_user_id,
    jsonb_build_object('kind', 'direct'));

  return v_chat_id;
end;
$$;

create or replace function public.messenger_create_group(
  p_title text,
  p_member_ids text[],
  p_entity_id text default null,
  p_record_id text default null,
  p_entity_title text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_chat_id text;
  v_ids text[];
  v_uid text;
  v_title text;
  v_existing text;
begin
  if v_me is null or v_me = '' then
    raise exception 'Необходима авторизация';
  end if;

  -- Idempotent CRM-bound chat: one active chat per entity record.
  if p_entity_id is not null and p_record_id is not null then
    select id into v_existing
    from public.messenger_chats
    where entity_id = p_entity_id
      and record_id = p_record_id
      and status <> 'deleted'
    order by created_at asc
    limit 1;

    if v_existing is not null then
      insert into public.messenger_members (chat_id, user_id, role, status)
      values (v_existing, v_me, 'member', 'active')
      on conflict (chat_id, user_id) do update
        set status = 'active', left_at = null;
      return v_existing;
    end if;
  end if;

  v_ids := array(
    select distinct x
    from unnest(coalesce(p_member_ids, array[]::text[]) || array[v_me]) as t(x)
    where x is not null and x <> ''
  );

  if cardinality(v_ids) < 3 and p_entity_id is null then
    raise exception 'В групповом чате должно быть минимум 3 участника';
  end if;
  if cardinality(v_ids) < 2 then
    raise exception 'Добавьте хотя бы одного участника';
  end if;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null and p_entity_title is not null then
    v_title := trim(p_entity_title);
  end if;
  if v_title is null then
    v_title := 'Групповой чат';
  end if;

  insert into public.messenger_chats (
    kind, title, created_by, status, entity_id, record_id, entity_title
  ) values (
    'group',
    v_title,
    v_me,
    'active',
    nullif(p_entity_id, ''),
    nullif(p_record_id, ''),
    nullif(p_entity_title, '')
  )
  returning id into v_chat_id;

  foreach v_uid in array v_ids
  loop
    insert into public.messenger_members (chat_id, user_id, role, status)
    values (
      v_chat_id,
      v_uid,
      case when v_uid = v_me then 'admin' else 'member' end,
      'active'
    );
  end loop;

  perform public.messenger_insert_system_message(
    v_chat_id,
    'Чат создан'
  );
  perform public.messenger_audit(
    'chat.create',
    v_chat_id,
    null,
    null,
    jsonb_build_object(
      'kind', 'group',
      'title', v_title,
      'entity_id', p_entity_id,
      'record_id', p_record_id
    )
  );

  return v_chat_id;
end;
$$;

create or replace function public.messenger_add_members(
  p_chat_id text,
  p_member_ids text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_uid text;
begin
  if not public.messenger_is_active_member(p_chat_id, v_me) then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;

  foreach v_uid in array coalesce(p_member_ids, array[]::text[])
  loop
    if v_uid is null or v_uid = '' then
      continue;
    end if;
    insert into public.messenger_members (chat_id, user_id, role, status)
    values (p_chat_id, v_uid, 'member', 'active')
    on conflict (chat_id, user_id) do update
      set status = 'active',
          left_at = null,
          joined_at = case
            when messenger_members.status <> 'active' then now()
            else messenger_members.joined_at
          end;
    perform public.messenger_insert_system_message(
      p_chat_id,
      format('Добавлен участник %s', v_uid)
    );
    perform public.messenger_audit('member.add', p_chat_id, null, v_uid, '{}'::jsonb);
  end loop;
end;
$$;

create or replace function public.messenger_remove_member(
  p_chat_id text,
  p_user_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_role text;
  v_admin_count int;
begin
  select role into v_role
  from public.messenger_members
  where chat_id = p_chat_id and user_id = v_me and status = 'active';

  if v_role is distinct from 'admin' then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;

  if p_user_id = v_me then
    raise exception 'Используйте выход из чата';
  end if;

  update public.messenger_members
  set status = 'removed', left_at = now()
  where chat_id = p_chat_id and user_id = p_user_id and status = 'active';

  if not found then
    return;
  end if;

  perform public.messenger_insert_system_message(
    p_chat_id,
    format('Участник %s удалён из чата', p_user_id)
  );
  perform public.messenger_audit('member.remove', p_chat_id, null, p_user_id, '{}'::jsonb);

  select count(*) into v_admin_count
  from public.messenger_members
  where chat_id = p_chat_id and status = 'active' and role = 'admin';
end;
$$;

create or replace function public.messenger_leave(
  p_chat_id text,
  p_new_admin_id text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_role text;
  v_admin_count int;
  v_kind text;
begin
  select m.role, c.kind into v_role, v_kind
  from public.messenger_members m
  join public.messenger_chats c on c.id = m.chat_id
  where m.chat_id = p_chat_id and m.user_id = v_me and m.status = 'active';

  if v_role is null then
    raise exception 'Вы не являетесь участником чата';
  end if;

  if v_kind = 'direct' then
    update public.messenger_members
    set status = 'left', left_at = now()
    where chat_id = p_chat_id and user_id = v_me;
    perform public.messenger_audit('member.leave', p_chat_id, null, v_me, '{}'::jsonb);
    return;
  end if;

  select count(*) into v_admin_count
  from public.messenger_members
  where chat_id = p_chat_id and status = 'active' and role = 'admin';

  if v_role = 'admin' and v_admin_count <= 1 then
    if p_new_admin_id is null or p_new_admin_id = '' or p_new_admin_id = v_me then
      -- Auto-promote earliest remaining member.
      select user_id into p_new_admin_id
      from public.messenger_members
      where chat_id = p_chat_id
        and status = 'active'
        and user_id <> v_me
      order by joined_at asc
      limit 1;
    end if;
    if p_new_admin_id is null then
      update public.messenger_chats
      set status = 'deleted', updated_at = now()
      where id = p_chat_id;
    else
      update public.messenger_members
      set role = 'admin'
      where chat_id = p_chat_id and user_id = p_new_admin_id and status = 'active';
      perform public.messenger_insert_system_message(
        p_chat_id,
        format('Назначен администратор %s', p_new_admin_id)
      );
    end if;
  end if;

  update public.messenger_members
  set status = 'left', left_at = now(), role = 'member'
  where chat_id = p_chat_id and user_id = v_me;

  perform public.messenger_insert_system_message(
    p_chat_id,
    format('Участник %s вышел из чата', v_me)
  );
  perform public.messenger_audit('member.leave', p_chat_id, null, v_me, '{}'::jsonb);
end;
$$;

create or replace function public.messenger_set_title(
  p_chat_id text,
  p_title text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_role text;
  v_title text := trim(coalesce(p_title, ''));
begin
  select role into v_role
  from public.messenger_members
  where chat_id = p_chat_id and user_id = v_me and status = 'active';
  if v_role is distinct from 'admin' then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
  if v_title = '' then
    raise exception 'Укажите название чата';
  end if;
  update public.messenger_chats
  set title = v_title, updated_at = now()
  where id = p_chat_id;
  perform public.messenger_insert_system_message(
    p_chat_id,
    format('Название чата изменено на «%s»', v_title)
  );
  perform public.messenger_audit(
    'chat.rename', p_chat_id, null, null, jsonb_build_object('title', v_title)
  );
end;
$$;

create or replace function public.messenger_set_avatar(
  p_chat_id text,
  p_avatar_path text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_role text;
begin
  select role into v_role
  from public.messenger_members
  where chat_id = p_chat_id and user_id = v_me and status = 'active';
  if v_role is distinct from 'admin' then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
  update public.messenger_chats
  set avatar_path = nullif(p_avatar_path, ''), updated_at = now()
  where id = p_chat_id;
  perform public.messenger_audit(
    'chat.avatar', p_chat_id, null, null,
    jsonb_build_object('avatar_path', p_avatar_path)
  );
end;
$$;

create or replace function public.messenger_bind_entity(
  p_chat_id text,
  p_entity_id text,
  p_record_id text,
  p_entity_title text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
begin
  if not public.messenger_is_active_member(p_chat_id, v_me) then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
  update public.messenger_chats
  set
    entity_id = nullif(p_entity_id, ''),
    record_id = nullif(p_record_id, ''),
    entity_title = nullif(p_entity_title, ''),
    updated_at = now()
  where id = p_chat_id;
  perform public.messenger_audit(
    'chat.bind',
    p_chat_id,
    null,
    null,
    jsonb_build_object(
      'entity_id', p_entity_id,
      'record_id', p_record_id,
      'entity_title', p_entity_title
    )
  );
end;
$$;

create or replace function public.messenger_set_archived(
  p_chat_id text,
  p_archived boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
begin
  if not public.messenger_is_active_member(p_chat_id, v_me) then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
  update public.messenger_chats
  set
    status = case when p_archived then 'archived' else 'active' end,
    updated_at = now()
  where id = p_chat_id and status <> 'deleted';
  perform public.messenger_audit(
    case when p_archived then 'chat.archive' else 'chat.unarchive' end,
    p_chat_id, null, null, '{}'::jsonb
  );
end;
$$;

create or replace function public.messenger_set_member_pinned(
  p_chat_id text,
  p_pinned boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
begin
  update public.messenger_members
  set is_pinned = coalesce(p_pinned, false)
  where chat_id = p_chat_id and user_id = v_me and status = 'active';
  if not found then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
end;
$$;

create or replace function public.messenger_pin_message(
  p_chat_id text,
  p_message_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
begin
  if not public.messenger_is_active_member(p_chat_id, v_me) then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
  if p_message_id is not null and not exists (
    select 1 from public.messenger_messages
    where id = p_message_id and chat_id = p_chat_id and deleted_at is null
  ) then
    raise exception 'Сообщение не найдено';
  end if;
  update public.messenger_chats
  set pinned_message_id = p_message_id, updated_at = now()
  where id = p_chat_id;
  perform public.messenger_audit(
    case when p_message_id is null then 'message.unpin' else 'message.pin' end,
    p_chat_id, p_message_id, null, '{}'::jsonb
  );
end;
$$;

create or replace function public.messenger_send_message(
  p_chat_id text,
  p_body text,
  p_reply_to_id text default null,
  p_attachment_meta jsonb default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_id text;
  v_body text := coalesce(p_body, '');
  v_has_att boolean := false;
  v_att jsonb;
  v_preview text;
begin
  if not public.messenger_is_active_member(p_chat_id, v_me) then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;

  if p_attachment_meta is not null and jsonb_typeof(p_attachment_meta) = 'array'
     and jsonb_array_length(p_attachment_meta) > 0 then
    v_has_att := true;
  end if;

  if trim(v_body) = '' and not v_has_att then
    raise exception 'Сообщение не может быть пустым';
  end if;

  if p_reply_to_id is not null and not exists (
    select 1 from public.messenger_messages
    where id = p_reply_to_id and chat_id = p_chat_id
  ) then
    raise exception 'Исходное сообщение не найдено';
  end if;

  insert into public.messenger_messages (
    chat_id, author_id, kind, body, reply_to_id
  ) values (
    p_chat_id, v_me, 'text', v_body, p_reply_to_id
  )
  returning id into v_id;

  if v_has_att then
    for v_att in select * from jsonb_array_elements(p_attachment_meta)
    loop
      insert into public.messenger_attachments (
        message_id,
        file_name,
        extension,
        size_bytes,
        mime_type,
        storage_path,
        uploaded_by
      ) values (
        v_id,
        coalesce(v_att->>'file_name', 'file'),
        coalesce(v_att->>'extension', ''),
        coalesce((v_att->>'size_bytes')::bigint, 0),
        coalesce(v_att->>'mime_type', 'application/octet-stream'),
        coalesce(v_att->>'storage_path', ''),
        v_me
      );
    end loop;
  end if;

  v_preview := case
    when trim(v_body) <> '' then left(v_body, 240)
    when v_has_att then 'Вложение'
    else ''
  end;

  update public.messenger_chats
  set
    last_message_at = now(),
    last_message_preview = v_preview,
    last_message_has_attachment = v_has_att,
    updated_at = now(),
    status = case when status = 'archived' then 'active' else status end
  where id = p_chat_id;

  -- Sender has read their own message.
  update public.messenger_members
  set last_read_at = now()
  where chat_id = p_chat_id and user_id = v_me;

  perform public.messenger_audit('message.send', p_chat_id, v_id, null, '{}'::jsonb);

  return v_id;
end;
$$;

create or replace function public.messenger_edit_message(
  p_message_id text,
  p_body text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_chat_id text;
  v_author text;
  v_deleted timestamptz;
begin
  select chat_id, author_id, deleted_at
  into v_chat_id, v_author, v_deleted
  from public.messenger_messages
  where id = p_message_id;

  if v_chat_id is null then
    raise exception 'Сообщение не найдено';
  end if;
  if v_author is distinct from v_me then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
  if v_deleted is not null then
    raise exception 'Сообщение удалено';
  end if;
  if not public.messenger_is_active_member(v_chat_id, v_me) then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;

  update public.messenger_messages
  set body = coalesce(p_body, ''), edited_at = now()
  where id = p_message_id;

  perform public.messenger_audit('message.edit', v_chat_id, p_message_id, null, '{}'::jsonb);
end;
$$;

create or replace function public.messenger_soft_delete_message(
  p_message_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_chat_id text;
  v_author text;
begin
  select chat_id, author_id into v_chat_id, v_author
  from public.messenger_messages
  where id = p_message_id;

  if v_chat_id is null then
    raise exception 'Сообщение не найдено';
  end if;
  if v_author is distinct from v_me then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
  if not public.messenger_is_active_member(v_chat_id, v_me) then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;

  update public.messenger_messages
  set deleted_at = now(), body = ''
  where id = p_message_id;

  update public.messenger_chats
  set pinned_message_id = null
  where id = v_chat_id and pinned_message_id = p_message_id;

  perform public.messenger_audit('message.delete', v_chat_id, p_message_id, null, '{}'::jsonb);
end;
$$;

create or replace function public.messenger_mark_read(
  p_chat_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
begin
  update public.messenger_members
  set last_read_at = now()
  where chat_id = p_chat_id and user_id = v_me and status = 'active';
  if not found then
    return;
  end if;

  insert into public.messenger_message_reads (message_id, user_id, read_at)
  select m.id, v_me, now()
  from public.messenger_messages m
  where m.chat_id = p_chat_id
    and m.deleted_at is null
    and m.kind = 'text'
    and (m.author_id is distinct from v_me)
    and m.created_at <= now()
  on conflict (message_id, user_id) do update
    set read_at = excluded.read_at;
end;
$$;

create or replace function public.messenger_set_admin(
  p_chat_id text,
  p_user_id text,
  p_is_admin boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := auth.uid()::text;
  v_role text;
begin
  select role into v_role
  from public.messenger_members
  where chat_id = p_chat_id and user_id = v_me and status = 'active';
  if v_role is distinct from 'admin' then
    raise exception 'У вас недостаточно прав для выполнения данного действия.';
  end if;
  update public.messenger_members
  set role = case when p_is_admin then 'admin' else 'member' end
  where chat_id = p_chat_id and user_id = p_user_id and status = 'active';
  perform public.messenger_audit(
    case when p_is_admin then 'member.promote' else 'member.demote' end,
    p_chat_id, null, p_user_id, '{}'::jsonb
  );
end;
$$;

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.messenger_chats enable row level security;
alter table public.messenger_members enable row level security;
alter table public.messenger_messages enable row level security;
alter table public.messenger_attachments enable row level security;
alter table public.messenger_message_reads enable row level security;
alter table public.messenger_audit_log enable row level security;
alter table public.messenger_direct_pairs enable row level security;

drop policy if exists messenger_chats_select on public.messenger_chats;
create policy messenger_chats_select on public.messenger_chats
  for select to authenticated
  using (
    exists (
      select 1 from public.messenger_members m
      where m.chat_id = messenger_chats.id
        and m.user_id = auth.uid()::text
        and m.status = 'active'
    )
  );

drop policy if exists messenger_members_select on public.messenger_members;
create policy messenger_members_select on public.messenger_members
  for select to authenticated
  using (
    public.messenger_is_active_member(chat_id)
    or user_id = auth.uid()::text
  );

drop policy if exists messenger_messages_select on public.messenger_messages;
create policy messenger_messages_select on public.messenger_messages
  for select to authenticated
  using (public.messenger_can_read_message(chat_id, created_at));

drop policy if exists messenger_attachments_select on public.messenger_attachments;
create policy messenger_attachments_select on public.messenger_attachments
  for select to authenticated
  using (
    exists (
      select 1
      from public.messenger_messages msg
      where msg.id = messenger_attachments.message_id
        and public.messenger_can_read_message(msg.chat_id, msg.created_at)
    )
  );

drop policy if exists messenger_message_reads_select on public.messenger_message_reads;
create policy messenger_message_reads_select on public.messenger_message_reads
  for select to authenticated
  using (
    exists (
      select 1
      from public.messenger_messages msg
      where msg.id = messenger_message_reads.message_id
        and public.messenger_is_active_member(msg.chat_id)
    )
  );

drop policy if exists messenger_audit_select on public.messenger_audit_log;
create policy messenger_audit_select on public.messenger_audit_log
  for select to authenticated
  using (
    chat_id is not null and public.messenger_is_active_member(chat_id)
  );

drop policy if exists messenger_direct_pairs_select on public.messenger_direct_pairs;
create policy messenger_direct_pairs_select on public.messenger_direct_pairs
  for select to authenticated
  using (user_a = auth.uid()::text or user_b = auth.uid()::text);

-- Mutations go through security definer RPCs; block direct writes from clients.
drop policy if exists messenger_chats_write on public.messenger_chats;
drop policy if exists messenger_members_write on public.messenger_members;
drop policy if exists messenger_messages_write on public.messenger_messages;
drop policy if exists messenger_attachments_write on public.messenger_attachments;

-- ─── Storage ───────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('messenger-files', 'messenger-files', false, 52428800)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists messenger_files_select on storage.objects;
drop policy if exists messenger_files_insert on storage.objects;
drop policy if exists messenger_files_update on storage.objects;
drop policy if exists messenger_files_delete on storage.objects;

create policy messenger_files_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'messenger-files'
    and public.messenger_is_active_member(split_part(name, '/', 1))
  );

create policy messenger_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'messenger-files'
    and public.messenger_is_active_member(split_part(name, '/', 1))
  );

create policy messenger_files_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'messenger-files'
    and public.messenger_is_active_member(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'messenger-files'
    and public.messenger_is_active_member(split_part(name, '/', 1))
  );

create policy messenger_files_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'messenger-files'
    and public.messenger_is_active_member(split_part(name, '/', 1))
  );

-- ─── Realtime ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messenger_chats'
    ) then
      alter publication supabase_realtime add table public.messenger_chats;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messenger_members'
    ) then
      alter publication supabase_realtime add table public.messenger_members;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messenger_messages'
    ) then
      alter publication supabase_realtime add table public.messenger_messages;
    end if;
  end if;
end $$;

grant execute on function public.messenger_get_or_create_direct(text) to authenticated;
grant execute on function public.messenger_create_group(text, text[], text, text, text) to authenticated;
grant execute on function public.messenger_add_members(text, text[]) to authenticated;
grant execute on function public.messenger_remove_member(text, text) to authenticated;
grant execute on function public.messenger_leave(text, text) to authenticated;
grant execute on function public.messenger_set_title(text, text) to authenticated;
grant execute on function public.messenger_set_avatar(text, text) to authenticated;
grant execute on function public.messenger_bind_entity(text, text, text, text) to authenticated;
grant execute on function public.messenger_set_archived(text, boolean) to authenticated;
grant execute on function public.messenger_set_member_pinned(text, boolean) to authenticated;
grant execute on function public.messenger_pin_message(text, text) to authenticated;
grant execute on function public.messenger_send_message(text, text, text, jsonb) to authenticated;
grant execute on function public.messenger_edit_message(text, text) to authenticated;
grant execute on function public.messenger_soft_delete_message(text) to authenticated;
grant execute on function public.messenger_mark_read(text) to authenticated;
grant execute on function public.messenger_set_admin(text, text, boolean) to authenticated;
