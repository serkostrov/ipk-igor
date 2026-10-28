-- Immutable schema version history for entities (git-like publishes).
-- Records pin to schema_version at creation; new records get entities.published_version.

create table if not exists public.entity_schema_versions (
  id bigint generated always as identity primary key,
  entity_id text not null references public.entities (id) on delete cascade,
  version int not null check (version >= 1),
  definition jsonb not null,
  message text not null,
  actor_id uuid null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (entity_id, version)
);

create index if not exists entity_schema_versions_entity_idx
  on public.entity_schema_versions (entity_id, version desc);

alter table public.entity_schema_versions enable row level security;

drop policy if exists "entity_schema_versions_select" on public.entity_schema_versions;
create policy "entity_schema_versions_select"
  on public.entity_schema_versions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "entity_schema_versions_insert" on public.entity_schema_versions;
create policy "entity_schema_versions_insert"
  on public.entity_schema_versions
  for insert
  to anon, authenticated
  with check (true);

-- No update/delete policies: versions are append-only from the client.

alter table public.entities
  add column if not exists published_version int not null default 1;

alter table public.entity_records
  add column if not exists schema_version int not null default 1;

create index if not exists entity_records_schema_version_idx
  on public.entity_records (entity_id, schema_version);

-- Backfill: publish current definition as version 1 for every entity.
insert into public.entity_schema_versions (entity_id, version, definition, message, actor_id)
select
  e.id,
  1,
  e.definition,
  'Начальная версия',
  null
from public.entities e
where not exists (
  select 1
  from public.entity_schema_versions v
  where v.entity_id = e.id and v.version = 1
);

update public.entities
set published_version = 1
where published_version is distinct from 1
  or published_version is null;

update public.entity_records
set schema_version = 1
where schema_version is distinct from 1
  or schema_version is null;
