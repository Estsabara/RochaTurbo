-- Admin login hardening for CRM access

create table if not exists public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'admin' check (role in ('admin')),
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_profiles_is_active_idx on public.admin_profiles(is_active);

alter table public.admin_profiles enable row level security;

drop trigger if exists admin_profiles_updated_at_tg on public.admin_profiles;
create trigger admin_profiles_updated_at_tg
before update on public.admin_profiles
for each row execute function public.tg_set_updated_at();

drop policy if exists admin_profiles_service_role_all on public.admin_profiles;
create policy admin_profiles_service_role_all
on public.admin_profiles
for all
to service_role
using (true)
with check (true);

drop policy if exists admin_profiles_self_select on public.admin_profiles;
create policy admin_profiles_self_select
on public.admin_profiles
for select
to authenticated
using (auth.uid() = auth_user_id);

grant select on public.admin_profiles to authenticated;
grant all on public.admin_profiles to service_role;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'service_role'
    or public.current_jwt_claim('app_role') = 'admin'
    or exists (
      select 1
      from public.admin_profiles ap
      where ap.auth_user_id = auth.uid()
        and ap.is_active = true
    );
$$;

create or replace function public.upsert_admin_profile(
  p_auth_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only service_role can upsert admin profiles';
  end if;

  insert into public.admin_profiles (auth_user_id, email, full_name, is_active)
  values (p_auth_user_id, p_email, p_full_name, p_is_active)
  on conflict (auth_user_id)
  do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    role = 'admin',
    is_active = excluded.is_active,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.upsert_admin_profile(uuid, text, text, boolean) to service_role;
