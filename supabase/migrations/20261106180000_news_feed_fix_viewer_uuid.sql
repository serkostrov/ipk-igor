-- entity_records.auth_user_id is uuid; compare with auth.uid() (uuid), not text.

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

notify pgrst, 'reload schema';
