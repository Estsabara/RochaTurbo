-- Rocha Turbo foundational schema (user-first model)
create extension if not exists pgcrypto;
create extension if not exists vector;

create type public.user_status as enum ('pending_activation', 'active', 'blocked', 'canceled');
create type public.conversation_state as enum ('awaiting_cpf', 'awaiting_otp', 'authenticated', 'blocked');
create type public.subscription_status as enum ('inactive', 'pending_payment', 'active', 'overdue', 'canceled');
create type public.payment_status as enum ('pending', 'received', 'overdue', 'refunded', 'canceled', 'failed');
create type public.intent_type as enum (
  'faq',
  'monthly_data_collection',
  'kpi_explain',
  'compliance_guidance',
  'payment'
);
create type public.message_direction as enum ('inbound', 'outbound', 'system');

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_jwt_claim(claim_name text)
returns text
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> claim_name),
    ''
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select
    auth.role() = 'service_role'
    or public.current_jwt_claim('app_role') = 'admin';
$$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  cpf_hash text not null unique,
  cpf_encrypted text,
  status public.user_status not null default 'pending_activation',
  metadata_json jsonb not null default '{}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_operational_profile (
  user_id uuid primary key references public.users(id) on delete cascade,
  city text,
  state text,
  operation_type text check (operation_type in ('urbano', 'rodoviario', 'misto')),
  has_convenience boolean not null default false,
  has_oil_change boolean not null default false,
  has_car_wash boolean not null default false,
  has_gnv boolean not null default false,
  has_restaurant boolean not null default false,
  operating_hours text,
  preferences_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.auth_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel text not null default 'whatsapp',
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  consumed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  wa_contact_id text not null,
  state public.conversation_state not null default 'awaiting_cpf',
  expires_at timestamptz not null default now() + interval '24 hours',
  last_seen_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wa_contact_id)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  asaas_customer_id text,
  asaas_subscription_id text unique,
  status public.subscription_status not null default 'inactive',
  plan_code text not null default 'default_monthly',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  asaas_payment_id text not null unique,
  asaas_invoice_number text,
  invoice_url text,
  pix_payload text,
  method text,
  amount_cents integer check (amount_cents >= 0),
  currency text not null default 'BRL',
  status public.payment_status not null default 'pending',
  due_date date,
  paid_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel text not null default 'whatsapp',
  status text not null default 'open' check (status in ('open', 'closed')),
  topic text,
  metadata_json jsonb not null default '{}'::jsonb,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  last_message_at timestamptz
);

create table public.messages (
  id bigserial primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  wa_message_id text,
  direction public.message_direction not null default 'inbound',
  content_text text,
  media_url text,
  media_mime text,
  transcription_text text,
  intent public.intent_type,
  citations_json jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.monthly_inputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  month_ref date not null check (month_ref = date_trunc('month', month_ref)::date),
  source text not null default 'chat' check (source in ('chat', 'form', 'import')),
  input_json jsonb not null default '{}'::jsonb,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_ref)
);

create table public.monthly_kpis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  month_ref date not null check (month_ref = date_trunc('month', month_ref)::date),
  calculation_version text not null default 'v1.1',
  kpis_json jsonb not null default '{}'::jsonb,
  alerts_json jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_ref)
);

create table public.knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text not null,
  version text,
  storage_path text,
  status text not null default 'active' check (status in ('active', 'archived')),
  uploaded_by text,
  metadata_json jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default now()
);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.knowledge_docs(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  section_hint text,
  chunk_text text not null,
  token_count integer,
  embedding vector(1536) not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (doc_id, chunk_index)
);

