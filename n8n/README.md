# n8n Workflow Templates

Arquivos em `n8n/workflows`:

1. `WF-01_WhatsApp_Inbound_Router.json`
2. `WF-02_WhatsApp_Status_Router.json`
3. `WF-08_Asaas_Webhook_Handler.json`
4. `WF-09_Retention_Cleanup_Cron.json`

## Variaveis necessarias no n8n

- `APP_BASE_URL` (ex.: `https://seu-dominio.com`)
- `ADMIN_API_TOKEN` (se voce habilitou protecao nos endpoints admin)

## Rotas esperadas no Meta/Asaas

- WhatsApp inbound: `https://N8N_HOST/webhook/rocha/whatsapp/inbound`
- WhatsApp status: `https://N8N_HOST/webhook/rocha/whatsapp/status`
- Asaas webhook: `https://N8N_HOST/webhook/rocha/asaas/webhook`

Cada workflow encaminha o payload para os endpoints Next.js em `/api/webhooks/*`.
