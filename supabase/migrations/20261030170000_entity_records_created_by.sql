-- Optional owner column used by the client for RBAC / profile seeding.
-- Safe if already present.

alter table public.entity_records
  add column if not exists created_by text null;

create index if not exists entity_records_created_by_idx
  on public.entity_records (created_by)
  where created_by is not null;