create table public.audit_logs (
  id bigserial primary key,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index users_status_idx on public.users(status);
create index auth_otp_challenges_user_created_idx on public.auth_otp_challenges(user_id, created_at desc);
create index auth_otp_challenges_user_expires_idx on public.auth_otp_challenges(user_id, expires_at desc);
create index sessions_user_state_idx on public.sessions(user_id, state);
create index sessions_wa_contact_idx on public.sessions(wa_contact_id);
create index subscriptions_status_idx on public.subscriptions(status);
create index payments_user_status_idx on public.payments(user_id, status);
create index payments_asaas_status_idx on public.payments(asaas_payment_id, status);
create index conversations_user_opened_idx on public.conversations(user_id, opened_at desc);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index messages_user_created_idx on public.messages(user_id, created_at desc);
create unique index messages_wa_message_id_uidx
  on public.messages(wa_message_id)
  where wa_message_id is not null;
create index monthly_inputs_user_month_idx on public.monthly_inputs(user_id, month_ref desc);
create index monthly_kpis_user_month_idx on public.monthly_kpis(user_id, month_ref desc);
create index knowledge_chunks_doc_idx on public.knowledge_chunks(doc_id, chunk_index);
create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create trigger users_updated_at_tg
before update on public.users
for each row execute function public.tg_set_updated_at();

create trigger user_operational_profile_updated_at_tg
before update on public.user_operational_profile
for each row execute function public.tg_set_updated_at();

create trigger sessions_updated_at_tg
before update on public.sessions
for each row execute function public.tg_set_updated_at();

create trigger subscriptions_updated_at_tg
before update on public.subscriptions
for each row execute function public.tg_set_updated_at();

create trigger payments_updated_at_tg
before update on public.payments
for each row execute function public.tg_set_updated_at();

create trigger monthly_inputs_updated_at_tg
before update on public.monthly_inputs
for each row execute function public.tg_set_updated_at();

create trigger monthly_kpis_updated_at_tg
before update on public.monthly_kpis
for each row execute function public.tg_set_updated_at();

create trigger system_settings_updated_at_tg
before update on public.system_settings
for each row execute function public.tg_set_updated_at();

alter table public.users enable row level security;
alter table public.user_operational_profile enable row level security;
alter table public.auth_otp_challenges enable row level security;
alter table public.sessions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.monthly_inputs enable row level security;
alter table public.monthly_kpis enable row level security;
alter table public.knowledge_docs enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

create policy admin_all_users on public.users
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_user_operational_profile on public.user_operational_profile
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_auth_otp_challenges on public.auth_otp_challenges
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_sessions on public.sessions
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_subscriptions on public.subscriptions
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_payments on public.payments
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_conversations on public.conversations
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_messages on public.messages
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_monthly_inputs on public.monthly_inputs
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_monthly_kpis on public.monthly_kpis
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_knowledge_docs on public.knowledge_docs
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_knowledge_chunks on public.knowledge_chunks
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_audit_logs on public.audit_logs
for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_system_settings on public.system_settings
for all using (public.is_admin()) with check (public.is_admin());

insert into public.system_settings (key, value, description, updated_by)
values
  (
    'support_phone',
    jsonb_build_object('phone_e164', '+5500000000000'),
    'Numero de suporte externo para pedidos de atendente humano',
    'system'
  ),
  (
    'retention_policy',
    jsonb_build_object('conversation_months', 12),
    'Politica padrao de retencao LGPD para historico conversacional',
    'system'
  ),
  (
    'kpi_constants',
    jsonb_build_object(
      'liters_per_attendant_reference', jsonb_build_object(
        'urbano', 25000,
        'rodoviario', 35000,
        'misto', 30000
      ),
      'days_worked', jsonb_build_object(
        '12x36', 15,
        '8h', 24
      ),
      'lubricant_ratio_reference', jsonb_build_object(
        'urbano', 0.0015,
        'rodoviario', 0.0024,
        'misto', 0.0019
      ),
      'oil_price_simulation', jsonb_build_object(
        'light_line_1l', 30,
        'heavy_line_20l', 400
      )
    ),
    'Constantes padrao utilizadas no motor de KPIs',
    'system'
  ),
  (
    'prompt_version',
    jsonb_build_object('active', 'v1.1'),
    'Versao de prompt/orquestracao ativa para respostas da R.Ai',
    'system'
  )
on conflict (key) do nothing;
