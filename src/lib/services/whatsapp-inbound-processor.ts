import { isValidCpf, normalizeCpf } from "@/lib/security/cpf";
import { answerWithRag } from "@/lib/services/rag";
import { findUserByCpf } from "@/lib/services/users";
import { createOtpChallenge, verifyLatestOtpChallenge } from "@/lib/services/otp";
import {
  addConversationMessage,
  ensureOpenConversation,
  ensureSession,
  getRecentMessages,
  updateSessionState,
} from "@/lib/services/conversations";
import { inferIntent } from "@/lib/services/intent";
import { createAsaasBillingLink, mapAsaasPaymentStatus } from "@/lib/services/asaas";
import { hasPremiumEntitlement, refreshUserEntitlement } from "@/lib/services/entitlements";
import { generateModuleArtifact, getGeneratedFileSignedUrl } from "@/lib/services/modules";
import {
  getLatestPendingPayment,
  getOrCreateSubscription,
  updateSubscriptionStatus,
  upsertPayment,
} from "@/lib/services/subscriptions";
import { sendWhatsAppTextMessage } from "@/lib/services/whatsapp";
import { logAuditEvent } from "@/lib/services/audit";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import type { ModuleType } from "@/lib/types/domain";
import { downloadWhatsAppMedia } from "@/lib/services/whatsapp-media";
import { transcribeAudioFile } from "@/lib/services/ai";

const AUTO_BILLING_AMOUNT_BRL = 149.9;
const AUTO_BILLING_DESCRIPTION = "Assinatura Rocha Turbo";
const AUTO_BILLING_DUE_IN_DAYS = 2;

export interface WhatsAppTextMessage {
  id: string;
  from: string;
  type: "text" | "audio" | string;
  text?: { body?: string };
  audio?: { id: string };
}

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppTextMessage[];
      };
    }>;
  }>;
}

export async function processWhatsAppInboundPayload(payload: WhatsAppWebhookPayload): Promise<void> {
  const messages = extractMessages(payload);
  for (const message of messages) {
    await processMessage(message, payload);
  }
}

async function processMessage(message: WhatsAppTextMessage, rawPayload: unknown) {
  const phoneE164 = normalizePhone(message.from);
  const session = await ensureSession({
    waContactId: phoneE164,
    state: "awaiting_cpf",
  });

  const userText = await extractUserText(message);
  if (!userText) return;

  if (session.user_id && session.state === "authenticated") {
    await handleAuthenticatedMessage({
      userId: String(session.user_id),
      sessionId: String(session.id),
      waMessageId: message.id,
      phoneE164,
      text: userText,
      rawPayload,
    });
    return;
  }

  if (session.state === "awaiting_otp" && session.user_id) {
    await handleOtpValidation({
      sessionId: String(session.id),
      userId: String(session.user_id),
      otpCode: userText.trim(),
      phoneE164,
    });
    return;
  }

  await handleCpfValidation({
    sessionId: String(session.id),
    cpfCandidate: userText,
    phoneE164,
  });
}

async function handleCpfValidation(params: {
  sessionId: string;
  cpfCandidate: string;
  phoneE164: string;
}) {
  const cpf = normalizeCpf(params.cpfCandidate);
  if (!isValidCpf(cpf)) {
    await sendWhatsAppTextMessage({
      to: params.phoneE164,
      message: "Para acessar, envie seu CPF (somente numeros) com 11 digitos validos.",
    });
    return;
  }

  const user = await findUserByCpf(cpf);
  if (!user) {
    await sendWhatsAppTextMessage({
      to: params.phoneE164,
      message:
        "CPF nao encontrado na base autorizada. Entre em contato com o suporte para liberar seu acesso.",
    });
    await logAuditEvent({
      actor: "whatsapp_webhook",
      action: "cpf_not_found",
      entity: "users",
      entityId: null,
      metadata: {
        phone: params.phoneE164,
      },
    });
    return;
  }

  const otp = await createOtpChallenge(String(user.id));
  await updateSessionAfterCpf(params.sessionId, String(user.id));

  await sendWhatsAppTextMessage({
    to: params.phoneE164,
    message:
      `Codigo de acesso: ${otp.code}\n` +
      "Este codigo expira em 5 minutos. Responda com os 6 digitos para continuar.",
  });

  await logAuditEvent({
    actor: "whatsapp_webhook",
    action: "otp_generated",
    entity: "auth_otp_challenges",
    entityId: otp.challengeId,
    metadata: {
      user_id: user.id,
      phone: params.phoneE164,
    },
  });
}

