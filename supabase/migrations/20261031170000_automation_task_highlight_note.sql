-- Snapshot note shown on tasks spawned after a return-to-previous-stage
-- (e.g. reason text from a marked ask field).
alter table public.automation_tasks
  add column if not exists highlight_note jsonb;

comment on column public.automation_tasks.highlight_note is
  'Optional UI highlight for the task page, e.g. {kind:"return_reason",title,text,fieldLabel,sourceTaskId}';
