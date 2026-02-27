# Rocha Turbo - WhatsApp + Supabase + Redis/BullMQ

Sistema centrado em **usuario** (sem entidade posto/empresa), operando sem `n8n`, com:

1. Autenticacao `CPF + OTP` via WhatsApp.
2. RAG com citacoes para respostas da IA.
3. Coleta mensal e motor de KPI (v1.1).
4. CRM web (Next.js) para operacao/admin.
5. Assinatura/cobranca (Asaas), cupons, entitlement e bloqueio por inadimplencia.
6. Fila assincrona (BullMQ) para webhooks e jobs internos.

## Stack

1. Next.js (App Router, TypeScript)
2. Supabase (Postgres, pgvector, RLS, Storage)
3. Redis + BullMQ
4. OpenAI API (embeddings, resposta e transcricao)
5. WhatsApp Cloud API (Meta)
6. Asaas

## Setup local

1. Instale dependencias:

```bash
npm install
```

2. Configure ambiente:

```bash
cp .env.example .env.local
```

3. Preencha variaveis obrigatorias no `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_PROMPT_ID` (opcional, `pmpt_...` para prompt reutilizavel no Responses API)
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET` (recomendado para assinatura de webhook)
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN`
- `REDIS_URL`
- `INTERNAL_JOB_SECRET`
- `OTP_SECRET`
- `ADMIN_API_TOKEN`

4. Suba migrations no Supabase:

```bash
npm run db:push
```

5. Rode os processos:

```bash
npm run dev
npm run worker
npm run scheduler
```

## APIs principais

1. `POST /api/webhooks/whatsapp/inbound`
2. `POST /api/webhooks/whatsapp/status`
3. `POST /api/webhooks/asaas`
4. `POST /api/billing/coupons/redeem`
5. `GET /api/billing/entitlement`
6. `POST /api/admin/coupons`
7. `PATCH /api/admin/coupons/:id`
8. `POST /api/modules/*`
9. `POST /api/internal/jobs/*`

## Ingestao da base de conhecimento

Com servidor Next.js ativo:

```bash
set ADMIN_API_TOKEN=seu_token
set APP_BASE_URL=http://localhost:3000
npm run kb:ingest
```

O script `scripts/ingest_knowledge.py` agora processa `DOCX`, `PDF`, `XLSX` e `XLS` com classificacao de dominio/tags.

## Nota sobre n8n

A pasta `n8n/` foi mantida apenas como historico de workflows. O runtime atual do projeto nao depende de `n8n`.
