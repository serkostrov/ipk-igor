-- Keep the audit trail when an entity and its schema versions are deleted.
create table public.entity_events (
  id bigint generated always as identity primary key,
  entity_id text not null,
  action text not null check (action in ('insert', 'update', 'delete', 'publish')),
  before_definition jsonb,
  after_definition jsonb,
  entity_name text generated always as (coalesce(nullif(coalesce(after_definition, before_definition)->>'namePlural', ''),
                nullif(coalesce(after_definition, before_definition)->>'name', ''), entity_id)) stored,
  has_details boolean generated always as (before_definition is not null and after_definition is not null) stored,
  version integer,
  message text,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index entity_events_created_idx on public.entity_events (created_at desc, id desc);
create index entity_events_entity_idx on public.entity_events (entity_id, created_at desc);

alter table public.entity_events enable row level security;
revoke all on public.entity_events from public, anon, authenticated;
grant select on public.entity_events to authenticated;
create policy entity_events_select on public.entity_events for select to authenticated using (true);

create function public.log_entity_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.definition is not distinct from new.definition then
    return null;
  end if;

  insert into public.entity_events (entity_id, action, before_definition, after_definition)
  values (coalesce(new.id, old.id), lower(tg_op), old.definition, new.definition);
  return null;
end;
$$;

create trigger entities_log_event after insert or update or delete on public.entities
for each row execute function public.log_entity_event();

-- Version 1 of a newly created entity is already represented by its creation.
create function public.log_entity_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.entity_events (entity_id, action, after_definition, version, message, actor_id, created_at)
  values (new.entity_id, 'publish', new.definition, new.version, new.message, auth.uid(), now());
  return null;
end;
$$;

create trigger entity_versions_log_publication after insert on public.entity_schema_versions
for each row when (new.version > 1) execute function public.log_entity_publication();

-- Import only documented publications, retaining their original attribution.
insert into public.entity_events (entity_id, action, before_definition, after_definition, version, message, actor_id, created_at)
select entity_id, 'publish', lag(definition) over (partition by entity_id order by version),
       definition, version, message, actor_id, created_at
from public.entity_schema_versions;

notify pgrst, 'reload schema';
