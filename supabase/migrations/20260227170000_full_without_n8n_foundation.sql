-- Rocha Turbo: Full platform foundation without n8n

alter type public.subscription_status add value if not exists 'trial_active';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'entitlement_status') then
    create type public.entitlement_status as enum ('none', 'trial', 'active', 'blocked', 'overdue');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'module_type') then
    create type public.module_type as enum ('padrao', 'checklist', 'promocao', 'kpi', 'marketing', 'swot', 'compliance');
  end if;
end
$$;

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  amount_cents integer not null check (amount_cents >= 0),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  free_days integer not null check (free_days > 0),
  expires_at timestamptz,
  usage_limit integer check (usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  allow_existing_accounts boolean not null default false,
  restricted_email text,
  restricted_cnpj text,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'redeemed' check (status in ('redeemed', 'expired', 'canceled')),
  redeemed_at timestamptz not null default now(),
  entitlement_starts_at timestamptz not null,
  entitlement_ends_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coupon_id, user_id)
);

create table if not exists public.subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  source text not null default 'subscription' check (source in ('subscription', 'coupon', 'manual', 'none')),
  status public.entitlement_status not null default 'none',
  is_premium boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  last_synced_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dunning_events (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  stage text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'resolved', 'failed', 'canceled')),
  scheduled_for timestamptz,
  executed_at timestamptz,
  channel text not null default 'whatsapp',
  message_text text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.module_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  requested_by text not null,
  module public.module_type not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'canceled')),
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  error_text text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_files (
  id uuid primary key default gen_random_uuid(),
  module_run_id uuid references public.module_runs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  storage_bucket text not null default 'generated-files',
  storage_path text not null,
  size_bytes bigint,
  checksum text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  module_run_id uuid references public.module_runs(id) on delete set null,
  name text not null,
  description text,
  periodicity text,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  item_order integer not null check (item_order >= 0),
  category text,
  label text not null,
  is_critical boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (template_id, item_order)
);

create table if not exists public.checklist_executions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  executed_by text,
  shift text,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'canceled')),
  total_items integer not null default 0,
  total_yes integer not null default 0,
  total_no integer not null default 0,
  total_na integer not null default 0,
  score_pct numeric(6,2),
  signed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_execution_items (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.checklist_executions(id) on delete cascade,
  template_item_id uuid references public.checklist_template_items(id) on delete set null,
  answer text not null check (answer in ('S', 'N', 'NA')),
  comment_text text,
  evidence_url text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (execution_id, template_item_id)
);

create table if not exists public.swot_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  month_ref date,
  status text not null default 'draft' check (status in ('draft', 'completed', 'archived')),
  input_context jsonb not null default '{}'::jsonb,
  matrix_json jsonb not null default '{}'::jsonb,
  summary_text text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.swot_answers (
  id bigserial primary key,
  session_id uuid not null references public.swot_sessions(id) on delete cascade,
  quadrant text not null check (quadrant in ('strengths', 'weaknesses', 'opportunities', 'threats')),
  prompt text,
  answer text not null,
  weight numeric(8,3),
  created_at timestamptz not null default now()
);

create table if not exists public.swot_action_plan (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.swot_sessions(id) on delete cascade,
  plan_json jsonb not null default '{}'::jsonb,
  report_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
  id bigserial primary key,
  provider text not null,
  event_type text,
  event_key text,
  status text not null default 'received' check (status in ('received', 'queued', 'processed', 'failed', 'ignored')),
  payload jsonb not null default '{}'::jsonb,
  headers_json jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  retry_count integer not null default 0,
  error_text text,
  unique (provider, event_key)
);

create table if not exists public.job_failures (
  id bigserial primary key,
  queue_name text not null,
  job_name text not null,
  job_id text,
  payload jsonb,
  error_text text not null,
  stack text,
  failed_at timestamptz not null default now()
);