async function handleOtpValidation(params: {
  sessionId: string;
  userId: string;
  otpCode: string;
  phoneE164: string;
}) {
  const isValid = await verifyLatestOtpChallenge(params.userId, params.otpCode);
  if (!isValid) {
    await sendWhatsAppTextMessage({
      to: params.phoneE164,
      message: "Codigo invalido ou expirado. Tente novamente com o codigo mais recente.",
    });
    return;
  }

  await updateSessionState(params.sessionId, "authenticated");

  const supabase = getServiceSupabaseClient();
  await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", params.userId);

  const subscription = await getOrCreateSubscription(params.userId);
  await refreshUserEntitlement(params.userId);
  const hasPremium = await hasPremiumEntitlement(params.userId);

  if (hasPremium) {
    await sendWhatsAppTextMessage({
      to: params.phoneE164,
      message: "Acesso liberado. Pode enviar sua pergunta sobre operacao, KPIs e conformidade.",
    });
    return;
  }

  try {
    const billing = await ensureAutomatedBillingLink({
      userId: params.userId,
      subscriptionId: String(subscription.id),
    });

    await sendWhatsAppTextMessage({
      to: params.phoneE164,
      message: formatPendingPaymentMessage({
        invoiceUrl: billing.invoiceUrl,
        pixPayload: billing.pixPayload,
        createdNow: billing.createdNow,
        intro:
          "Acesso autenticado. Sua assinatura esta pendente, mas ja geramos sua cobranca automaticamente.",
      }),
    });
  } catch (error) {
    await safeAudit({
      actor: "whatsapp_webhook",
      action: "auto_billing_failed_after_otp",
      entity: "subscriptions",
      entityId: params.userId,
      metadata: {
        user_id: params.userId,
        error: error instanceof Error ? error.message : "unknown_error",
      },
    });
    await sendWhatsAppTextMessage({
      to: params.phoneE164,
      message:
        "Acesso autenticado, mas nao consegui gerar sua cobranca agora. " +
        "Fale com o suporte para receber o link de pagamento.",
    });
  }
}

