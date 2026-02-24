create table public.message_status_events (
  id bigserial primary key,
  wa_message_id text not null,
  recipient_id text,
  status text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index message_status_events_wa_message_id_idx
  on public.message_status_events(wa_message_id, created_at desc);

alter table public.message_status_events enable row level security;

create policy admin_all_message_status_events on public.message_status_events
for all using (public.is_admin()) with check (public.is_admin());
