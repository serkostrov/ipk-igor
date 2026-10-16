-- Entity definitions: one row per entity, schema in JSONB.
create table if not exists public.entities (
  id text primary key,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entities_created_at_idx
  on public.entities (created_at);

alter table public.entities enable row level security;

create policy "entities_select"
  on public.entities
  for select
  to anon, authenticated
  using (true);

create policy "entities_insert"
  on public.entities
  for insert
  to anon, authenticated
  with check (true);

create policy "entities_update"
  on public.entities
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "entities_delete"
  on public.entities
  for delete
  to anon, authenticated
  using (true);

create or replace function public.set_entities_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entities_set_updated_at on public.entities;
create trigger entities_set_updated_at
  before update on public.entities
  for each row
  execute function public.set_entities_updated_at();
