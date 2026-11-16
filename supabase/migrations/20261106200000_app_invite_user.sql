-- Invite users without Edge Functions (self-hosted entrypoint often broken).
-- Creates auth.users + auth.identities + Users entity_records.

create extension if not exists pgcrypto with schema extensions;

-- Minimal RBAC helpers (idempotent) for invite ACL when full roles_rbac is absent.
create or replace function public.app_roles_document()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_documents where key = 'roles' limit 1),
    '{"roles":[]}'::jsonb
  );
$$;

create or replace function public.app_current_user_role_id()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw text;
  v_parsed text;
begin
  select nullif(trim(coalesce(r.field_values ->> 'field-system-users-role', '')), '')
  into v_raw
  from public.entity_records r
  where r.entity_id = 'entity-system-users'
    and r.auth_user_id = auth.uid()
  order by r.created_at asc nulls last
  limit 1;

  if v_raw is null then
    return 'role-system-employee';
  end if;

  -- list field may be plain id, CSV, or JSON array
  if left(v_raw, 1) = '[' then
    begin
      select nullif(trim(value), '')
      into v_parsed
      from jsonb_array_elements_text(v_raw::jsonb) as t(value)
      where trim(value) <> ''
      limit 1;
    exception when others then
      v_parsed := null;
    end;
    return coalesce(v_parsed, 'role-system-employee');
  end if;

  return split_part(v_raw, ',', 1);
end;
$$;

create or replace function public.app_can_invite_users()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role_id text := public.app_current_user_role_id();
  v_role jsonb;
  v_perms jsonb;
begin
  if auth.uid() is null then
    return false;
  end if;

  if v_role_id = 'role-system-admin' then
    return true;
  end if;

  select elem
  into v_role
  from jsonb_array_elements(coalesce(public.app_roles_document() -> 'roles', '[]'::jsonb)) as elem
  where elem ->> 'id' = v_role_id
  limit 1;

  v_perms := coalesce(v_role -> 'permissions', '{}'::jsonb);
  if v_perms ->> 'settingsTabs' = '*' or v_perms -> 'settingsTabs' = '"*"'::jsonb then
    return true;
  end if;
  return coalesce((v_perms ->> 'canInviteUsers')::boolean, false);
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
  v_user_id uuid := gen_random_uuid();
  v_record_id text := 'record-' || gen_random_uuid()::text;
  v_field_values jsonb := coalesce(p_values, '{}'::jsonb);
  v_instance_id uuid;
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

  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Пользователь с таким email уже существует';
  end if;

  select id into v_instance_id from auth.instances limit 1;
  if v_instance_id is null then
    v_instance_id := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

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
    email_change
  ) values (
    v_instance_id,
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
    ''
  );

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
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_email,
    now(),
    now(),
    now()
  );

  v_field_values := v_field_values
    || jsonb_build_object(
      'field-system-users-name', v_name,
      'field-system-users-email', v_email,
      'field-system-users-phone', v_phone,
      'field-system-users-role', v_role_id
    );

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
    v_field_values,
    v_user_id,
    auth.uid(),
    now()
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'entity_id', v_row.entity_id,
    'field_values', v_row.field_values,
    'auth_user_id', v_row.auth_user_id,
    'created_by', v_row.created_by
  );
exception
  when unique_violation then
    raise exception 'Пользователь с таким email уже существует';
end;
$$;

revoke all on function public.app_roles_document() from public;
revoke all on function public.app_current_user_role_id() from public;
revoke all on function public.app_can_invite_users() from public;
revoke all on function public.app_invite_user(text, text, text, text, text, jsonb) from public;

grant execute on function public.app_roles_document() to authenticated, service_role;
grant execute on function public.app_current_user_role_id() to authenticated, service_role;
grant execute on function public.app_can_invite_users() to authenticated, service_role;
grant execute on function public.app_invite_user(text, text, text, text, text, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