create index if not exists coupons_code_idx on public.coupons(code);
create index if not exists coupons_active_idx on public.coupons(is_active, expires_at);
create index if not exists coupon_redemptions_user_idx on public.coupon_redemptions(user_id, created_at desc);
create index if not exists subscription_entitlements_user_status_idx on public.subscription_entitlements(user_id, status);
create index if not exists dunning_events_user_stage_idx on public.dunning_events(user_id, stage, created_at desc);
create index if not exists module_runs_user_module_idx on public.module_runs(user_id, module, created_at desc);
create index if not exists generated_files_user_created_idx on public.generated_files(user_id, created_at desc);
create index if not exists checklist_templates_user_idx on public.checklist_templates(user_id, created_at desc);
create index if not exists checklist_executions_template_created_idx on public.checklist_executions(template_id, created_at desc);
create index if not exists checklist_execution_items_execution_idx on public.checklist_execution_items(execution_id);
create index if not exists swot_sessions_user_month_idx on public.swot_sessions(user_id, month_ref desc);
create index if not exists swot_answers_session_idx on public.swot_answers(session_id, created_at asc);
create index if not exists webhook_events_provider_received_idx on public.webhook_events(provider, received_at desc);
create index if not exists webhook_events_status_received_idx on public.webhook_events(status, received_at asc);
create index if not exists job_failures_queue_failed_idx on public.job_failures(queue_name, failed_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'generated-files',
    'generated-files',
    false,
    52428800,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/json'
    ]
  )
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_set_updated_at'
  ) then
    if not exists (
      select 1 from pg_trigger where tgname = 'billing_plans_updated_at_tg'
    ) then
      create trigger billing_plans_updated_at_tg
      before update on public.billing_plans
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'coupons_updated_at_tg'
    ) then
      create trigger coupons_updated_at_tg
      before update on public.coupons
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'coupon_redemptions_updated_at_tg'
    ) then
      create trigger coupon_redemptions_updated_at_tg
      before update on public.coupon_redemptions
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'subscription_entitlements_updated_at_tg'
    ) then
      create trigger subscription_entitlements_updated_at_tg
      before update on public.subscription_entitlements
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'module_runs_updated_at_tg'
    ) then
      create trigger module_runs_updated_at_tg
      before update on public.module_runs
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'checklist_templates_updated_at_tg'
    ) then
      create trigger checklist_templates_updated_at_tg
      before update on public.checklist_templates
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'checklist_executions_updated_at_tg'
    ) then
      create trigger checklist_executions_updated_at_tg
      before update on public.checklist_executions
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'checklist_execution_items_updated_at_tg'
    ) then
      create trigger checklist_execution_items_updated_at_tg
      before update on public.checklist_execution_items
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'swot_sessions_updated_at_tg'
    ) then
      create trigger swot_sessions_updated_at_tg
      before update on public.swot_sessions
      for each row execute function public.tg_set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger where tgname = 'swot_action_plan_updated_at_tg'
    ) then
      create trigger swot_action_plan_updated_at_tg
      before update on public.swot_action_plan
      for each row execute function public.tg_set_updated_at();
    end if;
  end if;
end
$$;

