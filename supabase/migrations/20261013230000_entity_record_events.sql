-- Immutable change log for entity records (record «История» tab and global journal).
-- Rows are written only by the trigger below; clients can read them.

create table if not exists public.entity_record_events (
  id bigint generated always as identity primary key,
  entity_id text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- { fieldId: { "old": value | null, "new": value | null } }
  changes jsonb not null default '{}'::jsonb,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists entity_record_events_record_idx
  on public.entity_record_events (record_id, created_at desc);

create index if not exists entity_record_events_entity_idx
  on public.entity_record_events (entity_id, created_at desc);

create index if not exists entity_record_events_created_idx
  on public.entity_record_events (created_at desc);

alter table public.entity_record_events enable row level security;

drop policy if exists "entity_record_events_select" on public.entity_record_events;

create policy "entity_record_events_select"
  on public.entity_record_events
  for select
  to authenticated
  using (true);

create or replace function public.log_entity_record_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_values jsonb := '{}'::jsonb;
  new_values jsonb := '{}'::jsonb;
  diff jsonb := '{}'::jsonb;
  field_key text;
begin
  if tg_op <> 'INSERT' then
    old_values := coalesce(old.field_values, '{}'::jsonb);
  end if;
  if tg_op <> 'DELETE' then
    new_values := coalesce(new.field_values, '{}'::jsonb);
  end if;

  for field_key in
    select jsonb_object_keys(old_values)
    union
    select jsonb_object_keys(new_values)
  loop
    if (old_values -> field_key) is distinct from (new_values -> field_key) then
      diff := diff || jsonb_build_object(
        field_key,
        jsonb_build_object(
          'old', old_values -> field_key,
          'new', new_values -> field_key
        )
      );
    end if;
  end loop;

  if tg_op = 'UPDATE' and diff = '{}'::jsonb then
    return new;
  end if;

  insert into public.entity_record_events (entity_id, record_id, action, changes, actor_id)
  values (
    case when tg_op = 'DELETE' then old.entity_id else new.entity_id end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    lower(tg_op),
    diff,
    auth.uid()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists entity_records_log_event on public.entity_records;

create trigger entity_records_log_event
  after insert or update or delete on public.entity_records
  for each row
  execute function public.log_entity_record_event();