async function handleAuthenticatedMessage(params: {
  userId: string;
  sessionId: string;
  phoneE164: string;
  waMessageId: string;
  text: string;
  rawPayload: unknown;
}) {
  const subscription = await getOrCreateSubscription(params.userId);
  await refreshUserEntitlement(params.userId);
  const hasPremium = await hasPremiumEntitlement(params.userId);

  if (!hasPremium) {
    try {
      const billing = await ensureAutomatedBillingLink({
        userId: params.userId,
        subscriptionId: String(subscription.id),
      });
      await sendWhatsAppTextMessage({
        to: params.phoneE164,
        message: formatPendingPaymentMessage({
          invoiceUrl: billing.invoiceUrl,
          pixPayload: billing.pixPayload,
          createdNow: billing.createdNow,
          intro: "Seu acesso premium esta bloqueado por assinatura pendente.",
        }),
      });
    } catch (error) {
      await safeAudit({
        actor: "whatsapp_webhook",
        action: "auto_billing_failed_blocked_flow",
        entity: "subscriptions",
        entityId: params.userId,
        metadata: {
          user_id: params.userId,
          error: error instanceof Error ? error.message : "unknown_error",
        },
      });
      await sendWhatsAppTextMessage({
        to: params.phoneE164,
        message:
          "Seu acesso premium esta bloqueado por assinatura pendente. " +
          "Nao consegui gerar o link agora, fale com o suporte.",
      });
    }
    return;
  }

  const supportIntent = /\batendente\b|\bhumano\b|\bsuporte\b/i.test(params.text);
  if (supportIntent) {
    const supportPhone = await getSupportPhone();
    await sendWhatsAppTextMessage({
      to: params.phoneE164,
      message: `Para atendimento humano, fale com nossa equipe neste numero: ${supportPhone}`,
    });
    return;
  }

  const moduleRequest = detectModuleRequest(params.text);
  if (moduleRequest) {
    try {
      const artifact = await generateModuleArtifact({
        userId: params.userId,
        module: moduleRequest,
        requestedBy: "whatsapp:user",
        input: {
          source: "whatsapp",
          request_text: params.text,
        },
      });

      const fileId = String(artifact.file.id ?? "");
      const signedUrl = fileId ? await getGeneratedFileSignedUrl(fileId) : null;

      const responseMessage =
        `Documento do modulo ${moduleRequest} gerado com sucesso.` +
        (signedUrl ? `\nDownload: ${signedUrl}` : "\nArquivo disponivel no CRM.");

      const conversation = await ensureOpenConversation(params.userId);
      await addConversationMessage({
        conversationId: String(conversation.id),
        userId: params.userId,
        direction: "outbound",
        contentText: responseMessage,
        intent: inferIntent(params.text),
        citations: [],
      });

      await sendWhatsAppTextMessage({
        to: params.phoneE164,
        message: responseMessage,
      });
      return;
    } catch (error) {
      await safeAudit({
        actor: "whatsapp_webhook",
        action: "module_generation_failed",
        entity: "module_runs",
        entityId: params.userId,
        metadata: {
          module: moduleRequest,
          error: error instanceof Error ? error.message : "unknown_error",
        },
      });
    }
  }

  const conversation = await ensureOpenConversation(params.userId);
  const alreadyProcessed = await alreadyProcessedMessage(params.waMessageId);
  if (alreadyProcessed) return;

  const intent = inferIntent(params.text);
  await addConversationMessage({
    conversationId: String(conversation.id),
    userId: params.userId,
    direction: "inbound",
    contentText: params.text,
    waMessageId: params.waMessageId,
    intent,
    rawPayload: (params.rawPayload as Record<string, unknown>) ?? {},
  });

  const historyRows = await getRecentMessages(String(conversation.id), 8);
  const history = historyRows
    .filter((row) => typeof row.content_text === "string")
    .map((row) => ({
      role: row.direction === "outbound" ? ("assistant" as const) : ("user" as const),
      content: String(row.content_text),
    }));

  const ragResult = await answerWithRag(params.text, history);

  await addConversationMessage({
    conversationId: String(conversation.id),
    userId: params.userId,
    direction: "outbound",
    contentText: ragResult.answer,
    intent,
    citations: ragResult.citations,
  });

  await sendWhatsAppTextMessage({
    to: params.phoneE164,
    message: ragResult.answer,
  });
}

async function updateSessionAfterCpf(sessionId: string, userId: string) {
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase
    .from("sessions")
    .update({
      user_id: userId,
      state: "awaiting_otp",
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw error;
}

export function extractMessages(payload: WhatsAppWebhookPayload): WhatsAppTextMessage[] {
  const entries = payload.entry ?? [];
  const messages: WhatsAppTextMessage[] = [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.from) messages.push(message);
      }
    }
  }

  return messages;
}

async function extractUserText(message: WhatsAppTextMessage): Promise<string | null> {
  if (message.type === "text") {
    return (message.text?.body ?? "").trim();
  }

  if (message.type === "audio" && message.audio?.id) {
    const media = await downloadWhatsAppMedia(message.audio.id);
    const file = new File([media.buffer], media.fileName, { type: media.mimeType });
    const transcription = await transcribeAudioFile({ file, language: "pt" });
    return transcription;
  }

  return null;
}

function normalizePhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.startsWith("55")) {
    return `+${digits}`;
  }
  return `+55${digits}`;
}

async function getSupportPhone(): Promise<string> {
  const supabase = getServiceSupabaseClient();
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "support_phone")
    .maybeSingle();
  return String(data?.value?.phone_e164 ?? "+5500000000000");
}

