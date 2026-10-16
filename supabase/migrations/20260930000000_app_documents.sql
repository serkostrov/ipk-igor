-- System-wide document store (non-relational JSONB).
create table if not exists public.app_documents (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_documents enable row level security;

create policy "app_documents_select"
  on public.app_documents
  for select
  to anon, authenticated
  using (true);

create policy "app_documents_insert"
  on public.app_documents
  for insert
  to anon, authenticated
  with check (true);

create policy "app_documents_update"
  on public.app_documents
  for update
  to anon, authenticated
  using (true)
  with check (true);

insert into public.app_documents (key, value)
values (
  'menu',
  '{
    "groups": [
      {
        "id": "main",
        "title": "Система",
        "icon": "wrench",
        "items": [
          {
            "id": "settings",
            "label": "Настройки",
            "icon": "settings"
          }
        ]
      }
    ]
  }'::jsonb
)
on conflict (key) do nothing;
