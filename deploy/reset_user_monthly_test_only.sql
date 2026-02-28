-- ATENCAO: script destrutivo para ambiente de teste.
-- Use somente com autorizacao explicita para limpar dados mensais de UM usuario.

do $$
declare
  v_phone text := '+55SEUNUMERO';
  v_user uuid;
  v_month date := date_trunc('month', now())::date - interval '1 month';
begin
  select id into v_user
  from public.users
  where phone_e164 = v_phone;

  if v_user is null then
    raise exception 'Usuario nao encontrado para %', v_phone;
  end if;

  update public.chat_flows
  set status = 'canceled',
      canceled_at = now(),
      updated_at = now()
  where user_id = v_user
    and status = 'active';

  update public.conversations
  set status = 'closed',
      closed_at = now(),
      last_message_at = now()
  where user_id = v_user
    and status = 'open';

  delete from public.monthly_kpis
  where user_id = v_user
    and month_ref = v_month::date;

  delete from public.monthly_inputs
  where user_id = v_user
    and month_ref = v_month::date;
end $$;
