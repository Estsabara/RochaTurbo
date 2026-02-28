-- Rocha Turbo V2: conversational flow state for WhatsApp onboarding and module wizards

create table if not exists public.chat_flows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  flow_type text not null check (flow_type in ('onboarding', 'module')),
  status text not null default 'active' check (status in ('active', 'completed', 'canceled')),
  month_ref date check (month_ref = date_trunc('month', month_ref)::date),
  step_key text not null,
  answers_json jsonb not null default '{}'::jsonb,
  context_json jsonb not null default '{}'::jsonb,
  last_wa_message_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists chat_flows_user_active_uidx
  on public.chat_flows(user_id)
  where status = 'active';

create index if not exists chat_flows_user_created_idx on public.chat_flows(user_id, created_at desc);
create index if not exists chat_flows_status_created_idx on public.chat_flows(status, created_at desc);

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    if not exists (
      select 1 from pg_trigger where tgname = 'chat_flows_updated_at_tg'
    ) then
      create trigger chat_flows_updated_at_tg
      before update on public.chat_flows
      for each row execute function public.tg_set_updated_at();
    end if;
  end if;
end
$$;

alter table public.chat_flows enable row level security;

drop policy if exists admin_all_chat_flows on public.chat_flows;
create policy admin_all_chat_flows on public.chat_flows
for all using (public.is_admin()) with check (public.is_admin());
