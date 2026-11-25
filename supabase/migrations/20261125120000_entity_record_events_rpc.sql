-- Record change history: server-side read boundary.
--
-- Part of the "move record work off the browser" refactor. The history pages
-- used to fetch raw `entity_record_events` rows and then resolve every label
-- (actor name, record title, relation values inside the diff) client-side over
-- the full in-browser `entity_records` set. This RPC keeps the events exactly
-- as before but additionally returns a flat `labels` map { id -> label } so the
-- client never has to touch the record store to render a row:
--   * actor auth-uuid        -> system user name
--   * subject record id      -> record title
--   * relation-target ids    -> related record titles (found in the diff)
--
-- Keys do not collide (auth uuids vs. record-xxxx ids). Missing ids (deleted
-- records, system/unknown actors) are simply absent from the map; the client
-- keeps its existing fallbacks. Schema-only formatting (field labels, list
-- option colors, dates, numbers, tab add/remove counts) stays on the client —
-- it needs only the entity config, which is not part of the records problem.
--
-- Reuses the `pts_*` helpers introduced by the project-timesheet RPC
-- (20261124150000): pts_name_field, pts_field_def, pts_ids.

create or replace function public.entity_record_events_page(
  p_filter jsonb default '{}'::jsonb,
  p_offset int default 0,
  p_limit int default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with args as (
    select
      nullif(p_filter ->> 'recordId', '') as record_id,
      nullif(p_filter ->> 'entityId', '') as entity_id,
      nullif(p_filter ->> 'actorId', '')  as actor_id,
      -- Local day boundaries (+03:00) — mirrors localDayStartIso() on the client.
      case when nullif(p_filter ->> 'from', '') is not null
        then ((p_filter ->> 'from') || 'T00:00:00+03:00')::timestamptz end as from_ts,
      case when nullif(p_filter ->> 'to', '') is not null
        then (((p_filter ->> 'to')::date + 1)::text || 'T00:00:00+03:00')::timestamptz end as to_ts
  ),
  -- One extra row to detect hasMore, newest first (matches the old select).
  page as (
    select e.id, e.entity_id, e.record_id, e.action, e.changes, e.actor_id, e.created_at
    from public.entity_record_events e, args a
    where (a.record_id is null or e.record_id = a.record_id)
      and (a.entity_id is null or e.entity_id = a.entity_id)
      and (a.actor_id is null or e.actor_id::text = a.actor_id)
      and (a.from_ts is null or e.created_at >= a.from_ts)
      and (a.to_ts is null or e.created_at < a.to_ts)
    order by e.created_at desc, e.id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit coalesce(p_limit, 50) + 1
  ),
  limited as (
    select * from page order by created_at desc, id desc limit coalesce(p_limit, 50)
  ),
  -- Relation / belonging target ids referenced by the visible diffs. Other
  -- field types render from config only; relationGroups (structured JSON) is a
  -- documented residual and intentionally not extracted here.
  rel_ids as (
    select distinct rid
    from limited l
    cross join lateral jsonb_each(
      case when jsonb_typeof(l.changes) = 'object' then l.changes else '{}'::jsonb end
    ) as ch(key, value)
    cross join lateral (select public.pts_field_def(l.entity_id, ch.key) as f) fd
    cross join lateral unnest(
      public.pts_ids(ch.value ->> 'old') || public.pts_ids(ch.value ->> 'new')
    ) as rid
    where fd.f is not null and (fd.f ->> 'type') in ('relation', 'belonging')
  ),
  record_ids as (
    select record_id as rid from limited
    union
    select rid from rel_ids
  ),
  -- Titles for every referenced record (subject + relation targets), keyed by
  -- the globally-unique record id. Found-but-empty resolves to «Без названия»
  -- so the client can treat "present in map" as "record exists".
  record_labels as (
    select er.id as key,
           coalesce(nullif(btrim(er.field_values ->> public.pts_name_field(er.entity_id)), ''),
                    'Без названия') as label
    from public.entity_records er
    where er.id in (select rid from record_ids)
  ),
  -- Actor names, keyed by auth uuid. Unknown / nameless actors are omitted;
  -- the client falls back to «Пользователь» / «Система».
  actor_labels as (
    select er.auth_user_id::text as key,
           nullif(btrim(er.field_values ->> 'field-system-users-name'), '') as label
    from public.entity_records er
    where er.entity_id = 'entity-system-users'
      and er.auth_user_id is not null
      and er.auth_user_id::text in (select actor_id::text from limited where actor_id is not null)
  ),
  labels as (
    select key, label from record_labels
    union all
    select key, label from actor_labels where label is not null
  )
  select jsonb_build_object(
    'events', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'id', id,
           'entity_id', entity_id,
           'record_id', record_id,
           'action', action,
           'changes', changes,
           'actor_id', actor_id,
           'created_at', created_at
         ) order by created_at desc, id desc)
       from limited), '[]'::jsonb),
    'hasMore', (select count(*) from page) > coalesce(p_limit, 50),
    'labels', coalesce((select jsonb_object_agg(key, label) from labels), '{}'::jsonb)
  );
$$;

-- Matches the `entity_record_events` select policy (authenticated-only); the
-- function is security definer only to resolve labels, not to widen audience.
grant execute on function public.entity_record_events_page(jsonb, int, int)
  to authenticated, service_role;
