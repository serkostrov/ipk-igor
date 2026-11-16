-- News feed («Лента»): posts, audience by legal entities, attachments,
-- links, polls, comments, audit. Access via security definer RPCs.

-- ─── Tables ────────────────────────────────────────────────────────────────

create table if not exists public.feed_posts (
  id text primary key default gen_random_uuid()::text,
  author_id text not null,
  title text not null default '',
  body text not null default '',
  targets_all boolean not null default false,
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feed_posts_created_idx
  on public.feed_posts (created_at desc)
  where deleted_at is null;

create table if not exists public.feed_post_legal_entities (
  post_id text not null references public.feed_posts (id) on delete cascade,
  legal_entity_id text not null,
  primary key (post_id, legal_entity_id)
);

create index if not exists feed_post_legal_entities_entity_idx
  on public.feed_post_legal_entities (legal_entity_id);

create table if not exists public.feed_attachments (
  id text primary key default gen_random_uuid()::text,
  post_id text not null references public.feed_posts (id) on delete cascade,
  file_name text not null,
  extension text not null default '',
  size_bytes bigint not null default 0,
  mime_type text not null default 'application/octet-stream',
  storage_path text not null,
  uploaded_by text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists feed_attachments_post_idx
  on public.feed_attachments (post_id, sort_order);

create table if not exists public.feed_links (
  id text primary key default gen_random_uuid()::text,
  post_id text not null references public.feed_posts (id) on delete cascade,
  kind text not null check (kind in ('external', 'google_form')),
  url text not null,
  title text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists feed_links_post_idx
  on public.feed_links (post_id, sort_order);

create table if not exists public.feed_polls (
  id text primary key default gen_random_uuid()::text,
  post_id text not null unique references public.feed_posts (id) on delete cascade,
  question text not null,
  allow_multiple boolean not null default false,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.feed_poll_options (
  id text primary key default gen_random_uuid()::text,
  poll_id text not null references public.feed_polls (id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create index if not exists feed_poll_options_poll_idx
  on public.feed_poll_options (poll_id, sort_order);

create table if not exists public.feed_poll_votes (
  id text primary key default gen_random_uuid()::text,
  poll_id text not null references public.feed_polls (id) on delete cascade,
  option_id text not null references public.feed_poll_options (id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, option_id, user_id)
);

create index if not exists feed_poll_votes_user_idx
  on public.feed_poll_votes (poll_id, user_id);

create table if not exists public.feed_comments (
  id text primary key default gen_random_uuid()::text,
  post_id text not null references public.feed_posts (id) on delete cascade,
  author_id text not null,
  body text not null default '',
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists feed_comments_post_created_idx
  on public.feed_comments (post_id, created_at asc)
  where deleted_at is null;

create table if not exists public.feed_audit_log (
  id bigserial primary key,
  actor_id text,
  action text not null,
  post_id text,
  comment_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feed_audit_log_post_idx
  on public.feed_audit_log (post_id, created_at desc);

-- ─── Helpers ───────────────────────────────────────────────────────────────

create or replace function public.feed_audit(
  p_action text,
  p_post_id text default null,
  p_comment_id text default null,
  p_payload jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.feed_audit_log (actor_id, action, post_id, comment_id, payload)
  values (
    auth.uid()::text,
    p_action,
    p_post_id,
    p_comment_id,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

create or replace function public.feed_parse_role_id(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text := trim(coalesce(p_raw, ''));
  v_arr jsonb;
  v_first text;
begin
  if v = '' then
    return null;
  end if;
  if left(v, 1) = '[' then
    begin
      v_arr := v::jsonb;
      if jsonb_typeof(v_arr) = 'array' and jsonb_array_length(v_arr) > 0 then
        v_first := trim(both '"' from v_arr ->> 0);
        if v_first <> '' then
          return v_first;
        end if;
      end if;
    exception when others then
      null;
    end;
  end if;
  if position(',' in v) > 0 then
    return nullif(trim(split_part(v, ',', 1)), '');
  end if;
  return v;
end;
$$;

create or replace function public.feed_viewer_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_auth uuid := auth.uid();
  v_uid text;
  v_role_raw text;
  v_role_id text;
  v_roles jsonb;
  v_role jsonb;
  v_perms jsonb;
  v_is_admin boolean := false;
  v_can_access boolean := true;
  v_can_create boolean := false;
  v_legal_ids text[] := array[]::text[];
  v_legal_json jsonb;
  v_item text;
begin
  if v_auth is null then
    raise exception 'Необходима авторизация';
  end if;
  v_uid := v_auth::text;

  select nullif(trim(coalesce(r.field_values ->> 'field-system-users-role', '')), '')
  into v_role_raw
  from public.entity_records r
  where r.entity_id = 'entity-system-users'
    and r.auth_user_id = v_auth
  order by r.created_at asc nulls last
  limit 1;

  v_role_id := public.feed_parse_role_id(v_role_raw);
  if v_role_id is null or v_role_id = '' then
    v_role_id := 'role-system-employee';
  end if;

  select value -> 'roles'
  into v_roles
  from public.app_documents
  where key = 'roles'
  limit 1;

  if v_roles is null or jsonb_typeof(v_roles) <> 'array' then
    v_roles := '[]'::jsonb;
  end if;

  select elem
  into v_role
  from jsonb_array_elements(v_roles) as elem
  where elem ->> 'id' = v_role_id
  limit 1;

  v_perms := coalesce(v_role -> 'permissions', '{}'::jsonb);
  v_is_admin := v_role_id = 'role-system-admin';

  if v_is_admin then
    v_can_access := true;
    v_can_create := true;
    v_legal_ids := array[]::text[];
  else
    v_can_access := coalesce((v_perms ->> 'canAccessNewsFeed')::boolean, true);
    -- Missing key defaults to false for create (authors opt-in).
    if v_perms ? 'canCreateNewsPosts' then
      v_can_create := coalesce((v_perms ->> 'canCreateNewsPosts')::boolean, false);
    else
      v_can_create := false;
    end if;

    v_legal_json := v_perms -> 'legalEntityIds';
    if jsonb_typeof(v_legal_json) = 'array' then
      for v_item in
        select trim(value)
        from jsonb_array_elements_text(v_legal_json) as t(value)
        where trim(value) <> ''
      loop
        v_legal_ids := array_append(v_legal_ids, v_item);
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'user_id', v_uid,
    'role_id', v_role_id,
    'is_admin', v_is_admin,
    'can_access', v_can_access,
    'can_create', v_can_create,
    'legal_entity_ids', to_jsonb(coalesce(v_legal_ids, array[]::text[]))
  );
end;
$$;

create or replace function public.feed_post_visible_to_viewer(
  p_post_id text,
  p_ctx jsonb default null
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := coalesce(p_ctx, public.feed_viewer_context());
  v_targets_all boolean;
  v_deleted timestamptz;
  v_legal text[];
  v_viewer text[];
begin
  if not coalesce((v_ctx ->> 'can_access')::boolean, false) then
    return false;
  end if;

  select targets_all, deleted_at
  into v_targets_all, v_deleted
  from public.feed_posts
  where id = p_post_id;

  if not found or v_deleted is not null then
    return false;
  end if;

  if coalesce((v_ctx ->> 'is_admin')::boolean, false) then
    return true;
  end if;

  if v_targets_all then
    return true;
  end if;

  select coalesce(array_agg(legal_entity_id), array[]::text[])
  into v_legal
  from public.feed_post_legal_entities
  where post_id = p_post_id;

  select coalesce(
    array(select jsonb_array_elements_text(v_ctx -> 'legal_entity_ids')),
    array[]::text[]
  ) into v_viewer;

  -- Empty viewer allowlist = unrestricted (same as role.legalEntityIds []).
  if coalesce(cardinality(v_viewer), 0) = 0 then
    return true;
  end if;

  return exists (
    select 1
    from unnest(v_legal) as le(id)
    where le.id = any (v_viewer)
  );
end;
$$;

create or replace function public.feed_can_access_post(p_post_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.feed_post_visible_to_viewer(p_post_id, public.feed_viewer_context());
$$;

create or replace function public.feed_can_manage_post(p_post_id text, p_ctx jsonb default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := coalesce(p_ctx, public.feed_viewer_context());
  v_author text;
  v_deleted timestamptz;
begin
  select author_id, deleted_at into v_author, v_deleted
  from public.feed_posts
  where id = p_post_id;

  if not found or v_deleted is not null then
    return false;
  end if;

  if coalesce((v_ctx ->> 'is_admin')::boolean, false) then
    return true;
  end if;

  return v_author = (v_ctx ->> 'user_id');
end;
$$;

create or replace function public.feed_build_poll_json(p_poll_id text, p_user_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_poll public.feed_polls%rowtype;
  v_options jsonb := '[]'::jsonb;
  v_my_votes text[];
  v_total int := 0;
  v_ended boolean;
  v_has_voted boolean;
  v_show_results boolean;
begin
  select * into v_poll from public.feed_polls where id = p_poll_id;
  if not found then
    return null;
  end if;

  select coalesce(array_agg(option_id), array[]::text[])
  into v_my_votes
  from public.feed_poll_votes
  where poll_id = p_poll_id and user_id = p_user_id;

  v_has_voted := coalesce(cardinality(v_my_votes), 0) > 0;
  v_ended := v_poll.ends_at is not null and v_poll.ends_at <= now();
  v_show_results := v_has_voted or v_ended;

  select coalesce(count(*)::int, 0) into v_total
  from public.feed_poll_votes
  where poll_id = p_poll_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'label', o.label,
      'sort_order', o.sort_order,
      'vote_count', case when v_show_results then (
        select count(*)::int from public.feed_poll_votes v
        where v.poll_id = p_poll_id and v.option_id = o.id
      ) else 0 end,
      'selected', o.id = any (v_my_votes)
    ) order by o.sort_order, o.id
  ), '[]'::jsonb)
  into v_options
  from public.feed_poll_options o
  where o.poll_id = p_poll_id;

  return jsonb_build_object(
    'id', v_poll.id,
    'question', v_poll.question,
    'allow_multiple', v_poll.allow_multiple,
    'ends_at', v_poll.ends_at,
    'ended', v_ended,
    'has_voted', v_has_voted,
    'show_results', v_show_results,
    'total_votes', case when v_show_results then v_total else 0 end,
    'my_option_ids', to_jsonb(coalesce(v_my_votes, array[]::text[])),
    'options', v_options
  );
end;
$$;

create or replace function public.feed_build_post_json(p_post_id text, p_ctx jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_post public.feed_posts%rowtype;
  v_user text := p_ctx ->> 'user_id';
  v_legal jsonb;
  v_attachments jsonb;
  v_links jsonb;
  v_comments jsonb;
  v_poll_id text;
  v_poll jsonb;
  v_comment_count int;
begin
  select * into v_post from public.feed_posts where id = p_post_id;
  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x), '[]'::jsonb)
  into v_legal
  from (
    select legal_entity_id as x
    from public.feed_post_legal_entities
    where post_id = p_post_id
    order by legal_entity_id
  ) s;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'file_name', a.file_name,
      'extension', a.extension,
      'size_bytes', a.size_bytes,
      'mime_type', a.mime_type,
      'storage_path', a.storage_path,
      'sort_order', a.sort_order,
      'created_at', a.created_at
    ) order by a.sort_order, a.created_at
  ), '[]'::jsonb)
  into v_attachments
  from public.feed_attachments a
  where a.post_id = p_post_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', l.id,
      'kind', l.kind,
      'url', l.url,
      'title', l.title,
      'sort_order', l.sort_order
    ) order by l.sort_order, l.created_at
  ), '[]'::jsonb)
  into v_links
  from public.feed_links l
  where l.post_id = p_post_id;

  select count(*)::int into v_comment_count
  from public.feed_comments c
  where c.post_id = p_post_id and c.deleted_at is null;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'author_id', c.author_id,
      'body', c.body,
      'edited_at', c.edited_at,
      'created_at', c.created_at
    ) order by c.created_at asc
  ), '[]'::jsonb)
  into v_comments
  from public.feed_comments c
  where c.post_id = p_post_id and c.deleted_at is null;

  select id into v_poll_id from public.feed_polls where post_id = p_post_id;
  if v_poll_id is not null then
    v_poll := public.feed_build_poll_json(v_poll_id, v_user);
  else
    v_poll := null;
  end if;

  return jsonb_build_object(
    'id', v_post.id,
    'author_id', v_post.author_id,
    'title', v_post.title,
    'body', v_post.body,
    'targets_all', v_post.targets_all,
    'legal_entity_ids', coalesce(v_legal, '[]'::jsonb),
    'created_at', v_post.created_at,
    'updated_at', v_post.updated_at,
    'edited_at', v_post.edited_at,
    'attachments', coalesce(v_attachments, '[]'::jsonb),
    'links', coalesce(v_links, '[]'::jsonb),
    'poll', v_poll,
    'comments', coalesce(v_comments, '[]'::jsonb),
    'comment_count', coalesce(v_comment_count, 0),
    'can_manage', public.feed_can_manage_post(p_post_id, p_ctx)
  );
end;
$$;

create or replace function public.feed_replace_links(
  p_post_id text,
  p_links jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_kind text;
  v_url text;
  v_title text;
  v_ord int := 0;
begin
  delete from public.feed_links where post_id = p_post_id;
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_links)
  loop
    v_kind := nullif(trim(coalesce(v_item ->> 'kind', '')), '');
    v_url := nullif(trim(coalesce(v_item ->> 'url', '')), '');
    v_title := trim(coalesce(v_item ->> 'title', ''));
    if v_kind is null or v_url is null then
      continue;
    end if;
    if v_kind not in ('external', 'google_form') then
      raise exception 'Некорректный тип ссылки';
    end if;
    insert into public.feed_links (post_id, kind, url, title, sort_order)
    values (p_post_id, v_kind, v_url, v_title, v_ord);
    v_ord := v_ord + 1;
  end loop;
end;
$$;

create or replace function public.feed_replace_audience(
  p_post_id text,
  p_targets_all boolean,
  p_legal_entity_ids text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids text[];
  v_id text;
begin
  delete from public.feed_post_legal_entities where post_id = p_post_id;

  if p_targets_all then
    update public.feed_posts set targets_all = true where id = p_post_id;
    return;
  end if;

  v_ids := array(
    select distinct trim(x)
    from unnest(coalesce(p_legal_entity_ids, array[]::text[])) as t(x)
    where trim(x) <> ''
  );

  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'Выберите хотя бы одно юридическое лицо';
  end if;

  update public.feed_posts set targets_all = false where id = p_post_id;

  foreach v_id in array v_ids
  loop
    insert into public.feed_post_legal_entities (post_id, legal_entity_id)
    values (p_post_id, v_id)
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.feed_replace_poll(
  p_post_id text,
  p_poll jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll_id text;
  v_question text;
  v_allow_multiple boolean;
  v_ends_at timestamptz;
  v_options jsonb;
  v_opt jsonb;
  v_label text;
  v_ord int := 0;
  v_opt_count int := 0;
begin
  delete from public.feed_polls where post_id = p_post_id;

  if p_poll is null or jsonb_typeof(p_poll) <> 'object' then
    return;
  end if;

  v_question := nullif(trim(coalesce(p_poll ->> 'question', '')), '');
  if v_question is null then
    raise exception 'Укажите вопрос опроса';
  end if;

  v_allow_multiple := coalesce((p_poll ->> 'allow_multiple')::boolean, false);
  begin
    v_ends_at := nullif(trim(coalesce(p_poll ->> 'ends_at', '')), '')::timestamptz;
  exception when others then
    raise exception 'Некорректная дата окончания опроса';
  end;

  v_options := p_poll -> 'options';
  if v_options is null or jsonb_typeof(v_options) <> 'array' then
    raise exception 'Добавьте варианты ответа';
  end if;

  insert into public.feed_polls (post_id, question, allow_multiple, ends_at)
  values (p_post_id, v_question, v_allow_multiple, v_ends_at)
  returning id into v_poll_id;

  for v_opt in select * from jsonb_array_elements(v_options)
  loop
    if jsonb_typeof(v_opt) = 'string' then
      v_label := nullif(trim(v_opt #>> '{}'), '');
    else
      v_label := nullif(trim(coalesce(v_opt ->> 'label', '')), '');
    end if;
    if v_label is null then
      continue;
    end if;
    insert into public.feed_poll_options (poll_id, label, sort_order)
    values (v_poll_id, v_label, v_ord);
    v_ord := v_ord + 1;
    v_opt_count := v_opt_count + 1;
  end loop;

  if v_opt_count < 2 then
    raise exception 'В опросе должно быть минимум 2 варианта';
  end if;
end;
$$;

-- ─── RPCs ──────────────────────────────────────────────────────────────────

create or replace function public.feed_list_posts(
  p_limit int default 20,
  p_before timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
  v_ids text[];
  v_id text;
  v_items jsonb := '[]'::jsonb;
  v_post jsonb;
begin
  if not coalesce((v_ctx ->> 'can_access')::boolean, false) then
    raise exception 'Нет доступа к ленте';
  end if;

  select coalesce(array_agg(id order by created_at desc), array[]::text[])
  into v_ids
  from (
    select p.id, p.created_at
    from public.feed_posts p
    where p.deleted_at is null
      and (p_before is null or p.created_at < p_before)
      and public.feed_post_visible_to_viewer(p.id, v_ctx)
    order by p.created_at desc
    limit v_limit
  ) s;

  foreach v_id in array coalesce(v_ids, array[]::text[])
  loop
    v_post := public.feed_build_post_json(v_id, v_ctx);
    if v_post is not null then
      v_items := v_items || jsonb_build_array(v_post);
    end if;
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'viewer', jsonb_build_object(
      'is_admin', v_ctx -> 'is_admin',
      'can_create', v_ctx -> 'can_create'
    )
  );
end;
$$;

create or replace function public.feed_get_post(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
begin
  if not coalesce((v_ctx ->> 'can_access')::boolean, false) then
    raise exception 'Нет доступа к ленте';
  end if;
  if not public.feed_post_visible_to_viewer(p_id, v_ctx) then
    raise exception 'Публикация недоступна';
  end if;
  return public.feed_build_post_json(p_id, v_ctx);
end;
$$;

create or replace function public.feed_create_post(
  p_title text,
  p_body text,
  p_targets_all boolean default false,
  p_legal_entity_ids text[] default array[]::text[],
  p_links jsonb default '[]'::jsonb,
  p_poll jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_uid text := v_ctx ->> 'user_id';
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_post_id text;
begin
  if not coalesce((v_ctx ->> 'can_access')::boolean, false) then
    raise exception 'Нет доступа к ленте';
  end if;
  if not (
    coalesce((v_ctx ->> 'can_create')::boolean, false)
    or coalesce((v_ctx ->> 'is_admin')::boolean, false)
  ) then
    raise exception 'Нет права создавать публикации';
  end if;
  if v_title is null then
    raise exception 'Укажите заголовок';
  end if;
  if v_body is null then
    raise exception 'Укажите текст публикации';
  end if;

  insert into public.feed_posts (author_id, title, body, targets_all)
  values (v_uid, v_title, v_body, coalesce(p_targets_all, false))
  returning id into v_post_id;

  perform public.feed_replace_audience(v_post_id, coalesce(p_targets_all, false), p_legal_entity_ids);
  perform public.feed_replace_links(v_post_id, p_links);
  perform public.feed_replace_poll(v_post_id, p_poll);
  perform public.feed_audit('post.create', v_post_id, null, jsonb_build_object('title', v_title));

  return public.feed_build_post_json(v_post_id, v_ctx);
end;
$$;

create or replace function public.feed_update_post(
  p_id text,
  p_title text,
  p_body text,
  p_targets_all boolean default false,
  p_legal_entity_ids text[] default array[]::text[],
  p_links jsonb default '[]'::jsonb,
  p_poll jsonb default null,
  p_keep_poll boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_has_votes boolean := false;
begin
  if not public.feed_can_manage_post(p_id, v_ctx) then
    raise exception 'Нет права редактировать публикацию';
  end if;
  if v_title is null then
    raise exception 'Укажите заголовок';
  end if;
  if v_body is null then
    raise exception 'Укажите текст публикации';
  end if;

  update public.feed_posts
  set
    title = v_title,
    body = v_body,
    edited_at = now(),
    updated_at = now()
  where id = p_id;

  perform public.feed_replace_audience(p_id, coalesce(p_targets_all, false), p_legal_entity_ids);
  perform public.feed_replace_links(p_id, p_links);

  select exists (
    select 1
    from public.feed_polls pl
    join public.feed_poll_votes v on v.poll_id = pl.id
    where pl.post_id = p_id
  ) into v_has_votes;

  if p_keep_poll and v_has_votes then
    -- Keep existing poll when votes already cast.
    null;
  else
    perform public.feed_replace_poll(p_id, p_poll);
  end if;

  perform public.feed_audit('post.update', p_id, null, jsonb_build_object('title', v_title));
  return public.feed_build_post_json(p_id, v_ctx);
end;
$$;

create or replace function public.feed_soft_delete_post(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
begin
  if not public.feed_can_manage_post(p_id, v_ctx) then
    raise exception 'Нет права удалять публикацию';
  end if;

  update public.feed_posts
  set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;

  perform public.feed_audit('post.delete', p_id);
end;
$$;

create or replace function public.feed_add_attachment(
  p_post_id text,
  p_file_name text,
  p_extension text,
  p_size_bytes bigint,
  p_mime_type text,
  p_storage_path text,
  p_sort_order int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_uid text := v_ctx ->> 'user_id';
  v_count int;
  v_id text;
  v_ext text := lower(trim(coalesce(p_extension, '')));
  v_name text := nullif(trim(coalesce(p_file_name, '')), '');
  v_path text := nullif(trim(coalesce(p_storage_path, '')), '');
begin
  if not public.feed_can_manage_post(p_post_id, v_ctx) then
    raise exception 'Нет права добавлять вложения';
  end if;
  if v_name is null or v_path is null then
    raise exception 'Некорректное вложение';
  end if;
  if coalesce(p_size_bytes, 0) <= 0 or p_size_bytes > 26214400 then
    raise exception 'Файл превышает допустимый размер';
  end if;
  if v_ext in ('exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'js', 'vbs', 'ps1', 'sh', 'dmg', 'apk') then
    raise exception 'Данный тип файла запрещен для загрузки';
  end if;

  select count(*)::int into v_count
  from public.feed_attachments
  where post_id = p_post_id;
  if v_count >= 10 then
    raise exception 'Не более 10 вложений на публикацию';
  end if;

  if split_part(v_path, '/', 1) is distinct from p_post_id then
    raise exception 'Некорректный путь файла';
  end if;

  insert into public.feed_attachments (
    post_id, file_name, extension, size_bytes, mime_type, storage_path, uploaded_by, sort_order
  ) values (
    p_post_id,
    v_name,
    v_ext,
    p_size_bytes,
    coalesce(nullif(trim(p_mime_type), ''), 'application/octet-stream'),
    v_path,
    v_uid,
    coalesce(p_sort_order, v_count)
  )
  returning id into v_id;

  update public.feed_posts set updated_at = now() where id = p_post_id;
  perform public.feed_audit('attachment.add', p_post_id, null, jsonb_build_object('attachment_id', v_id));

  return jsonb_build_object(
    'id', v_id,
    'file_name', v_name,
    'extension', v_ext,
    'size_bytes', p_size_bytes,
    'mime_type', coalesce(nullif(trim(p_mime_type), ''), 'application/octet-stream'),
    'storage_path', v_path,
    'sort_order', coalesce(p_sort_order, v_count)
  );
end;
$$;

create or replace function public.feed_remove_attachment(
  p_attachment_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_post_id text;
begin
  select post_id into v_post_id
  from public.feed_attachments
  where id = p_attachment_id;

  if v_post_id is null then
    raise exception 'Вложение не найдено';
  end if;
  if not public.feed_can_manage_post(v_post_id, v_ctx) then
    raise exception 'Нет права удалять вложения';
  end if;

  delete from public.feed_attachments where id = p_attachment_id;
  update public.feed_posts set updated_at = now() where id = v_post_id;
  perform public.feed_audit(
    'attachment.remove',
    v_post_id,
    null,
    jsonb_build_object('attachment_id', p_attachment_id)
  );
end;
$$;

create or replace function public.feed_add_comment(
  p_post_id text,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_uid text := v_ctx ->> 'user_id';
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_id text;
begin
  if not public.feed_post_visible_to_viewer(p_post_id, v_ctx) then
    raise exception 'Публикация недоступна';
  end if;
  if v_body is null then
    raise exception 'Введите текст комментария';
  end if;

  insert into public.feed_comments (post_id, author_id, body)
  values (p_post_id, v_uid, v_body)
  returning id into v_id;

  perform public.feed_audit('comment.create', p_post_id, v_id);

  return jsonb_build_object(
    'id', v_id,
    'author_id', v_uid,
    'body', v_body,
    'edited_at', null,
    'created_at', now()
  );
end;
$$;

create or replace function public.feed_edit_comment(
  p_comment_id text,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_uid text := v_ctx ->> 'user_id';
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_row public.feed_comments%rowtype;
begin
  select * into v_row from public.feed_comments where id = p_comment_id;
  if not found or v_row.deleted_at is not null then
    raise exception 'Комментарий не найден';
  end if;
  if not public.feed_post_visible_to_viewer(v_row.post_id, v_ctx) then
    raise exception 'Публикация недоступна';
  end if;
  if v_row.author_id is distinct from v_uid
     and not coalesce((v_ctx ->> 'is_admin')::boolean, false) then
    raise exception 'Можно редактировать только свой комментарий';
  end if;
  if v_body is null then
    raise exception 'Введите текст комментария';
  end if;

  update public.feed_comments
  set body = v_body, edited_at = now()
  where id = p_comment_id;

  perform public.feed_audit('comment.edit', v_row.post_id, p_comment_id);

  return jsonb_build_object(
    'id', p_comment_id,
    'author_id', v_row.author_id,
    'body', v_body,
    'edited_at', now(),
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.feed_delete_comment(p_comment_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_uid text := v_ctx ->> 'user_id';
  v_row public.feed_comments%rowtype;
begin
  select * into v_row from public.feed_comments where id = p_comment_id;
  if not found or v_row.deleted_at is not null then
    raise exception 'Комментарий не найден';
  end if;
  if not public.feed_post_visible_to_viewer(v_row.post_id, v_ctx) then
    raise exception 'Публикация недоступна';
  end if;
  if v_row.author_id is distinct from v_uid
     and not coalesce((v_ctx ->> 'is_admin')::boolean, false) then
    raise exception 'Можно удалять только свой комментарий';
  end if;

  update public.feed_comments
  set deleted_at = now()
  where id = p_comment_id;

  perform public.feed_audit('comment.delete', v_row.post_id, p_comment_id);
end;
$$;

create or replace function public.feed_vote_poll(
  p_poll_id text,
  p_option_ids text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb := public.feed_viewer_context();
  v_uid text := v_ctx ->> 'user_id';
  v_poll public.feed_polls%rowtype;
  v_ids text[];
  v_id text;
  v_valid int;
begin
  select * into v_poll from public.feed_polls where id = p_poll_id;
  if not found then
    raise exception 'Опрос не найден';
  end if;
  if not public.feed_post_visible_to_viewer(v_poll.post_id, v_ctx) then
    raise exception 'Публикация недоступна';
  end if;
  if v_poll.ends_at is not null and v_poll.ends_at <= now() then
    raise exception 'Опрос завершён';
  end if;
  if exists (
    select 1 from public.feed_poll_votes where poll_id = p_poll_id and user_id = v_uid
  ) then
    raise exception 'Вы уже проголосовали';
  end if;

  v_ids := array(
    select distinct trim(x)
    from unnest(coalesce(p_option_ids, array[]::text[])) as t(x)
    where trim(x) <> ''
  );
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'Выберите вариант ответа';
  end if;
  if not v_poll.allow_multiple and cardinality(v_ids) > 1 then
    raise exception 'Можно выбрать только один вариант';
  end if;

  select count(*)::int into v_valid
  from public.feed_poll_options
  where poll_id = p_poll_id and id = any (v_ids);
  if v_valid is distinct from cardinality(v_ids) then
    raise exception 'Некорректный вариант ответа';
  end if;

  foreach v_id in array v_ids
  loop
    insert into public.feed_poll_votes (poll_id, option_id, user_id)
    values (p_poll_id, v_id, v_uid);
  end loop;

  perform public.feed_audit(
    'poll.vote',
    v_poll.post_id,
    null,
    jsonb_build_object('poll_id', p_poll_id, 'option_ids', to_jsonb(v_ids))
  );

  return public.feed_build_poll_json(p_poll_id, v_uid);
end;
$$;

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.feed_posts enable row level security;
alter table public.feed_post_legal_entities enable row level security;
alter table public.feed_attachments enable row level security;
alter table public.feed_links enable row level security;
alter table public.feed_polls enable row level security;
alter table public.feed_poll_options enable row level security;
alter table public.feed_poll_votes enable row level security;
alter table public.feed_comments enable row level security;
alter table public.feed_audit_log enable row level security;

-- No direct client access — all reads/writes go through security definer RPCs.
-- Keep SELECT policies absent (deny by default with RLS enabled + no policy).

-- ─── Storage ───────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('feed-files', 'feed-files', false, 26214400)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists feed_files_select on storage.objects;
drop policy if exists feed_files_insert on storage.objects;
drop policy if exists feed_files_update on storage.objects;
drop policy if exists feed_files_delete on storage.objects;

create policy feed_files_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'feed-files'
    and public.feed_can_access_post(split_part(name, '/', 1))
  );

create policy feed_files_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'feed-files'
    and public.feed_can_manage_post(split_part(name, '/', 1))
  );

create policy feed_files_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'feed-files'
    and public.feed_can_manage_post(split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'feed-files'
    and public.feed_can_manage_post(split_part(name, '/', 1))
  );

create policy feed_files_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'feed-files'
    and public.feed_can_manage_post(split_part(name, '/', 1))
  );

-- ─── Grants ────────────────────────────────────────────────────────────────

grant execute on function public.feed_viewer_context() to authenticated, service_role;
grant execute on function public.feed_can_access_post(text) to authenticated, service_role;
grant execute on function public.feed_list_posts(int, timestamptz) to authenticated, service_role;
grant execute on function public.feed_get_post(text) to authenticated, service_role;
grant execute on function public.feed_create_post(text, text, boolean, text[], jsonb, jsonb) to authenticated, service_role;
grant execute on function public.feed_update_post(text, text, text, boolean, text[], jsonb, jsonb, boolean) to authenticated, service_role;
grant execute on function public.feed_soft_delete_post(text) to authenticated, service_role;
grant execute on function public.feed_add_attachment(text, text, text, bigint, text, text, int) to authenticated, service_role;
grant execute on function public.feed_remove_attachment(text) to authenticated, service_role;
grant execute on function public.feed_add_comment(text, text) to authenticated, service_role;
grant execute on function public.feed_edit_comment(text, text) to authenticated, service_role;
grant execute on function public.feed_delete_comment(text) to authenticated, service_role;
grant execute on function public.feed_vote_poll(text, text[]) to authenticated, service_role;

-- Refresh PostgREST schema cache so new RPCs are visible immediately.
notify pgrst, 'reload schema';
