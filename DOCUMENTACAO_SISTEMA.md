# Rocha Turbo — Documentação Completa do Sistema

Este documento descreve de forma detalhada o funcionamento, arquitetura e componentes do sistema Rocha Turbo.

---

## 1. Visão Geral

O **Rocha Turbo** é um sistema de atendimento via WhatsApp voltado para postos de combustível, que combina:

- **Autenticação** por CPF + OTP via WhatsApp
- **Assinatura/cobrança** via Asaas (PIX, boleto, cartão)
- **IA conversacional (RAG)** para respostas sobre operação, KPIs e conformidade regulatória
- **Motor de KPIs** para cálculo de indicadores operacionais mensais
- **CRM administrativo** para gestão de usuários, conversas, cobranças e configurações

O modelo de negócio é **centrado em usuário**: cada pessoa cadastrada tem sua própria conta, assinatura e histórico, sem conceito de posto ou empresa como entidade intermediária.

---

## 2. Arquitetura Técnica

### 2.1 Stack Principal

| Componente       | Tecnologia                                      |
|------------------|-------------------------------------------------|
| Frontend/Backend | Next.js 16 (App Router, React 19)               |
| Banco de dados   | Supabase (PostgreSQL + pgvector + RLS)          |
| Autenticação CRM | Supabase Auth (email/senha) + `admin_profiles`  |
| Mensagens        | WhatsApp Cloud API (Meta)                       |
| Pagamentos       | Asaas (cobrança, PIX, webhooks)                 |
| IA / RAG         | OpenAI (embeddings, GPT-4.1-mini, transcrição)  |
| Orquestração     | n8n (webhooks, jobs, cron)                      |

### 2.2 Fluxo de Dados Resumido

```
[WhatsApp] → webhook inbound → [Next.js] → Supabase (sessions, messages, users)
                                          ↓
[OpenAI] ← RAG + transcrição ← [Next.js] ← Supabase (knowledge_chunks, pgvector)
                                          ↓
[Asaas] ← cobrança / PIX ← [Next.js] ← assinatura pendente
                                          ↓
[Asaas] → webhook → [Next.js] → Supabase (payments, subscriptions) → libera acesso
```

---

## 3. Fluxo do Usuário (WhatsApp)

### 3.1 Etapas de Acesso

1. **Primeiro contato**  
   Usuário envia mensagem no WhatsApp → sistema cria sessão com estado `awaiting_cpf`.

2. **Validação de CPF**  
   Usuário envia CPF (somente números, 11 dígitos).  
   - CPF inválido → mensagem pedindo novamente.  
   - CPF não encontrado na base → mensagem de contato com suporte.  
   - CPF válido e cadastrado → gera OTP, associa usuário à sessão e passa para `awaiting_otp`.

3. **Validação de OTP**  
   Usuário envia o código de 6 dígitos recebido por WhatsApp.  
   - OTP inválido/expirado → mensagem de erro.  
   - OTP válido → sessão vai para `authenticated`.

4. **Verificação de assinatura**  
   - Se assinatura **ativa** → libera acesso à IA.  
   - Se assinatura **inativa** → gera cobrança automática (link + PIX), envia no WhatsApp e bloqueia acesso premium até pagamento.

5. **Uso da IA**  
   Usuário autenticado com assinatura ativa pode:  
   - Enviar perguntas em texto ou áudio.  
   - Receber respostas geradas com RAG (base de conhecimento documental).  
   - Solicitar atendimento humano (palavras-chave: atendente, humano, suporte) → sistema retorna número de suporte configurado em `system_settings`.

### 3.2 Estados da Sessão (`conversation_state`)

| Estado            | Descrição                                   |
|-------------------|---------------------------------------------|
| `awaiting_cpf`    | Aguardando envio de CPF válido              |
| `awaiting_otp`    | Aguardando código OTP                       |
| `authenticated`   | Autenticado e liberado para uso da IA       |
| `blocked`         | Bloqueado pela operação                     |

---

