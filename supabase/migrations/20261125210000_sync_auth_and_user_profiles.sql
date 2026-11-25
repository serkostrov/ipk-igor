-- Keep auth.users and entity-system-users profiles in sync.
-- - Claim orphan profiles by email
-- - Create missing profiles for auth accounts
-- - Invite upserts auth+profile (no more "tables live separately")
-- - Auth signup trigger creates/links the Users profile

create extension if not exists pgcrypto with schema extensions;

create or replace function public.app_auth_instance_id()
returns uuid
language plpgsql
stable
security definer
set search_path = auth, public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.instances limit 1;
  return coalesce(v_id, '00000000-0000-0000-0000-000000000000'::uuid);
end;
$$;

create or replace function public.app_ensure_auth_email_identity(
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
begin
  if p_user_id is null or v_email is null then
    return;
  end if;

  if exists (
    select 1 from auth.identities i
    where i.user_id = p_user_id and i.provider = 'email'
  ) then
    update auth.identities
    set
      provider_id = p_user_id::text,
      identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object(
        'sub', p_user_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      updated_at = now()
    where user_id = p_user_id
      and provider = 'email';
    return;
  end if;

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    p_user_id,
    jsonb_build_object(
      'sub', p_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    p_user_id::text,
    now(),
    now(),
    now()
  );
end;
$$;

/**
 * Find or create the Users entity profile for an auth account.
 * Prefer an existing row linked by auth_user_id, then an orphan by email.
 */
create or replace function public.app_ensure_user_profile(
  p_auth_user_id uuid,
  p_email text,
  p_name text default null,
  p_phone text default null,
  p_role_id text default null,
  p_values jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns public.entity_records
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_phone text := coalesce(trim(coalesce(p_phone, '')), '');
  v_role_id text := nullif(trim(coalesce(p_role_id, '')), '');
  v_values jsonb := coalesce(p_values, '{}'::jsonb);
  v_row public.entity_records;
  v_record_id text;
begin
  if p_auth_user_id is null then
    raise exception 'auth user id required';
  end if;

  if v_role_id is null or v_role_id = '' then
    v_role_id := 'role-system-employee';
  end if;

  if v_name is null then
    v_name := coalesce(
      nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
      'Пользователь'
    );
  end if;

  select * into v_row
  from public.entity_records r
  where r.entity_id = 'entity-system-users'
    and r.auth_user_id = p_auth_user_id
  order by r.created_at asc nulls last
  limit 1;

  if not found and v_email is not null then
    select * into v_row
    from public.entity_records r
    where r.entity_id = 'entity-system-users'
      and r.auth_user_id is null
      and lower(nullif(trim(coalesce(r.field_values->>'field-system-users-email', '')), '')) = v_email
    order by r.created_at asc nulls last
    limit 1;
  end if;

  v_values := v_values || jsonb_build_object(
    'field-system-users-name', v_name,
    'field-system-users-email', coalesce(v_email, ''),
    'field-system-users-phone', v_phone,
    'field-system-users-role', v_role_id
  );

  if found then
    update public.entity_records
    set
      auth_user_id = p_auth_user_id,
      field_values = coalesce(field_values, '{}'::jsonb) || v_values,
      updated_at = now()
    where id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  v_record_id := 'record-' || gen_random_uuid()::text;
  insert into public.entity_records (
    id,
    entity_id,
    field_values,
    auth_user_id,
    created_by,
    updated_at
  ) values (
    v_record_id,
    'entity-system-users',
    v_values,
    p_auth_user_id,
    p_created_by,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.app_set_user_password(
  p_record_id text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_row public.entity_records;
  v_password text := coalesce(p_password, '');
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Необходима авторизация';
  end if;
  if not public.app_can_invite_users() then
    raise exception 'Недостаточно прав для смены пароля пользователя';
  end if;
  if char_length(v_password) < 6 then
    raise exception 'Пароль должен быть не короче 6 символов';
  end if;

  select * into v_row
  from public.entity_records
  where id = p_record_id
    and entity_id = 'entity-system-users';
  if not found then
    raise exception 'Пользователь не найден';
  end if;

  if v_row.auth_user_id is null then
    raise exception 'У записи нет связанного аккаунта входа';
  end if;

  v_email := lower(nullif(trim(coalesce(v_row.field_values->>'field-system-users-email', '')), ''));

  update auth.users
  set
    encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = v_row.auth_user_id;

  perform public.app_ensure_auth_email_identity(v_row.auth_user_id, coalesce(v_email, ''));
end;
$$;

create or replace function public.app_invite_user(
  p_name text,
  p_email text,
  p_password text,
  p_phone text default null,
  p_role_id text default null,
  p_values jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_phone text := coalesce(trim(coalesce(p_phone, '')), '');
  v_password text := coalesce(p_password, '');
  v_role_id text := nullif(trim(coalesce(p_role_id, '')), '');
  v_user_id uuid;
  v_existing_auth auth.users%rowtype;
  v_row public.entity_records;
begin
  if auth.uid() is null then
    raise exception 'Необходима авторизация';
  end if;

  if not public.app_can_invite_users() then
    raise exception 'Недостаточно прав для приглашения пользователей';
  end if;

  if v_name is null then
    raise exception 'Укажите ФИО';
  end if;
  if v_email is null then
    raise exception 'Укажите email';
  end if;
  if char_length(v_password) < 6 then
    raise exception 'Пароль должен быть не короче 6 символов';
  end if;

  if v_role_id is null or v_role_id = '' then
    v_role_id := 'role-system-employee';
  end if;

  select * into v_existing_auth
  from auth.users
  where lower(email) = v_email
  limit 1;

  if found then
    v_user_id := v_existing_auth.id;
    update auth.users
    set
      encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('full_name', v_name),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      updated_at = now()
    where id = v_user_id;
  else
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
      is_sso_user,
      is_anonymous
    ) values (
      public.app_auth_instance_id(),
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('full_name', v_name),
      now(),
      now(),
      '',
      '',
      '',
      '',
      false,
      false
    );
  end if;

  perform public.app_ensure_auth_email_identity(v_user_id, v_email);

  v_row := public.app_ensure_user_profile(
    v_user_id,
    v_email,
    v_name,
    v_phone,
    v_role_id,
    coalesce(p_values, '{}'::jsonb),
    auth.uid()
  );

  return jsonb_build_object(
    'id', v_row.id,
    'entity_id', v_row.entity_id,
    'field_values', v_row.field_values,
    'auth_user_id', v_row.auth_user_id,
    'created_by', v_row.created_by
  );
end;
$$;

create or replace function public.app_sync_auth_and_user_profiles()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_linked int := 0;
  v_created int := 0;
  v_identities int := 0;
  v_orphan record;
  v_auth record;
  v_linked_auth record;
  v_profile public.entity_records;
begin
  -- 1) Link orphan Users rows to auth by email when the auth id is free.
  for v_orphan in
    select er.id, er.field_values, au.id as auth_id, au.email
    from public.entity_records er
    join auth.users au
      on lower(au.email) = lower(nullif(trim(coalesce(er.field_values->>'field-system-users-email', '')), ''))
    where er.entity_id = 'entity-system-users'
      and er.auth_user_id is null
      and not exists (
        select 1
        from public.entity_records other
        where other.entity_id = 'entity-system-users'
          and other.auth_user_id = au.id
      )
  loop
    update public.entity_records
    set auth_user_id = v_orphan.auth_id, updated_at = now()
    where id = v_orphan.id
      and auth_user_id is null;
    if found then
      v_linked := v_linked + 1;
      perform public.app_ensure_auth_email_identity(v_orphan.auth_id, v_orphan.email);
      v_identities := v_identities + 1;
    end if;
  end loop;

  -- 2) Create profiles for auth users that still have none.
  for v_auth in
    select au.*
    from auth.users au
    where au.deleted_at is null
      and not exists (
        select 1
        from public.entity_records er
        where er.entity_id = 'entity-system-users'
          and er.auth_user_id = au.id
      )
  loop
    v_profile := public.app_ensure_user_profile(
      v_auth.id,
      v_auth.email,
      coalesce(v_auth.raw_user_meta_data->>'full_name', v_auth.raw_user_meta_data->>'name'),
      null,
      'role-system-employee',
      '{}'::jsonb,
      null
    );
    v_created := v_created + 1;
    perform public.app_ensure_auth_email_identity(v_auth.id, v_auth.email);
    v_identities := v_identities + 1;
  end loop;

  -- 3) Normalize identities for already-linked profiles.
  for v_linked_auth in
    select au.id, au.email
    from auth.users au
    join public.entity_records er
      on er.auth_user_id = au.id
     and er.entity_id = 'entity-system-users'
    where au.deleted_at is null
  loop
    perform public.app_ensure_auth_email_identity(v_linked_auth.id, v_linked_auth.email);
    v_identities := v_identities + 1;
  end loop;

  return jsonb_build_object(
    'linked', v_linked,
    'created', v_created,
    'identities_touched', v_identities
  );
end;
$$;

create or replace function public.app_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.app_ensure_user_profile(
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    null,
    'role-system-employee',
    '{}'::jsonb,
    null
  );
  perform public.app_ensure_auth_email_identity(NEW.id, NEW.email);
  return NEW;
exception
  when others then
    -- Never block auth signup on profile sync failure.
    raise warning 'app_on_auth_user_created failed: %', SQLERRM;
    return NEW;
end;
$$;

drop trigger if exists trg_app_on_auth_user_created on auth.users;
create trigger trg_app_on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.app_on_auth_user_created();

revoke all on function public.app_auth_instance_id() from public;
revoke all on function public.app_ensure_auth_email_identity(uuid, text) from public;
revoke all on function public.app_ensure_user_profile(uuid, text, text, text, text, jsonb, uuid) from public;
revoke all on function public.app_set_user_password(text, text) from public;
revoke all on function public.app_invite_user(text, text, text, text, text, jsonb) from public;
revoke all on function public.app_sync_auth_and_user_profiles() from public;
revoke all on function public.app_on_auth_user_created() from public;

grant execute on function public.app_invite_user(text, text, text, text, text, jsonb)
  to authenticated, service_role;
grant execute on function public.app_set_user_password(text, text)
  to authenticated, service_role;
grant execute on function public.app_sync_auth_and_user_profiles()
  to service_role;
grant execute on function public.app_ensure_user_profile(uuid, text, text, text, text, jsonb, uuid)
  to service_role;

-- One-shot sync for current data.
select public.app_sync_auth_and_user_profiles();

notify pgrst, 'reload schema';
