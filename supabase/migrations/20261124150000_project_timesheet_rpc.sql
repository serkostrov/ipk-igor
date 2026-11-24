-- Project timesheet: server-side data formation (hybrid RPC).
--
-- The timesheet is a read-only report. Instead of loading every entity record
-- into the browser store, this RPC prepares the rows on the backend: it filters
-- time sessions that OVERLAP the month, resolves joins (session → employee →
-- department, session → host → project/task/stage) via the generic
-- entity_records JSONB model, applies each host entity's data-scope
-- (all / own / department / filter), the viewer's legal-entity restriction and
-- department/project filters, and marks completed hosts (acceptedAt). The client
-- reuses the pure aggregation core (aggregate.ts) for the final payload.
--
-- Field ids are per-install. They are stored server-side in `timesheet_settings`
-- (admin-managed) and read by the function — the client passes only { userId } +
-- month, never the schema. The function stays generic over any install's schema.
--
-- The viewer's role and per-entity data-scope are resolved here from the stored
-- roles config (app_documents key 'roles'); the client never sends scope/legal.
-- Security is still intentionally permissive for now (no RLS enforcement): the
-- viewer id is applied as a filter, not a hard trust boundary.

-- Server-side config store for the timesheet (singleton). Admin-managed.
-- Created first: the sql functions below reference it and are validated at
-- creation time (unlike plpgsql, which binds table names lazily).
create table if not exists public.timesheet_settings (
  id          text primary key default 'default',
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint timesheet_settings_singleton check (id = 'default')
);

-- Seed the singleton row once. Re-running this migration never clobbers a
-- config an admin has since edited (do nothing).
insert into public.timesheet_settings (id, config)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

grant select, insert, update on public.timesheet_settings to anon, authenticated, service_role;

-- First relation id out of a stored relation value ("record-x", '["record-x"]'
-- or "a,b" → "record-x"). Mirrors parseEntityRelationIds on the client.
create or replace function public.pts_first_id(p_value text)
returns text
language sql
immutable
as $$
  select nullif(btrim(split_part(translate(coalesce(p_value, ''), '[]"', ''), ',', 1)), '');
$$;

-- All relation/list ids out of a stored value.
create or replace function public.pts_ids(p_value text)
returns text[]
language sql
immutable
as $$
  select coalesce(array(
    select btrim(x)
    from unnest(string_to_array(translate(coalesce(p_value, ''), '[]"', ''), ',')) as x
    where btrim(x) <> ''
  ), array[]::text[]);
$$;

create or replace function public.pts_jsonb_text_array(p_arr jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array(
    select value from jsonb_array_elements_text(coalesce(p_arr, '[]'::jsonb))
  ), array[]::text[]);
$$;

-- acceptedAt: the host's due date when its status reached a final option.
create or replace function public.pts_accepted_at(
  p_values jsonb, p_status_field text, p_final_options jsonb, p_due_field text
)
returns text
language sql
immutable
as $$
  select case
    when p_status_field is null or p_due_field is null
      or coalesce(jsonb_array_length(p_final_options), 0) = 0 then null
    when public.pts_ids(p_values ->> p_status_field)
      && public.pts_jsonb_text_array(p_final_options)
      then nullif(p_values ->> p_due_field, '')
    else null
  end;
$$;