## 4. Autenticação e Segurança

### 4.1 Usuário Final (WhatsApp)

- **CPF**: validado com algoritmo de dígitos verificadores; armazenado com hash em `users.cpf_hash` e opcionalmente criptografado em `users.cpf_encrypted`.
- **OTP**: código de 6 dígitos, validade de 5 minutos, máximo 5 tentativas, hash com segredo `OTP_SECRET`.

### 4.2 Administrador (CRM)

- **Supabase Auth**: login por email e senha em `/login`.
- **admin_profiles**: tabela que vincula `auth.users` ao perfil administrativo (`full_name`, `role`, `is_active`).
- Acesso às páginas do CRM exige sessão Supabase válida e perfil admin ativo.
- APIs administrativas aceitam:
  - Sessão Supabase (cookie) de admin, ou
  - Header `Authorization: Bearer <ADMIN_API_TOKEN>` para integrações servidor-servidor (ex.: n8n).

### 4.3 RLS (Row Level Security)

Todas as tabelas usam RLS. O acesso administrativo é permitido quando:

- `auth.role() = 'service_role'`, ou
- JWT contém claim `app_role = 'admin'`, ou
- Existe registro em `admin_profiles` com `auth_user_id = auth.uid()` e `is_active = true`.

---

## 5. Base de Conhecimento (RAG)

### 5.1 Fluxo RAG

1. **Ingestão**  
   Texto é dividido em chunks (~900 caracteres). Cada chunk recebe embedding via `text-embedding-3-small` e é salvo em `knowledge_chunks` com vetor no pgvector.

2. **Consulta**  
   - Pergunta do usuário → embedding da pergunta.  
   - Supabase RPC `match_knowledge_chunks`: busca por similaridade de cosseno, retorna até 5 chunks mais relevantes.  
   - GPT-4.1-mini gera resposta usando contexto + histórico da conversa.  
   - Citações são associadas às mensagens em `messages.citations_json`.

### 5.2 Como Ingerir Documentos

- **Via API**: `POST /api/admin/knowledge/upload` com `title`, `source`, `text` (e opcionalmente `version`, `section_hint`).
- **Via script**: `npm run kb:ingest` (Python) lê DOCX de uma pasta e envia para a API de upload.  
  Variáveis: `APP_BASE_URL`, `ADMIN_API_TOKEN`.

---

## 6. Cobrança e Assinatura

### 6.1 Asaas

- Cobrança via API Asaas (PIX, boleto, cartão).
- `externalReference` na cobrança = `user_id` para vincular pagamento ao usuário.
- Webhook em `POST /api/webhooks/asaas` recebe eventos de pagamento.
- Token de segurança configurado em `ASAAS_WEBHOOK_TOKEN` e enviado no header `asaas-access-token`.

### 6.2 Fluxo de Cobrança Automática

Quando o usuário autentica via OTP ou tenta usar a IA sem assinatura ativa:

1. Verifica se já existe cobrança pendente com link/PIX.
2. Se não existir, cria cobrança via Asaas (valor padrão R$ 149,90, vencimento em 2 dias).
3. Registra em `payments` e atualiza `subscriptions.status` para `pending_payment`.
4. Envia link e PIX no WhatsApp.
5. Ao confirmar pagamento no Asaas, webhook atualiza `subscriptions.status` para `active` e envia mensagem de confirmação no WhatsApp.

### 6.3 Status de Assinatura

| Status             | Descrição                              |
|--------------------|----------------------------------------|
| `inactive`         | Sem assinatura ativa                   |
| `pending_payment`  | Cobrança gerada, aguardando pagamento  |
| `active`           | Assinatura ativa, acesso liberado      |
| `overdue`          | Vencido/inadimplente                   |
| `canceled`         | Cancelada                              |

---

## 7. Motor de KPIs

### 7.1 Dados de Entrada (`monthly_inputs`)

O sistema armazena dados operacionais mensais por usuário, por exemplo:

