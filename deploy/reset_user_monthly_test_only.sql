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

  -- Reset de sessao para sair de awaiting_otp/authenticated e voltar ao inicio.
  update public.sessions
  set state = 'awaiting_cpf',
      user_id = null,
      last_seen_at = now()
  where user_id = v_user
     or wa_contact_id = v_phone;

  -- Expira desafios OTP pendentes do usuario.
  update public.auth_otp_challenges
  set consumed_at = now()
  where user_id = v_user
    and consumed_at is null;

  delete from public.monthly_kpis
  where user_id = v_user
    and month_ref = v_month::date;

  delete from public.monthly_inputs
  where user_id = v_user
    and month_ref = v_month::date;
end $$;
