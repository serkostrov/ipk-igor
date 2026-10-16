-- Live updates for entity records (boards, statuses, timers across users).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'entity_records'
    )
  then
    alter publication supabase_realtime add table public.entity_records;
  end if;
end;
$$;
