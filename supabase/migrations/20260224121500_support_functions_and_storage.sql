-- Support functions, views and storage setup

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'knowledge-base',
    'knowledge-base',
    false,
    52428800,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]
  ),
  (
    'conversation-media',
    'conversation-media',
    false,
    26214400,
    array[
      'audio/ogg',
      'audio/mpeg',
      'audio/mp4',
      'image/jpeg',
      'image/png'
    ]
  )
on conflict (id) do nothing;

create or replace function public.log_audit_event(
  p_actor text,
  p_action text,
  p_entity text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.audit_logs(actor, action, entity, entity_id, metadata_json)
  values (p_actor, p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.get_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with now_ref as (
    select now() as ts
  ),
  users_agg as (
    select
      count(*) as total_users,
      count(*) filter (where status = 'active') as active_users,
      count(*) filter (where status = 'blocked') as blocked_users
    from public.users
  ),
  conversations_agg as (
    select
      count(*) filter (where status = 'open') as open_conversations,
      count(*) filter (where opened_at >= (select ts - interval '1 day' from now_ref)) as conversations_24h
    from public.conversations
  ),
  messages_agg as (
    select
      count(*) filter (where created_at >= (select ts - interval '1 day' from now_ref)) as messages_24h,
      count(*) filter (where direction = 'inbound' and created_at >= (select ts - interval '1 day' from now_ref)) as inbound_24h,
      count(*) filter (where direction = 'outbound' and created_at >= (select ts - interval '1 day' from now_ref)) as outbound_24h
    from public.messages
  ),
  billing_agg as (
    select
      count(*) filter (where status = 'active') as subscriptions_active,
      count(*) filter (where status = 'pending_payment') as subscriptions_pending_payment,
      count(*) filter (where status = 'overdue') as subscriptions_overdue
    from public.subscriptions
  )
  select jsonb_build_object(
    'users', (select row_to_json(users_agg) from users_agg),
    'conversations', (select row_to_json(conversations_agg) from conversations_agg),
    'messages', (select row_to_json(messages_agg) from messages_agg),
    'billing', (select row_to_json(billing_agg) from billing_agg)
  );
$$;

create or replace function public.run_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months integer;
  v_threshold timestamptz;
  v_messages_deleted integer := 0;
  v_conversations_deleted integer := 0;
begin
  select coalesce((value ->> 'conversation_months')::integer, 12)
    into v_months
  from public.system_settings
  where key = 'retention_policy';

  if v_months <= 0 then
    v_months := 12;
  end if;

  v_threshold := now() - make_interval(months => v_months);

  delete from public.messages
  where created_at < v_threshold;
  get diagnostics v_messages_deleted = row_count;

  delete from public.conversations
  where coalesce(last_message_at, opened_at) < v_threshold;
  get diagnostics v_conversations_deleted = row_count;

  perform public.log_audit_event(
    'system',
    'retention_cleanup',
    'messages/conversations',
    null,
    jsonb_build_object(
      'threshold', v_threshold,
      'messages_deleted', v_messages_deleted,
      'conversations_deleted', v_conversations_deleted
    )
  );

  return jsonb_build_object(
    'threshold', v_threshold,
    'messages_deleted', v_messages_deleted,
    'conversations_deleted', v_conversations_deleted
  );
end;
$$;

grant execute on function public.get_dashboard_metrics() to authenticated, service_role;
grant execute on function public.run_retention_cleanup() to service_role;
grant execute on function public.log_audit_event(text, text, text, text, jsonb) to service_role;
