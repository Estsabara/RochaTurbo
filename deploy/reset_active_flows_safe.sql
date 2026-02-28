-- Reset operacional seguro para go-live V2.
-- Nao remove monthly_inputs nem monthly_kpis.

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