async function alreadyProcessedMessage(waMessageId: string): Promise<boolean> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("wa_message_id", waMessageId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

interface EnsureAutomatedBillingInput {
  userId: string;
  subscriptionId: string;
}

interface EnsureAutomatedBillingResult {
  invoiceUrl: string | null;
  pixPayload: string | null;
  createdNow: boolean;
}

async function ensureAutomatedBillingLink(
  input: EnsureAutomatedBillingInput,
): Promise<EnsureAutomatedBillingResult> {
  const existing = await getLatestPendingPayment(input.userId);
  if (existing && (existing.invoice_url || existing.pix_payload)) {
    await updateSubscriptionStatus(input.userId, "pending_payment");
    return {
      invoiceUrl: existing.invoice_url,
      pixPayload: existing.pix_payload,
      createdNow: false,
    };
  }

  const supabase = getServiceSupabaseClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, name, phone_e164, cpf_encrypted")
    .eq("id", input.userId)
    .single();
  if (userError) throw userError;

  const cpf = normalizeCpf(String(user.cpf_encrypted ?? ""));
  if (cpf.length !== 11) {
    throw new Error("User CPF is missing or invalid for automated billing");
  }

  const billing = await createAsaasBillingLink({
    customerName: String(user.name),
    customerCpfCnpj: cpf,
    customerPhone: String(user.phone_e164),
    value: AUTO_BILLING_AMOUNT_BRL,
    description: AUTO_BILLING_DESCRIPTION,
    dueInDays: AUTO_BILLING_DUE_IN_DAYS,
    externalReference: input.userId,
  });

  const paymentStatus = mapAsaasPaymentStatus(billing.status);
  await upsertPayment({
    userId: input.userId,
    subscriptionId: input.subscriptionId,
    asaasPaymentId: billing.asaasPaymentId,
    asaasInvoiceNumber: billing.invoiceNumber,
    invoiceUrl: billing.invoiceUrl,
    pixPayload: billing.pixPayload,
    method: "UNDEFINED",
    amountCents: Math.round(billing.amount * 100),
    dueDate: billing.dueDate,
    status: paymentStatus,
    metadata: {
      asaas_status: billing.status,
      source: "whatsapp_auto",
    },
  });

  const nextSubscriptionStatus =
    paymentStatus === "received"
      ? "active"
      : paymentStatus === "overdue"
        ? "overdue"
        : "pending_payment";
  await updateSubscriptionStatus(input.userId, nextSubscriptionStatus);
  await refreshUserEntitlement(input.userId);

  await safeAudit({
    actor: "whatsapp_webhook",
    action: "auto_billing_link_created",
    entity: "payments",
    entityId: billing.asaasPaymentId,
    metadata: {
      user_id: input.userId,
      amount_brl: AUTO_BILLING_AMOUNT_BRL,
      due_date: billing.dueDate,
      payment_status: paymentStatus,
    },
  });

  return {
    invoiceUrl: billing.invoiceUrl,
    pixPayload: billing.pixPayload,
    createdNow: true,
  };
}

function formatPendingPaymentMessage(input: {
  intro: string;
  invoiceUrl: string | null;
  pixPayload: string | null;
  createdNow: boolean;
}): string {
  const lines = [input.intro];
  if (input.createdNow) {
    lines.push("Cobranca gerada agora.");
  } else {
    lines.push("Reenviei sua cobranca pendente.");
  }
  if (input.invoiceUrl) {
    lines.push(`Link para pagamento: ${input.invoiceUrl}`);
  }
  if (input.pixPayload) {
    lines.push(`PIX copia e cola: ${input.pixPayload}`);
  }
  if (!input.invoiceUrl && !input.pixPayload) {
    lines.push("Nao recebi link/PIX do provedor no momento, fale com o suporte.");
  } else {
    lines.push("Assim que o pagamento for confirmado, seu acesso sera liberado automaticamente.");
  }
  return lines.join("\n");
}

async function safeAudit(input: {
  actor: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await logAuditEvent(input);
  } catch {
    // Avoid failing webhook flow due to audit log issues.
  }
}

function detectModuleRequest(text: string): ModuleType | null {
  const normalized = text.toLowerCase();

  if (/swot|fofa/.test(normalized)) return "swot";
  if (/checklist/.test(normalized)) return "checklist";
  if (/promo[cç][aã]o|campanha/.test(normalized)) return "promocao";
  if (/marketing|instagram|reels/.test(normalized)) return "marketing";
  if (/padr[aã]o|atendimento/.test(normalized)) return "padrao";
  if (/kpi|indicador|pareto|ishikawa|histograma/.test(normalized)) return "kpi";

  return null;
}
