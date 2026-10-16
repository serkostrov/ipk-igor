-- Storage bucket for entity record file tabs (mini filesystem).

insert into storage.buckets (id, name, public, file_size_limit)
values ('entity-files', 'entity-files', false, null)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "entity_files_select" on storage.objects;
drop policy if exists "entity_files_insert" on storage.objects;
drop policy if exists "entity_files_update" on storage.objects;
drop policy if exists "entity_files_delete" on storage.objects;

create policy "entity_files_select"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'entity-files');

create policy "entity_files_insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'entity-files');

create policy "entity_files_update"
  on storage.objects
  for update
  to anon, authenticated
  using (bucket_id = 'entity-files')
  with check (bucket_id = 'entity-files');

create policy "entity_files_delete"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'entity-files');
