-- Payment calendar: manual link "incoming DDS operation -> planned payment".
--
-- Planned payments are not stored: they are derived from contract stages
-- (entity_records) on the client. What is stored here is the user's explicit
-- choice - which part of an incoming DDS operation covers which planned payment
-- (an "advance" or "postpay" part of a stage). A linked amount turns the plan
-- into fact; operations without links keep being matched automatically.
--
-- * Rows are tied to entity_records with ON DELETE CASCADE: deleting a DDS
--   operation or a stage drops its links, the plan is recalculated.
-- * Writes go through replace_payment_allocations() only (security definer):
--   it validates amounts and the total against the operation amount.
-- * Every change is logged to payment_allocation_events by a trigger, so the
--   history survives deletes (including cascades).

create table if not exists public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  dds_record_id text not null references public.entity_records (id) on delete cascade,
  stage_id    text not null references public.entity_records (id) on delete cascade,
  part_kind   text not null check (part_kind in ('advance', 'postpay')),
  amount      numeric(18, 2) not null check (amount > 0),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint payment_allocations_part_uniq unique (dds_record_id, stage_id, part_kind)
);

create index if not exists payment_allocations_stage_idx
  on public.payment_allocations (stage_id);

create table if not exists public.payment_allocation_events (
  id            bigint generated always as identity primary key,
  dds_record_id text not null,
  stage_id      text not null,
  part_kind     text not null,
  action        text not null check (action in ('create', 'update', 'delete')),
  old_amount    numeric(18, 2),
  new_amount    numeric(18, 2),
  actor_id      uuid default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists payment_allocation_events_dds_idx
  on public.payment_allocation_events (dds_record_id, created_at desc);

create or replace function public.log_payment_allocation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.payment_allocation_events
      (dds_record_id, stage_id, part_kind, action, new_amount)
    values (new.dds_record_id, new.stage_id, new.part_kind, 'create', new.amount);
    return new;
  elsif tg_op = 'UPDATE' then
    if old.amount is distinct from new.amount then
      insert into public.payment_allocation_events
        (dds_record_id, stage_id, part_kind, action, old_amount, new_amount)
      values (new.dds_record_id, new.stage_id, new.part_kind, 'update', old.amount, new.amount);
    end if;
    return new;
  end if;
  insert into public.payment_allocation_events
    (dds_record_id, stage_id, part_kind, action, old_amount)
  values (old.dds_record_id, old.stage_id, old.part_kind, 'delete', old.amount);
  return old;
end;
$$;

drop trigger if exists trg_payment_allocations_log on public.payment_allocations;
create trigger trg_payment_allocations_log
  after insert or update or delete on public.payment_allocations
  for each row execute function public.log_payment_allocation_event();

-- Replace the whole set of links of one DDS operation.
-- p_allocations: [{ "stageId": text, "partKind": "advance"|"postpay", "amount": number }]
-- p_operation_amount: amount of the DDS operation (the client reads it from the
-- operation's amount field - field ids are per install). When given, the links
-- must not exceed it.
create or replace function public.replace_payment_allocations(
  p_dds_record_id text,
  p_operation_amount numeric,
  p_allocations jsonb
)
returns setof public.payment_allocations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_count int;
  v_distinct int;
  v_invalid int;
begin
  if p_dds_record_id is null
     or not exists (select 1 from public.entity_records where id = p_dds_record_id) then
    raise exception 'DDS operation not found';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Allocations must be an array';
  end if;

  select count(*),
         count(distinct (i."stageId", i."partKind")),
         count(*) filter (
           where i."stageId" is null
              or i."partKind" not in ('advance', 'postpay')
              or i.amount is null
              or i.amount <= 0),
         coalesce(sum(i.amount), 0)
    into v_count, v_distinct, v_invalid, v_total
  from jsonb_to_recordset(p_allocations)
       as i("stageId" text, "partKind" text, amount numeric);

  if v_invalid > 0 then
    raise exception 'Each allocation needs a stage, a part (advance/postpay) and a positive amount';
  end if;
  if v_distinct <> v_count then
    raise exception 'The same planned payment is linked twice';
  end if;
  if p_operation_amount is not null and v_total > round(p_operation_amount, 2) then
    raise exception 'Allocated amount % exceeds the operation amount %',
      v_total, round(p_operation_amount, 2);
  end if;

  delete from public.payment_allocations pa
  where pa.dds_record_id = p_dds_record_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_allocations)
           as i("stageId" text, "partKind" text, amount numeric)
      where i."stageId" = pa.stage_id and i."partKind" = pa.part_kind);

  insert into public.payment_allocations (dds_record_id, stage_id, part_kind, amount)
  select p_dds_record_id, i."stageId", i."partKind", round(i.amount, 2)
  from jsonb_to_recordset(p_allocations)
       as i("stageId" text, "partKind" text, amount numeric)
  on conflict (dds_record_id, stage_id, part_kind) do update
    set amount = excluded.amount, updated_at = now()
    where public.payment_allocations.amount is distinct from excluded.amount;

  return query
    select * from public.payment_allocations pa
    where pa.dds_record_id = p_dds_record_id;
end;
$$;

alter table public.payment_allocations enable row level security;
alter table public.payment_allocation_events enable row level security;

drop policy if exists "payment_allocations_select" on public.payment_allocations;
create policy "payment_allocations_select"
  on public.payment_allocations for select to authenticated using (true);

drop policy if exists "payment_allocation_events_select" on public.payment_allocation_events;
create policy "payment_allocation_events_select"
  on public.payment_allocation_events for select to authenticated using (true);

grant select on public.payment_allocations to authenticated, service_role;
grant select on public.payment_allocation_events to authenticated, service_role;
grant execute on function public.replace_payment_allocations(text, numeric, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
