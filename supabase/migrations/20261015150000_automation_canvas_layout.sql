-- Persist free-form node positions on the automation flow canvas (per scenario).

alter table public.automation_scenarios
  add column if not exists canvas_layout jsonb not null default '{}'::jsonb;