-- Same, but over already-RESOLVED status / due values (used with field paths).
create or replace function public.pts_accepted_at_v(
  p_status_val text, p_final_options jsonb, p_due_val text
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(jsonb_array_length(p_final_options), 0) = 0
      or p_due_val is null then null
    when public.pts_ids(p_status_val) && public.pts_jsonb_text_array(p_final_options)
      then nullif(p_due_val, '')
    else null
  end;
$$;

-- One field's definition object out of the entity's stored `definition.fields`.
create or replace function public.pts_field_def(p_entity text, p_field text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select f
  from public.entities e,
    lateral jsonb_array_elements(
      case when jsonb_typeof(e.definition -> 'fields') = 'array'
        then e.definition -> 'fields' else '[]'::jsonb end) f
  where e.id = p_entity and f ->> 'id' = p_field
  limit 1;
$$;

-- The title (name) field id of an entity — the single `locked` system field
-- (mirrors isEntityNameField on the client).
create or replace function public.pts_name_field(p_entity text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f ->> 'id'
  from public.entities e,
    lateral jsonb_array_elements(
      case when jsonb_typeof(e.definition -> 'fields') = 'array'
        then e.definition -> 'fields' else '[]'::jsonb end) f
  where e.id = p_entity and (f ->> 'locked') = 'true'
  order by ((f ->> 'systemKey') = 'name') desc nulls last
  limit 1;
$$;

-- Resolve a typed field PATH to the raw stored leaf value, following each
-- non-leaf hop as a relation (its stored id → the related record). Path of one
-- element = a plain field read. Returns null if any hop is missing/not a
-- relation. `p_entity` is the entity `p_values` belongs to.
create or replace function public.pts_resolve_leaf(
  p_entity text, p_values jsonb, p_path jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_len int;
  v_entity text := p_entity;
  v_cur jsonb := p_values;
  v_fid text;
  v_target text;
  v_next text;
begin
  if p_path is null or jsonb_typeof(p_path) <> 'array' then return null; end if;
  v_len := jsonb_array_length(p_path);
  if v_len = 0 or v_cur is null then return null; end if;
  for i in 0 .. v_len - 2 loop
    v_fid := p_path ->> i;
    v_target := public.pts_field_def(v_entity, v_fid) ->> 'relationEntityId';
    if v_target is null then return null; end if;
    v_next := public.pts_first_id(v_cur ->> v_fid);
    if v_next is null then return null; end if;
    select er.field_values into v_cur
      from public.entity_records er
      where er.entity_id = v_target and er.id = v_next
      limit 1;
    if v_cur is null then return null; end if;
    v_entity := v_target;
  end loop;
  return v_cur ->> (p_path ->> (v_len - 1));
end;
$$;

-- Resolve a field PATH to a human DISPLAY string (used for free columns):
-- scalar → raw value; relation → the related record title(s); list → option
-- name(s). Non-leaf hops follow relations as in pts_resolve_leaf.
create or replace function public.pts_resolve_display(
  p_entity text, p_values jsonb, p_path jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_len int;
  v_entity text := p_entity;
  v_cur jsonb := p_values;
  v_fid text;
  v_fdef jsonb;
  v_type text;
  v_target text;
  v_next text;
  v_raw text;
  v_name_field text;
  v_names text[];
  v_id text;
begin
  if p_path is null or jsonb_typeof(p_path) <> 'array' then return null; end if;
  v_len := jsonb_array_length(p_path);
  if v_len = 0 or v_cur is null then return null; end if;
  for i in 0 .. v_len - 2 loop
    v_fid := p_path ->> i;
    v_target := public.pts_field_def(v_entity, v_fid) ->> 'relationEntityId';
    if v_target is null then return null; end if;
    v_next := public.pts_first_id(v_cur ->> v_fid);
    if v_next is null then return null; end if;
    select er.field_values into v_cur
      from public.entity_records er
      where er.entity_id = v_target and er.id = v_next
      limit 1;
    if v_cur is null then return null; end if;
    v_entity := v_target;
  end loop;
  v_fid := p_path ->> (v_len - 1);
  v_fdef := public.pts_field_def(v_entity, v_fid);
  v_type := v_fdef ->> 'type';
  v_raw := v_cur ->> v_fid;
  if v_raw is null or btrim(v_raw) = '' then return null; end if;
  if v_type in ('relation', 'belonging') then
    v_target := v_fdef ->> 'relationEntityId';
    v_name_field := public.pts_name_field(v_target);
    v_names := array[]::text[];
    foreach v_id in array public.pts_ids(v_raw) loop
      v_names := v_names || coalesce((
        select nullif(btrim(er.field_values ->> v_name_field), '')
        from public.entity_records er
        where er.entity_id = v_target and er.id = v_id
        limit 1), v_id);
    end loop;
    return nullif(array_to_string(v_names, ', '), '');
  elsif v_type = 'list' then
    return (
      select string_agg(coalesce(o.name, oid.id), ', ' order by oid.ord)
      from unnest(public.pts_ids(v_raw)) with ordinality as oid(id, ord)
      left join lateral (
        select opt ->> 'name' as name
        from jsonb_array_elements(
          case when jsonb_typeof(v_fdef -> 'listOptions') = 'array'
            then v_fdef -> 'listOptions' else '[]'::jsonb end) opt
        where opt ->> 'id' = oid.id
        limit 1
      ) o on true
    );
  else
    return v_raw;
  end if;
end;
$$;

-- Build the `cells` object for one row from THIS source's named outputs: for
-- every output, resolve its ref to a display string and key the result by the
-- output `name`. Each ref picks its starting record via `root` — the row's
-- source record (`host`, default), its time entry (`session`) or the employee —
-- then drills via relations. A null entity/values (e.g. a session-rooted output
-- on a planned seed, which has no entry) resolves to null. Keying by name lets
-- one `{{name}}` column unify across sources that each map their own chain.
drop function if exists public.pts_row_cells(jsonb, text, jsonb);
create or replace function public.pts_row_cells(
  p_outputs jsonb,
  p_host text,  p_host_values jsonb,
  p_entry text, p_entry_values jsonb,
  p_emp text,   p_emp_values jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb)
  from (
    select (o ->> 'name') as k,
           public.pts_resolve_display(
             case o -> 'ref' ->> 'root'
               when 'session' then p_entry
               when 'employee' then p_emp
               else p_host end,
             case o -> 'ref' ->> 'root'
               when 'session' then p_entry_values
               when 'employee' then p_emp_values
               else p_host_values end,
             o -> 'ref' -> 'path') as v
    from jsonb_array_elements(
      case when jsonb_typeof(p_outputs) = 'array' then p_outputs else '[]'::jsonb end) o
    where nullif(btrim(coalesce(o ->> 'name', '')), '') is not null
  ) x;
$$;

-- Evaluate a role's scope-filter conditions against a host record. All rules
-- must pass. Covers the common operators; unsupported ones pass through
-- (permissive — security is off for now).
create or replace function public.pts_eval_conditions(
  p_conditions jsonb, p_values jsonb, p_viewer_values jsonb, p_viewer_user text
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_cond jsonb;
  v_op text;
  v_val text;
  v_ok boolean;
begin
  if p_conditions is null or jsonb_typeof(p_conditions) <> 'array' then
    return true;
  end if;
  for v_cond in select value from jsonb_array_elements(p_conditions) loop
    v_val := coalesce(p_values ->> (v_cond ->> 'fieldId'), '');
    v_op := v_cond ->> 'operator';
    v_ok := case v_op
      when 'empty' then btrim(v_val) = ''
      when 'notEmpty' then btrim(v_val) <> ''
      when 'in' then public.pts_ids(v_val) && public.pts_jsonb_text_array(v_cond -> 'values')
      when 'notIn' then not (public.pts_ids(v_val) && public.pts_jsonb_text_array(v_cond -> 'values'))
      when 'isCurrentUser' then p_viewer_user is not null and p_viewer_user = any(public.pts_ids(v_val))
      when 'equalsCurrentUserField' then
        public.pts_first_id(v_val) is not distinct from
        public.pts_first_id(coalesce(p_viewer_values ->> (v_cond ->> 'value'), ''))
      when 'notEqualsCurrentUserField' then
        public.pts_first_id(v_val) is distinct from
        public.pts_first_id(coalesce(p_viewer_values ->> (v_cond ->> 'value'), ''))
      when 'true' then v_val = 'true'
      when 'false' then v_val <> 'true'
      when 'contains' then position(lower(coalesce(v_cond ->> 'value', '')) in lower(v_val)) > 0
      else true
    end;
    if not v_ok then return false; end if;
  end loop;
  return true;
end;
$$;

-- Per-source visibility for one entry/seed.
create or replace function public.pts_source_allow(
  p_scope text, p_filter jsonb,
  p_viewer_user text, p_viewer_dept text, p_viewer_values jsonb,
  p_employee text, p_employee_dept text, p_host_values jsonb
)
returns boolean
language sql
immutable
as $$
  select case p_scope
    when 'all' then true
    when 'department' then
      p_employee = p_viewer_user
      or (p_employee_dept is not null and p_employee_dept = p_viewer_dept)
    when 'filter' then
      public.pts_eval_conditions(p_filter, p_host_values, p_viewer_values, p_viewer_user)
    else p_employee = p_viewer_user  -- 'own'
  end;
$$;

create or replace function public.project_timesheet_slices(
  p_month text,
  p_viewer jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Config lives server-side (admin-managed in timesheet_settings), not sent by
  -- the client. The client passes only { userId } + month.
  v_config jsonb := coalesce(
    (select ts.config from public.timesheet_settings ts where ts.id = 'default'),
    '{}'::jsonb);
  v_shared jsonb := coalesce(v_config -> 'shared', '{}'::jsonb);
  v_sources jsonb := coalesce(v_config -> 'sources', '[]'::jsonb);
  v_has_source boolean := jsonb_typeof(v_sources) = 'array'
    and jsonb_array_length(v_sources) > 0;
  v_viewer_user text := nullif(p_viewer ->> 'userId', '');

  -- Viewer role + per-entity data-scope resolved server-side from the stored
  -- roles config (app_documents key 'roles'), so the client never sends scope
  -- or legal ids — no trust-me payload, nothing to tamper with.
  v_roles jsonb := coalesce(
    (select ad.value from public.app_documents ad where ad.key = 'roles'),
    '{}'::jsonb);
  v_role_id text;
  v_perms jsonb;
  v_is_all_role boolean;
  v_legal_ids text[] := array[]::text[];
  v_access_scope text := 'personal';
  v_first_source boolean := true;

  v_users_entity text := coalesce(v_shared ->> 'usersEntityId', 'entity-system-users');
  v_users_name text := v_shared ->> 'userNameField';
  v_users_dept text := v_shared ->> 'userDeptField';
  v_users_legal text := v_shared ->> 'userLegalField';
  v_dept_entity text := v_shared ->> 'deptEntityId';
  v_dept_name text := v_shared ->> 'deptNameField';
  v_project_entity text := v_shared ->> 'projectEntityId';
  v_project_name text := v_shared ->> 'projectNameField';
  v_task_entity text := v_shared ->> 'taskEntityId';
  v_task_name text := v_shared ->> 'taskNameField';
  v_stage_entity text := v_shared ->> 'stageEntityId';
  v_stage_name text := v_shared ->> 'stageNameField';

  -- Month window as naive-Moscow ISO text (stored datetimes are naive Moscow,
  -- so lexicographic comparison on ISO strings = Moscow instant comparison).
  v_month_start text := p_month || '-01T00:00:00';
  v_month_end text := to_char(
    (p_month || '-01')::date + interval '1 month', 'YYYY-MM-DD') || 'T00:00:00';

  v_viewer_values jsonb;
  v_viewer_dept text;
  v_sessions jsonb := '[]'::jsonb;
  v_seeds jsonb := '[]'::jsonb;
  v_src jsonb;
begin
  if v_viewer_user is not null then
    select er.field_values into v_viewer_values
    from public.entity_records er
    where er.entity_id = v_users_entity and er.id = v_viewer_user
    limit 1;
    v_viewer_dept := public.pts_first_id(v_viewer_values ->> v_users_dept);
    v_role_id := nullif(
      public.pts_first_id(v_viewer_values ->> 'field-system-users-role'), '');
  end if;
  -- Empty role → least-privilege employee (mirrors resolveCurrentRole()).
  if v_role_id is null then v_role_id := 'role-system-employee'; end if;

  v_perms := public.pts_role_permissions(v_roles, v_role_id);
  -- Admin, an unknown role id, or an "all entities" role sees everything
  -- (mirrors isAdminRole()/entityScope() on the client).
  v_is_all_role := v_role_id = 'role-system-admin'
    or v_perms is null
    or (v_perms -> 'entities') = '"*"'::jsonb;
  if not v_is_all_role then
    v_legal_ids := public.pts_jsonb_text_array(v_perms -> 'legalEntityIds');
  end if;

  if not v_has_source then
    return jsonb_build_object(
      'sessions', '[]'::jsonb, 'seeds', '[]'::jsonb,
      'meta', jsonb_build_object('hasSource', false, 'accessScope', 'personal'));
  end if;

  for v_src in select value from jsonb_array_elements(v_sources) loop
    declare
      v_source text := v_src ->> 'source';
      v_entry text := v_src ->> 'entryEntityId';
      v_host text := v_src ->> 'hostEntityId';
      -- Per-source data-scope for this viewer's role against THIS host entity.
      v_access jsonb := case
        when v_is_all_role then jsonb_build_object('scope', 'all', 'filter', null)
        else public.pts_host_scope(v_perms, v_src ->> 'hostEntityId') end;
      v_scope text := coalesce(v_access ->> 'scope', 'own');
      v_filter jsonb := v_access -> 'filter';
      -- Field slots are stored as typed refs `{path:[fieldId,...]}`. Phase 1 is
      -- single-hop, so the field id is the first (and only) path element.
      -- `timerOption` is an option id, not a field ref — read it flat.
      v_fs text := v_src #>> '{fields,start,path,0}';
      v_fe text := v_src #>> '{fields,end,path,0}';
      v_fh text := v_src #>> '{fields,hours,path,0}';
      v_femp text := v_src #>> '{fields,employee,path,0}';
      v_flink text := v_src #>> '{fields,link,path,0}';
      -- `method` may traverse relation hops, so keep the full path and resolve
      -- it per session record (like the host slots).
      v_fmethod_p jsonb := v_src #> '{fields,method,path}';
      v_ftimer text := v_src #>> '{fields,timerOption}';
      v_fcomment text := v_src #>> '{fields,comment,path,0}';
      -- Host slots are typed refs that may traverse relation hops, so we keep
      -- the full path and resolve it per host record (see the `hv` laterals).
      v_hname_p jsonb := v_src #> '{host,name,path}';
      v_hproject_p jsonb := v_src #> '{host,project,path}';
      v_hparent_p jsonb := v_src #> '{host,parentTask,path}';
      v_hplanned_p jsonb := v_src #> '{host,planned,path}';
      v_hstart_p jsonb := v_src #> '{host,startDate,path}';
      v_hdue_p jsonb := v_src #> '{host,due,path}';
      v_hstatus_p jsonb := v_src #> '{host,status,path}';
      v_hfinal jsonb := v_src #> '{host,finalStatusOptions}';
      v_hstage_p jsonb := v_src #> '{host,stage,path}';
      v_hassignee_p jsonb := v_src #> '{host,assignee,path}';
      -- This source's named outputs feed the `{{name}}` display columns.
      v_outputs jsonb := coalesce(v_src -> 'outputs', '[]'::jsonb);
    begin
      -- Payload-level access label = scope of the first (primary) source.
      if v_first_source then
        v_access_scope := case v_scope
          when 'all' then 'global'
          when 'department' then 'department'
          when 'filter' then 'project_access'
          else 'personal' end;
        v_first_source := false;
      end if;

      -- Fact entries: sessions overlapping the month, joined to host/employee/
      -- department/project/task/stage. Host is required (orphans dropped).
      v_sessions := v_sessions || coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'source', v_source,
            'sessionId', er.id,
            'entryKind', case
              when v_ftimer is not null
                and v_ftimer = any(public.pts_ids(
                  public.pts_resolve_leaf(v_entry, er.field_values, v_fmethod_p)))
                then 'timer'
              else 'manual' end,
            'employeeId', ids.emp_id,
            'employeeName', coalesce(nullif(btrim(coalesce(usr.field_values ->> v_users_name, '')), ''), ''),
            'departmentId', dd.dept_id,
            'departmentName', nullif(btrim(coalesce(dept.field_values ->> v_dept_name, '')), ''),
            'projectId', public.pts_first_id(hv.project_raw),
            'projectTitle', coalesce(nullif(btrim(coalesce(proj.field_values ->> v_project_name, '')), ''), 'Без проекта'),
            'stageId', public.pts_first_id(hv.stage_raw),
            'stageTitle', nullif(btrim(coalesce(stg.field_values ->> v_stage_name, '')), ''),
            'workItemId', public.pts_first_id(hv.parent_raw),
            'workItemTitle', nullif(btrim(coalesce(tsk.field_values ->> v_task_name, '')), ''),
            'taskId', host.id,
            'taskTitle', coalesce(nullif(btrim(coalesce(hv.name_val, '')), ''), '—'),
            'plannedHours', nullif(translate(coalesce(hv.planned_val, ''), ',', '.'), ''),
            'startDate', nullif(hv.start_val, ''),
            'acceptedAt', public.pts_accepted_at_v(hv.status_val, v_hfinal, hv.due_val),
            'cells', public.pts_row_cells(
              v_outputs, v_host, host.field_values,
              v_entry, er.field_values, v_users_entity, usr.field_values),
            'note', nullif(btrim(coalesce(er.field_values ->> v_fcomment, '')), ''),
            'startedAt', nullif(er.field_values ->> v_fs, ''),
            'endedAt', nullif(er.field_values ->> v_fe, ''),
            'hours', nullif(translate(coalesce(er.field_values ->> v_fh, ''), ',', '.'), ''),
            'createdAt', to_char(er.created_at, 'YYYY-MM-DD"T"HH24:MI:SS')
          ))
        from public.entity_records er
        cross join lateral (
          select public.pts_first_id(er.field_values ->> v_femp) as emp_id,
                 public.pts_first_id(er.field_values ->> v_flink) as host_id
        ) ids
        join public.entity_records host
          on host.entity_id = v_host and host.id = ids.host_id
        cross join lateral (
          select
            public.pts_resolve_leaf(v_host, host.field_values, v_hproject_p) as project_raw,
            public.pts_resolve_leaf(v_host, host.field_values, v_hparent_p)  as parent_raw,
            public.pts_resolve_leaf(v_host, host.field_values, v_hstage_p)   as stage_raw,
            public.pts_resolve_leaf(v_host, host.field_values, v_hname_p)    as name_val,
            public.pts_resolve_leaf(v_host, host.field_values, v_hplanned_p) as planned_val,
            public.pts_resolve_leaf(v_host, host.field_values, v_hstart_p)   as start_val,
            public.pts_resolve_leaf(v_host, host.field_values, v_hstatus_p)  as status_val,
            public.pts_resolve_leaf(v_host, host.field_values, v_hdue_p)     as due_val
        ) hv
        left join public.entity_records usr
          on usr.entity_id = v_users_entity and usr.id = ids.emp_id
        cross join lateral (
          select public.pts_first_id(usr.field_values ->> v_users_dept) as dept_id
        ) dd
        left join public.entity_records dept
          on dept.entity_id = v_dept_entity and dept.id = dd.dept_id
        left join public.entity_records proj
          on proj.entity_id = v_project_entity
          and proj.id = public.pts_first_id(hv.project_raw)
        left join public.entity_records tsk
          on tsk.entity_id = v_task_entity
          and tsk.id = public.pts_first_id(hv.parent_raw)
        left join public.entity_records stg
          on stg.entity_id = v_stage_entity
          and stg.id = public.pts_first_id(hv.stage_raw)
        where er.entity_id = v_entry
          and ids.emp_id is not null
          and (
            (nullif(er.field_values ->> v_fs, '') is not null
              and (er.field_values ->> v_fs) < v_month_end
              and (nullif(er.field_values ->> v_fe, '') is null
                   or (er.field_values ->> v_fe) >= v_month_start))
            or (nullif(er.field_values ->> v_fs, '') is null
              and left(to_char(er.created_at, 'YYYY-MM-DD'), 7) = p_month)
          )
          and public.pts_source_allow(v_scope, v_filter,
            v_viewer_user, v_viewer_dept, v_viewer_values,
            ids.emp_id, dd.dept_id, host.field_values)
          and (cardinality(v_legal_ids) = 0 or v_users_legal is null
               or public.pts_first_id(usr.field_values ->> v_users_legal) = any(v_legal_ids))
      ), '[]'::jsonb);

      -- Planned seeds: one row per host record with an assignee. Lifecycle
      -- visibility is applied on the client (reused aggregate helper).
      if v_hassignee_p is not null and jsonb_typeof(v_hassignee_p) = 'array'
         and jsonb_array_length(v_hassignee_p) > 0 then
        v_seeds := v_seeds || coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'source', v_source,
              'employeeId', a.asg_id,
              'employeeName', coalesce(nullif(btrim(coalesce(usr.field_values ->> v_users_name, '')), ''), ''),
              'departmentId', dd.dept_id,
              'departmentName', nullif(btrim(coalesce(dept.field_values ->> v_dept_name, '')), ''),
              'projectId', public.pts_first_id(hv.project_raw),
              'projectTitle', coalesce(nullif(btrim(coalesce(proj.field_values ->> v_project_name, '')), ''), 'Без проекта'),
              'stageId', public.pts_first_id(hv.stage_raw),
              'stageTitle', nullif(btrim(coalesce(stg.field_values ->> v_stage_name, '')), ''),
              'workItemId', public.pts_first_id(hv.parent_raw),
              'workItemTitle', nullif(btrim(coalesce(tsk.field_values ->> v_task_name, '')), ''),
              'taskId', er.id,
              'taskTitle', coalesce(nullif(btrim(coalesce(hv.name_val, '')), ''), '—'),
              'plannedHours', nullif(translate(coalesce(hv.planned_val, ''), ',', '.'), ''),
              'startDate', nullif(hv.start_val, ''),
              'acceptedAt', public.pts_accepted_at_v(hv.status_val, v_hfinal, hv.due_val),
              'cells', public.pts_row_cells(
                v_outputs, v_host, er.field_values,
                null, null, v_users_entity, usr.field_values)
            ))
          from public.entity_records er
          cross join lateral (
            select
              public.pts_resolve_leaf(v_host, er.field_values, v_hassignee_p) as asg_raw,
              public.pts_resolve_leaf(v_host, er.field_values, v_hproject_p)  as project_raw,
              public.pts_resolve_leaf(v_host, er.field_values, v_hparent_p)   as parent_raw,
              public.pts_resolve_leaf(v_host, er.field_values, v_hstage_p)    as stage_raw,
              public.pts_resolve_leaf(v_host, er.field_values, v_hname_p)     as name_val,
              public.pts_resolve_leaf(v_host, er.field_values, v_hplanned_p)  as planned_val,
              public.pts_resolve_leaf(v_host, er.field_values, v_hstart_p)    as start_val,
              public.pts_resolve_leaf(v_host, er.field_values, v_hstatus_p)   as status_val,
              public.pts_resolve_leaf(v_host, er.field_values, v_hdue_p)      as due_val
          ) hv
          cross join lateral (
            select public.pts_first_id(hv.asg_raw) as asg_id
          ) a
          left join public.entity_records usr
            on usr.entity_id = v_users_entity and usr.id = a.asg_id
          cross join lateral (
            select public.pts_first_id(usr.field_values ->> v_users_dept) as dept_id
          ) dd
          left join public.entity_records dept
            on dept.entity_id = v_dept_entity and dept.id = dd.dept_id
          left join public.entity_records proj
            on proj.entity_id = v_project_entity
            and proj.id = public.pts_first_id(hv.project_raw)
          left join public.entity_records tsk
            on tsk.entity_id = v_task_entity
            and tsk.id = public.pts_first_id(hv.parent_raw)
          left join public.entity_records stg
            on stg.entity_id = v_stage_entity
            and stg.id = public.pts_first_id(hv.stage_raw)
          where er.entity_id = v_host
            and a.asg_id is not null
            and public.pts_source_allow(v_scope, v_filter,
              v_viewer_user, v_viewer_dept, v_viewer_values,
              a.asg_id, dd.dept_id, er.field_values)
            and (cardinality(v_legal_ids) = 0 or v_users_legal is null
                 or public.pts_first_id(usr.field_values ->> v_users_legal) = any(v_legal_ids))
        ), '[]'::jsonb);
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'sessions', v_sessions,
    'seeds', v_seeds,
    'meta', jsonb_build_object(
      'hasSource', v_has_source,
      'accessScope', v_access_scope,
      -- Echo the admin-defined display columns so the client renders them.
      'columns', coalesce(
        (select ts.config -> 'columns' from public.timesheet_settings ts where ts.id = 'default'),
        '[]'::jsonb)));
