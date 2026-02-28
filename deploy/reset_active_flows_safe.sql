-- Reset operacional seguro para go-live V2.
-- Nao remove monthly_inputs nem monthly_kpis.
-- Tambem reseta estado de sessao/OTP para evitar travas em awaiting_otp.

update public.chat_flows
set status = 'canceled',
    canceled_at = now(),
    updated_at = now()
where status = 'active';

update public.conversations
set status = 'closed',
    closed_at = now(),
    last_message_at = now()
where status = 'open';

update public.sessions
set state = 'awaiting_cpf',
    user_id = null,
    last_seen_at = now();

update public.auth_otp_challenges
set consumed_at = now()
where consumed_at is null;
