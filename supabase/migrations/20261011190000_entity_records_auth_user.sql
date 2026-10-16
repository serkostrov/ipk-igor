-- Link entity records (Users profiles) to Supabase Auth accounts.
-- Tighten RLS: authenticated only (anon no longer has open access).

alter table public.entity_records
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null;

create index if not exists entity_records_auth_user_id_idx
  on public.entity_records (auth_user_id)
  where auth_user_id is not null;

-- entity_records policies
drop policy if exists "entity_records_select" on public.entity_records;
drop policy if exists "entity_records_insert" on public.entity_records;
drop policy if exists "entity_records_update" on public.entity_records;
drop policy if exists "entity_records_delete" on public.entity_records;

create policy "entity_records_select"
  on public.entity_records
  for select
  to authenticated
  using (true);

create policy "entity_records_insert"
  on public.entity_records
  for insert
  to authenticated
  with check (true);

create policy "entity_records_update"
  on public.entity_records
  for update
  to authenticated
  using (true)
  with check (true);

create policy "entity_records_delete"
  on public.entity_records
  for delete
  to authenticated
  using (true);

-- entities policies
drop policy if exists "entities_select" on public.entities;
drop policy if exists "entities_insert" on public.entities;
drop policy if exists "entities_update" on public.entities;
drop policy if exists "entities_delete" on public.entities;

create policy "entities_select"
  on public.entities
  for select
  to authenticated
  using (true);

create policy "entities_insert"
  on public.entities
  for insert
  to authenticated
  with check (true);

create policy "entities_update"
  on public.entities
  for update
  to authenticated
  using (true)
  with check (true);

create policy "entities_delete"
  on public.entities
  for delete
  to authenticated
  using (true);
