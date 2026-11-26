-- Only a system administrator, the service role, or a security-definer
-- profile routine may change a user's role. A first profile may still be
-- created as «Сотрудник». Open select policies stay as they are.

create or replace function public.entity_record_role_token(p_values jsonb)
returns text
language sql
immutable
as $$
  select nullif(
    split_part(
      btrim(coalesce(
        case
          when jsonb_typeof(p_values -> 'field-system-users-role') = 'array'
            then p_values -> 'field-system-users-role' ->> 0
          else p_values ->> 'field-system-users-role'
        end,
        ''
      )),
      ',',
      1
    ),
    ''
  );
$$;

create or replace function public.entity_records_guard_user_role()
returns trigger
language plpgsql
as $$
declare
  v_old text;
  v_new text;
begin
  if new.entity_id is distinct from 'entity-system-users' then
    return new;
  end if;

  v_new := public.entity_record_role_token(new.field_values);
  if tg_op = 'UPDATE' then
    v_old := public.entity_record_role_token(old.field_values);
  else
    v_old := null;
  end if;

  if v_new is not distinct from v_old then
    return new;
  end if;

  -- First profile: employee role on insert, or filling an empty role.
  if v_new = 'role-system-employee'
     and (tg_op = 'INSERT' or v_old is null) then
    return new;
  end if;

  -- Service role (no JWT) and security-definer writers (function owner).
  if auth.uid() is null
     or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if exists (
    select 1
    from public.entity_records r
    where r.entity_id = 'entity-system-users'
      and r.auth_user_id = auth.uid()
      and public.entity_record_role_token(r.field_values) = 'role-system-admin'
  ) then
    return new;
  end if;

  raise exception 'Недостаточно прав для изменения роли пользователя'
    using errcode = '42501';
end;
$$;

drop trigger if exists entity_records_guard_user_role on public.entity_records;
create trigger entity_records_guard_user_role
  before insert or update of field_values on public.entity_records
  for each row
  execute function public.entity_records_guard_user_role();