end;
$$;

-- Permissions object for a role id out of the roles config (null when absent).
create or replace function public.pts_role_permissions(p_roles jsonb, p_role_id text)
returns jsonb
language sql
stable
as $$
  select r -> 'permissions'
  from jsonb_array_elements(
    case when jsonb_typeof(p_roles -> 'roles') = 'array'
      then p_roles -> 'roles' else '[]'::jsonb end) r
  where r ->> 'id' = p_role_id
  limit 1;
$$;

-- {scope, filter} for one host entity under a (non-admin) role's permissions.
-- Missing entry → 'own'. Mirrors entityScope()/entityScopeFilter() client-side.
create or replace function public.pts_host_scope(p_perms jsonb, p_host text)
returns jsonb
language sql
stable
as $$
  select coalesce((
    select jsonb_build_object(
      'scope', coalesce(e ->> 'scope', 'own'),
      'filter', case when (e ->> 'scope') = 'filter'
        then coalesce(e -> 'scopeFilter', '[]'::jsonb) else null end)
    from jsonb_array_elements(
      case when jsonb_typeof(p_perms -> 'entities') = 'array'
        then p_perms -> 'entities' else '[]'::jsonb end) e
    where e ->> 'entityId' = p_host
    limit 1
  ), jsonb_build_object('scope', 'own', 'filter', null));
