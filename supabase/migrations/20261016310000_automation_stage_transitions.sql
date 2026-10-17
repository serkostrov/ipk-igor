-- Conditional stage→stage gateways on the process map (edge between columns).

alter table public.automation_scenarios
  add column if not exists stage_transitions jsonb not null default '[]'::jsonb;

comment on column public.automation_scenarios.stage_transitions is
  'Array of { id, fromOptionId, toOptionId, conditions, elseOptionId } for map edges.';
