-- Live updates for entity structure (fields, list options, layout) across clients.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'entities'
    )
  then
    alter publication supabase_realtime add table public.entities;
  end if;
end;
$$;