$$;

-- Admin health check: config refs (entities) that no longer exist in `entities`.
-- Returns [] when the config is clean. Field/record deletions degrade gracefully
-- in the RPC (null joins), so only entity-level breakage is reported here.
create or replace function public.timesheet_settings_validate()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce(
      (select config from public.timesheet_settings where id = 'default'),
      '{}'::jsonb) as config
  ),
  ent as (
    select coalesce(array_agg(e.id), array[]::text[]) as ids from public.entities e
  ),
  refs as (
    select 'shared.usersEntityId' as path, (config -> 'shared') ->> 'usersEntityId' as ref from cfg
    union all select 'shared.deptEntityId', (config -> 'shared') ->> 'deptEntityId' from cfg
    union all select 'shared.projectEntityId', (config -> 'shared') ->> 'projectEntityId' from cfg
    union all select 'shared.taskEntityId', (config -> 'shared') ->> 'taskEntityId' from cfg
    union all select 'shared.stageEntityId', (config -> 'shared') ->> 'stageEntityId' from cfg
    union all
    select 'sources[' || (t.idx - 1) || '].hostEntityId', t.src ->> 'hostEntityId'
    from cfg, jsonb_array_elements(
      case when jsonb_typeof(config -> 'sources') = 'array'
        then config -> 'sources' else '[]'::jsonb end) with ordinality as t(src, idx)
    union all
    select 'sources[' || (t.idx - 1) || '].entryEntityId', t.src ->> 'entryEntityId'
    from cfg, jsonb_array_elements(
      case when jsonb_typeof(config -> 'sources') = 'array'
        then config -> 'sources' else '[]'::jsonb end) with ordinality as t(src, idx)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('path', r.path, 'ref', r.ref, 'kind', 'entity')
    order by r.path), '[]'::jsonb)
  from refs r, ent
  where r.ref is not null and r.ref <> '' and not (r.ref = any(ent.ids));
