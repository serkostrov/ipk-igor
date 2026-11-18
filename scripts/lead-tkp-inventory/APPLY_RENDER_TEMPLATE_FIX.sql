-- Fix ambiguous overloads (Postgres 42725):
--   function public.automation_render_template(text, jsonb) is not unique
-- Baseline created (text, jsonb) then later (text, jsonb, text default null).
-- CREATE OR REPLACE does not replace a different arity, so both coexist and
-- two-arg call sites cannot choose. Drop all overloads, keep one 3-arg fn.
-- Same pattern for notification_render_template.

drop function if exists public.automation_render_template(text, jsonb);
drop function if exists public.automation_render_template(text, jsonb, text);

drop function if exists public.notification_render_template(text, jsonb);
drop function if exists public.notification_render_template(text, jsonb, text);

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

  result := regexp_replace(result, '\{\{[^}]+\}\}', '', 'g');
  result := public.entity_replace_record_ids_in_text(result);
  result := regexp_replace(result, '[ \t]{2,}', ' ', 'g');
  result := regexp_replace(result, ' ?([,;:])', '\1', 'g');
  return btrim(result);
end;
$$;

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

grant execute on function public.notification_render_template(text, jsonb, text)
  to anon, authenticated, service_role;
grant execute on function public.automation_render_template(text, jsonb, text)
  to anon, authenticated, service_role;

-- Verify (must return exactly 1 row for automation_render_template):
-- select p.proname, pg_get_function_identity_arguments(p.oid)
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.proname in ('automation_render_template','notification_render_template')
-- order by 1, 2;