create or replace function public.refresh_user_entitlement(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_subscription public.subscriptions%rowtype;
  v_has_subscription boolean := false;
  v_coupon_end timestamptz;
  v_source text := 'none';
  v_status public.entitlement_status := 'none';
  v_is_premium boolean := false;
  v_start timestamptz := null;
  v_end timestamptz := null;
begin
  select *
  into v_subscription
  from public.subscriptions
  where user_id = p_user_id
  order by created_at desc
  limit 1;
  v_has_subscription := v_subscription.id is not null;

  select max(cr.entitlement_ends_at)
  into v_coupon_end
  from public.coupon_redemptions cr
  where cr.user_id = p_user_id
    and cr.status = 'redeemed'
    and cr.entitlement_ends_at >= v_now;

  if v_has_subscription and v_subscription.status in ('active', 'trial_active') then
    v_source := 'subscription';
    v_status := case when v_subscription.status = 'trial_active' then 'trial'::public.entitlement_status else 'active'::public.entitlement_status end;
    v_is_premium := true;
    v_start := coalesce(v_subscription.current_period_start, v_now);
    v_end := coalesce(v_subscription.current_period_end, v_subscription.trial_ends_at);
  elsif v_coupon_end is not null then
    v_source := 'coupon';
    v_status := 'trial';
    v_is_premium := true;
    v_start := v_now;
    v_end := v_coupon_end;
  elsif v_has_subscription and v_subscription.status = 'overdue' then
    v_source := 'subscription';
    v_status := 'overdue';
    v_is_premium := false;
  elsif v_has_subscription and v_subscription.status in ('pending_payment', 'inactive', 'canceled') then
    v_source := 'subscription';
    v_status := 'blocked';
    v_is_premium := false;
  end if;

  insert into public.subscription_entitlements (
    user_id,
    subscription_id,
    source,
    status,
    is_premium,
    starts_at,
    ends_at,
    last_synced_at,
    metadata_json
  )
  values (
    p_user_id,
    v_subscription.id,
    v_source,
    v_status,
    v_is_premium,
    v_start,
    v_end,
    v_now,
    jsonb_build_object(
      'subscription_status', coalesce(v_subscription.status::text, null),
      'coupon_active_until', v_coupon_end
    )
  )
  on conflict (user_id)
  do update set
    subscription_id = excluded.subscription_id,
    source = excluded.source,
    status = excluded.status,
    is_premium = excluded.is_premium,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    last_synced_at = excluded.last_synced_at,
    metadata_json = excluded.metadata_json,
    updated_at = now();

  return jsonb_build_object(
    'user_id', p_user_id,
    'source', v_source,
    'status', v_status,
    'is_premium', v_is_premium,
    'starts_at', v_start,
    'ends_at', v_end
  );
end;
$$;

create or replace function public.redeem_coupon(
  p_user_id uuid,
  p_code text,
  p_email text default null,
  p_cnpj text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_coupon public.coupons%rowtype;
  v_existing boolean;
  v_ends_at timestamptz;
  v_redemption_id uuid;
begin
  select *
  into v_coupon
  from public.coupons
  where upper(code) = upper(trim(p_code))
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'coupon_not_found');
  end if;

  if not v_coupon.is_active then
    return jsonb_build_object('ok', false, 'error', 'coupon_inactive');
  end if;

  if v_coupon.expires_at is not null and v_coupon.expires_at < v_now then
    return jsonb_build_object('ok', false, 'error', 'coupon_expired');
  end if;

  if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
    return jsonb_build_object('ok', false, 'error', 'coupon_usage_limit_reached');
  end if;

  if v_coupon.restricted_email is not null and lower(coalesce(p_email, '')) <> lower(v_coupon.restricted_email) then
    return jsonb_build_object('ok', false, 'error', 'coupon_restricted_email');
  end if;

  if v_coupon.restricted_cnpj is not null and coalesce(regexp_replace(p_cnpj, '[^0-9]', '', 'g'), '') <> regexp_replace(v_coupon.restricted_cnpj, '[^0-9]', '', 'g') then
    return jsonb_build_object('ok', false, 'error', 'coupon_restricted_cnpj');
  end if;

  if not v_coupon.allow_existing_accounts then
    if exists (
      select 1
      from public.coupon_redemptions cr
      where cr.user_id = p_user_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'coupon_not_allowed_existing_account');
    end if;
  end if;

  select exists (
    select 1
    from public.coupon_redemptions cr
    where cr.coupon_id = v_coupon.id
      and cr.user_id = p_user_id
  )
  into v_existing;

  v_ends_at := v_now + make_interval(days => v_coupon.free_days);

  insert into public.coupon_redemptions (
    coupon_id,
    user_id,
    status,
    redeemed_at,
    entitlement_starts_at,
    entitlement_ends_at,
    metadata_json
  )
  values (
    v_coupon.id,
    p_user_id,
    'redeemed',
    v_now,
    v_now,
    v_ends_at,
    jsonb_build_object('coupon_code', v_coupon.code)
  )
  on conflict (coupon_id, user_id)
  do update
    set
      status = 'redeemed',
      redeemed_at = excluded.redeemed_at,
      entitlement_starts_at = excluded.entitlement_starts_at,
      entitlement_ends_at = excluded.entitlement_ends_at,
      metadata_json = excluded.metadata_json,
      updated_at = now()
  returning id into v_redemption_id;

  if not v_existing then
    update public.coupons
    set usage_count = usage_count + 1,
        updated_at = now()
    where id = v_coupon.id;
  end if;

  perform public.refresh_user_entitlement(p_user_id);

  return jsonb_build_object(
    'ok', true,
    'coupon_id', v_coupon.id,
    'coupon_code', v_coupon.code,
    'redemption_id', v_redemption_id,
    'entitlement_ends_at', v_ends_at
  );
end;
$$;

alter table public.billing_plans enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.dunning_events enable row level security;
alter table public.module_runs enable row level security;
alter table public.generated_files enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.checklist_template_items enable row level security;
alter table public.checklist_executions enable row level security;
alter table public.checklist_execution_items enable row level security;
alter table public.swot_sessions enable row level security;
alter table public.swot_answers enable row level security;
alter table public.swot_action_plan enable row level security;
alter table public.webhook_events enable row level security;
alter table public.job_failures enable row level security;

drop policy if exists admin_all_billing_plans on public.billing_plans;
create policy admin_all_billing_plans on public.billing_plans
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_coupons on public.coupons;
create policy admin_all_coupons on public.coupons
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_coupon_redemptions on public.coupon_redemptions;
create policy admin_all_coupon_redemptions on public.coupon_redemptions
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_subscription_entitlements on public.subscription_entitlements;
create policy admin_all_subscription_entitlements on public.subscription_entitlements
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_dunning_events on public.dunning_events;
create policy admin_all_dunning_events on public.dunning_events
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_module_runs on public.module_runs;
create policy admin_all_module_runs on public.module_runs
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_generated_files on public.generated_files;
create policy admin_all_generated_files on public.generated_files
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_checklist_templates on public.checklist_templates;
create policy admin_all_checklist_templates on public.checklist_templates
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_checklist_template_items on public.checklist_template_items;
create policy admin_all_checklist_template_items on public.checklist_template_items
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_checklist_executions on public.checklist_executions;
create policy admin_all_checklist_executions on public.checklist_executions
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_checklist_execution_items on public.checklist_execution_items;
create policy admin_all_checklist_execution_items on public.checklist_execution_items
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_swot_sessions on public.swot_sessions;
create policy admin_all_swot_sessions on public.swot_sessions
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_swot_answers on public.swot_answers;
create policy admin_all_swot_answers on public.swot_answers
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_swot_action_plan on public.swot_action_plan;
create policy admin_all_swot_action_plan on public.swot_action_plan
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_webhook_events on public.webhook_events;
create policy admin_all_webhook_events on public.webhook_events
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all_job_failures on public.job_failures;
create policy admin_all_job_failures on public.job_failures
for all using (public.is_admin()) with check (public.is_admin());

grant execute on function public.refresh_user_entitlement(uuid) to service_role;
grant execute on function public.redeem_coupon(uuid, text, text, text) to service_role;

insert into public.billing_plans (code, name, description, amount_cents, billing_interval, is_active)
values
  ('default_monthly', 'Plano Mensal Rocha Turbo', 'Plano mensal padrao Rocha Turbo', 14990, 'monthly', true),
  ('default_annual', 'Plano Anual Rocha Turbo', 'Plano anual padrao Rocha Turbo', 149900, 'annual', true)
on conflict (code) do nothing;