$$;

drop function if exists public.project_timesheet_slices(jsonb, text, jsonb, jsonb);
grant execute on function public.project_timesheet_slices(text, jsonb) to anon, authenticated, service_role;
grant execute on function public.pts_role_permissions(jsonb, text) to anon, authenticated, service_role;
grant execute on function public.pts_host_scope(jsonb, text) to anon, authenticated, service_role;
grant execute on function public.timesheet_settings_validate() to anon, authenticated, service_role;
grant execute on function public.pts_first_id(text) to anon, authenticated, service_role;
grant execute on function public.pts_ids(text) to anon, authenticated, service_role;
grant execute on function public.pts_jsonb_text_array(jsonb) to anon, authenticated, service_role;
grant execute on function public.pts_accepted_at(jsonb, text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.pts_accepted_at_v(text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.pts_field_def(text, text) to anon, authenticated, service_role;
grant execute on function public.pts_name_field(text) to anon, authenticated, service_role;
grant execute on function public.pts_resolve_leaf(text, jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.pts_resolve_display(text, jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.pts_row_cells(jsonb, text, jsonb, text, jsonb, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.pts_eval_conditions(jsonb, jsonb, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.pts_source_allow(text, jsonb, text, text, jsonb, text, text, jsonb) to anon, authenticated, service_role;
