-- Relational storage for entity records.
-- Entity structure (schema) lives in public.entities.definition.

create table if not exists public.entity_records (
  id text primary key,
  entity_id text not null references public.entities (id) on delete cascade,
  field_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entity_records_entity_id_idx
  on public.entity_records (entity_id);

alter table public.entity_records enable row level security;

create policy "entity_records_select"
  on public.entity_records
  for select
  to anon, authenticated
  using (true);

create policy "entity_records_insert"
  on public.entity_records
  for insert
  to anon, authenticated
  with check (true);

create policy "entity_records_update"
  on public.entity_records
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "entity_records_delete"
  on public.entity_records
  for delete
  to anon, authenticated
  using (true);
