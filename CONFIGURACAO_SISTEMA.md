# Configuracao Completa do Sistema Rocha Turbo

Este guia cobre todas as configuracoes para o sistema funcionar ponta a ponta:

1. Next.js (API + CRM)
2. Supabase (DB, RLS, Storage, pgvector)
3. WhatsApp Cloud API (Meta)
4. Asaas (cobranca/assinatura)
5. OpenAI (RAG + transcricao)
6. n8n (orquestracao de webhooks e jobs)

## 1) Estado atual do projeto

As migrations do Rocha Turbo ja foram aplicadas no seu Supabase remoto com sucesso:

1. `20260224121000_init_rocha_turbo.sql`
2. `20260224121500_support_functions_and_storage.sql`
3. `20260224122000_match_knowledge_chunks.sql`
4. `20260224122500_message_status_events.sql`
5. `20260225110000_admin_login_security.sql`

## 2) Variaveis de ambiente obrigatorias

Crie/ajuste `.env.local` com base em `.env.example`:

```env
APP_BASE_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=

WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=

ASAAS_API_KEY=
ASAAS_API_BASE=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=

OTP_SECRET=defina-um-segredo-longo-com-16-ou-mais-caracteres
ADMIN_API_TOKEN=defina-um-token-admin-forte  # opcional (fallback para integracoes servidor-servidor)
```

## 3) Supabase

### 3.1 Credenciais

No painel do Supabase:

1. `Project Settings > API`
2. Copiar:
   - `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` -> `SUPABASE_SERVICE_ROLE_KEY`

### 3.2 Confirmacoes no banco

Verifique no Supabase Studio:

1. Tabelas principais existem (`users`, `sessions`, `messages`, `subscriptions`, `payments`, `monthly_inputs`, `monthly_kpis`, `knowledge_docs`, `knowledge_chunks`, `admin_profiles`).
2. Buckets existem:
   - `knowledge-base`
   - `conversation-media`
3. Functions existem:
   - `match_knowledge_chunks`
   - `get_dashboard_metrics`
   - `run_retention_cleanup`
   - `log_audit_event`

### 3.3 Politicas

O projeto usa RLS com regra administrativa via:

1. `auth.role() = 'service_role'` ou
2. claim JWT `app_role = admin`

No fluxo atual, CRM e APIs admin aceitam sessao Supabase de admin ativo (`admin_profiles.is_active = true`).
Como fallback de integracao, `ADMIN_API_TOKEN` continua aceito nos endpoints administrativos.


### 3.4 Bootstrap do primeiro admin (obrigatorio)

1. Crie um usuario em `Supabase > Authentication > Users` com email e senha.
2. Pegue o `id` (UUID) do usuario criado.
3. Execute no SQL Editor:

```sql
select public.upsert_admin_profile(
  'UUID_DO_AUTH_USER',
  'admin@seudominio.com',
  'Nome Admin',
  true
);
```

4. Acesse `/login` e autentique com email/senha.
## 4) WhatsApp Cloud API (Meta)

### 4.1 Dados necessarios

1. Token da API -> `WHATSAPP_TOKEN`
2. Phone Number ID -> `WHATSAPP_PHONE_NUMBER_ID`
3. Verify Token (definido por voce) -> `WHATSAPP_VERIFY_TOKEN`

### 4.2 Webhook no Meta

Voce pode configurar de duas formas:

1. Direto no Next.js:
   - Callback URL: `https://SEU_DOMINIO/api/webhooks/whatsapp/inbound`
   - Verify token: valor de `WHATSAPP_VERIFY_TOKEN`
2. Via n8n (recomendado se quiser orquestracao):
   - Callback URL: `https://SEU_N8N/webhook/rocha/whatsapp/inbound`
   - Workflow faz forward para o endpoint Next.js

Campos para assinar no app Meta:

1. `messages`
2. `message_status` (ou equivalente de status, conforme painel atual da Meta)

## 5) Asaas

### 5.1 Credenciais

