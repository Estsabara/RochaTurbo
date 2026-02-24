import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
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
import { getOrCreateSubscription, isSubscriptionActive } from "@/lib/services/subscriptions";
import { sendWhatsAppTextMessage } from "@/lib/services/whatsapp";
import { logAuditEvent } from "@/lib/services/audit";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import { downloadWhatsAppMedia } from "@/lib/services/whatsapp-media";
import { transcribeAudioFile } from "@/lib/services/ai";

interface WhatsAppTextMessage {
  id: string;
  from: string;
  type: "text" | "audio" | string;
  text?: { body?: string };
  audio?: { id: string };
}

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppTextMessage[];
      };
    }>;
  }>;
}

export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const search = request.nextUrl.searchParams;
  const mode = search.get("hub.mode");
  const token = search.get("hub.verify_token");
  const challenge = search.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Verification failed", { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as WhatsAppWebhookPayload;
    const messages = extractMessages(payload);

    for (const message of messages) {
      await processMessage(message, payload);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process webhook" },
      { status: 500 },
    );
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
  const active = isSubscriptionActive(subscription.status);
  const welcomeMessage = active
    ? "Acesso liberado. Pode enviar sua pergunta sobre operacao, KPIs e conformidade."
    : "Acesso autenticado. Sua assinatura esta pendente. Solicite o link de pagamento com o suporte para liberar os recursos premium.";

  await sendWhatsAppTextMessage({
    to: params.phoneE164,
    message: welcomeMessage,
  });
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
  if (!isSubscriptionActive(subscription.status)) {
    await sendWhatsAppTextMessage({
      to: params.phoneE164,
      message:
        "Seu acesso premium esta bloqueado por assinatura pendente. Solicite o link de pagamento para continuar.",
    });
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

function extractMessages(payload: WhatsAppWebhookPayload): WhatsAppTextMessage[] {
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