- `a_tipo_posto`: urbano, rodoviário, misto  
- `b_volume_diesel_l`, `c_volume_otto_l`: volumes de combustível  
- `g_qtd_frentistas`: quantidade de frentistas  
- `h_turno`: 12x36 ou 8h  
- `aa_qtd_abastecimentos_mes`: abastecimentos no mês  
- Outros campos para mix aditivado, margem, lubrificantes, conveniência etc.

### 7.2 Cálculo (`monthly_kpis`)

- Função `calculateKpis` (TypeScript) processa os inputs e calcula indicadores como:
  - Ocupação de equipe (litros por frentista)
  - Mix aditivado e gap
  - Métricas de abastecimento
  - Oportunidade de lubrificantes
  - Vendas em pista, conveniência
  - Alertas e validações de margem

- Resultados e alertas são persistidos em `monthly_kpis` com `calculation_version` (ex.: v1.1).

### 7.3 API de Cálculo

`POST /api/monthly/compute` (requer autenticação admin):

```json
{
  "user_id": "uuid",
  "month_ref": "2025-02-01",
  "source": "chat",
  "input_data": { ... }
}
```

---

## 8. CRM Administrativo

### 8.1 Páginas

| Rota             | Descrição                                                      |
|------------------|----------------------------------------------------------------|
| `/`              | Home com visão geral e links principais                        |
| `/login`         | Login de administradores                                       |
| `/crm/dashboard` | Métricas: usuários ativos, conversas abertas, mensagens 24h, assinaturas |
| `/crm/usuarios`  | Cadastro e alteração de status (ativo, bloqueado, cancelado)    |
| `/crm/conversas` | Conversas abertas e mensagens recentes                         |
| `/crm/cobranca`  | Gerar cobrança manual e listar pagamentos recentes             |
| `/crm/configuracoes` | Upload de conhecimento, cálculo de KPI, retenção, system settings |

### 8.2 Métricas do Dashboard

Obtidas via função `get_dashboard_metrics()` no Supabase:

- Usuários: total, ativos, bloqueados  
- Conversas: abertas, nas últimas 24h  
- Mensagens: inbound/outbound nas últimas 24h  
- Billing: assinaturas ativas, pendentes, vencidas  

---

## 9. Webhooks e Integrações

### 9.1 WhatsApp

- **GET** `/api/webhooks/whatsapp/inbound`: verificação do Meta (parâmetros `hub.mode`, `hub.verify_token`).
- **POST** `/api/webhooks/whatsapp/inbound`: recebe mensagens (texto e áudio).  
  - Áudio é baixado, transcrito com `gpt-4o-mini-transcribe` e tratado como texto.
- **POST** `/api/webhooks/whatsapp/status`: recebe atualizações de status de mensagens (opcional).

### 9.2 Asaas

- **POST** `/api/webhooks/asaas`: recebe eventos de pagamento, atualiza `payments` e `subscriptions`, envia mensagem de confirmação via WhatsApp quando aplicável.

### 9.3 n8n

O sistema pode ser orquestrado via n8n. Workflows sugeridos:

- Roteador de mensagens WhatsApp (forward para Next.js)
- Roteador de status WhatsApp
- Handler do webhook Asaas
- Cron de retenção (`run_retention_cleanup`)

---

## 10. Retenção de Dados (LGPD)

- Função `run_retention_cleanup()` no Supabase remove mensagens e conversas mais antigas que o limite configurado em `system_settings.retention_policy.conversation_months` (padrão 12 meses).
- Pode ser disparada via `POST /api/admin/retention/run` (admin) ou via n8n em cron.

---

## 11. Intent e Tipos de Mensagem

O sistema classifica mensagens por intenção (`intent_type`):

| Intent                  | Exemplos de palavras-chave                         |
|-------------------------|----------------------------------------------------|
| `payment`               | pagamento, assinatura, cobrança, pix               |
| `monthly_data_collection` | lançar mês, dados do mês, dashboard, indicador, kpi |
| `compliance_guidance`   | anp, inmetro, procon, lgpd, norma, conformidade    |
| `kpi_explain`           | mix, gap, margem, frentista, conveniência          |
| `faq`                   | demais casos                                       |