1. API key -> `ASAAS_API_KEY`
2. Base URL:
   - producao: `https://api.asaas.com/v3`
   - sandbox: URL de sandbox (se estiver testando)

### 5.2 Webhook

Configure webhook no Asaas para:

1. Direto Next.js: `https://SEU_DOMINIO/api/webhooks/asaas`
2. Ou via n8n: `https://SEU_N8N/webhook/rocha/asaas/webhook`

Configure tambem um token de seguranca e replique em `ASAAS_WEBHOOK_TOKEN`.

Eventos minimos:

1. criacao de cobranca
2. pagamento confirmado
3. vencido/inadimplente
4. cancelamento/refund (se usar)

## 6) OpenAI

Defina `OPENAI_API_KEY`.

Modelos usados no codigo:

1. Embeddings: `text-embedding-3-small`
2. Resposta RAG: `gpt-4.1-mini`
3. Transcricao audio: `gpt-4o-mini-transcribe`

## 7) n8n

Importe os workflows em `n8n/workflows`:

1. `WF-01_WhatsApp_Inbound_Router.json`
2. `WF-02_WhatsApp_Status_Router.json`
3. `WF-08_Asaas_Webhook_Handler.json`
4. `WF-09_Retention_Cleanup_Cron.json`

Variaveis no n8n:

1. `APP_BASE_URL` (URL da app Next.js)
2. `ADMIN_API_TOKEN` (mesmo valor do `.env.local`)

Ative os workflows apos testar manualmente cada webhook.

## 8) Base de conhecimento da IA (RAG)

Conforme seu ajuste, os arquivos DOCX sao **somente fonte de conhecimento da IA**.

Pasta:

`C:\Users\pcram\OneDrive\Documentos\Clientes\Turbo Rocha\Base de Dados`

Para ingestao:

```bash
set ADMIN_API_TOKEN=SEU_TOKEN
set APP_BASE_URL=http://localhost:3000
npm run kb:ingest
```

Isso popula:

1. `knowledge_docs`
2. `knowledge_chunks` (com embedding)

## 9) Subir o sistema localmente

```bash
npm install
npm run dev
```

Opcional validar:

```bash
npm run lint
npm run build
```

## 10) Teste ponta a ponta (checklist rapido)

1. Entrar via `/login` com usuario admin ativo em `admin_profiles`.
2. Enviar mensagem no WhatsApp com CPF.
3. Receber OTP.
4. Validar OTP.
5. Sem assinatura ativa: validar bloqueio premium e envio de link.
6. Gerar cobranca em `POST /api/admin/billing/create-link`.
7. Confirmar pagamento no Asaas.
8. Webhook deve ativar assinatura e liberar acesso.
9. Perguntar algo via WhatsApp e validar resposta RAG com citacoes.
10. Verificar CRM em `/crm/dashboard`, `/crm/conversas`, `/crm/cobranca`.
11. Validar logout (botao `Sair`) e bloqueio de acesso sem sessao.

## 11) Deploy/producao

1. Hospedar Next.js com HTTPS (Vercel, VPS, etc.).
2. Definir `APP_BASE_URL` com dominio final.
3. Atualizar webhooks Meta/Asaas para URLs de producao.
4. Subir n8n com HTTPS e variaveis de ambiente.
5. Rotacionar chaves periodicamente (`WHATSAPP_TOKEN`, `ASAAS_API_KEY`, `OPENAI_API_KEY`, `ADMIN_API_TOKEN`).

## 12) Troubleshooting rapido

### `db push` falha por migration history mismatch

Use:

```bash
supabase migration fetch
npm run db:push
```

### WhatsApp nao envia resposta

1. Validar `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
2. Conferir se numero do usuario esta em formato E.164.
3. Checar logs do endpoint `/api/webhooks/whatsapp/inbound`.

### Asaas nao libera assinatura

1. Validar token do webhook (`asaas-access-token`).
2. Verificar payload recebido em `/api/webhooks/asaas`.
3. Confirmar se `externalReference` foi enviado com `user_id`.