---

## 12. Estrutura do Banco de Dados (Principais Tabelas)

| Tabela                 | Função                                               |
|------------------------|------------------------------------------------------|
| `users`                | Usuários finais (nome, telefone, CPF, status)        |
| `user_operational_profile` | Perfil operacional (tipo de posto, conveniência etc.) |
| `auth_otp_challenges`  | Desafios OTP para autenticação                       |
| `sessions`             | Sessões WhatsApp (estado, usuário vinculado)         |
| `subscriptions`        | Assinaturas por usuário                              |
| `payments`             | Pagamentos Asaas                                     |
| `conversations`        | Conversas abertas/fechadas                           |
| `messages`             | Mensagens (texto, áudio, intent, citações)           |
| `monthly_inputs`       | Dados operacionais mensais                           |
| `monthly_kpis`         | KPIs calculados por mês                              |
| `knowledge_docs`       | Documentos da base de conhecimento                   |
| `knowledge_chunks`     | Chunks com embeddings (pgvector)                     |
| `audit_logs`           | Log de auditoria                                     |
| `system_settings`      | Configurações globais (suporte, retenção, constantes de KPI) |
| `admin_profiles`       | Perfis administrativos (vinculados ao Supabase Auth) |

---

## 13. Variáveis de Ambiente

Consulte `CONFIGURACAO_SISTEMA.md` para a lista completa. Principais:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
- `ASAAS_API_KEY`, `ASAAS_API_BASE`, `ASAAS_WEBHOOK_TOKEN`
- `OTP_SECRET`
- `ADMIN_API_TOKEN` (opcional, para integrações)
- `APP_BASE_URL`

---

## 14. Endpoints da API

| Método | Endpoint                            | Uso                                 |
|--------|-------------------------------------|-------------------------------------|
| GET/POST | `/api/webhooks/whatsapp/inbound`  | Meta (verificação + mensagens)      |
| POST   | `/api/webhooks/whatsapp/status`    | Status de mensagens WhatsApp        |
| POST   | `/api/webhooks/asaas`              | Webhook Asaas                       |
| POST   | `/api/admin/users`                 | CRUD de usuários (admin)            |
| POST   | `/api/admin/billing/create-link`   | Criar link de cobrança (admin)      |
| POST   | `/api/admin/knowledge/upload`      | Ingerir documento na base RAG (admin) |
| POST   | `/api/admin/dashboard`             | Métricas do dashboard (admin)       |
| POST   | `/api/admin/retention/run`         | Executar limpeza de retenção (admin)|
| POST   | `/api/monthly/compute`             | Calcular KPIs mensais (admin)       |

---

## 15. Comandos Úteis

```bash
npm install          # Instalar dependências
npm run dev          # Desenvolvimento
npm run build        # Build de produção
npm run lint         # Linter
npm run db:push      # Aplicar migrations (Supabase)
npm run kb:ingest    # Ingerir DOCX na base de conhecimento
```

---

## 16. Fluxo Resumido (Diagrama de Sequência)

```
[Usuário WhatsApp]     [Sistema]           [Asaas]        [OpenAI]
        |                   |                   |              |
        |-- CPF ----------->|                   |              |
        |<-- OTP -----------|                   |              |
        |-- OTP ----------->|                   |              |
        |                   |-- Cobrança ------>|              |
        |<-- Link/PIX ------|                   |              |
        |                   |<-- Webhook -------| (pago)       |
        |<-- Liberado ------|                   |              |
        |-- Pergunta ------>|                   |              |
        |                   |-----------------------------> RAG
        |                   |<----------------------------- Resposta
        |<-- Resposta ------|                   |              |
```

---

Para detalhes de configuração inicial, variáveis de ambiente e troubleshooting, consulte **CONFIGURACAO_SISTEMA.md**.
