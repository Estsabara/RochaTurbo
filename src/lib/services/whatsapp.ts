import { getServerEnv } from "@/lib/env";

interface SendTextMessageInput {
  to: string;
  message: string;
}

export async function sendWhatsAppTextMessage(input: SendTextMessageInput): Promise<void> {
  const env = getServerEnv();
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp credentials are not configured");
  }

  const endpoint = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "text",
    text: {
      body: input.message,
    },
  };

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) return;

      const body = await response.text();
      const error = new Error(`WhatsApp send failed: ${response.status} ${body}`);
      if (!shouldRetry(response.status) || attempt === 2) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error("unknown_whatsapp_send_error");
      if (attempt === 2) {
        throw normalized;
      }
      lastError = normalized;
    }

    await wait(300 * attempt);
  }

  throw lastError ?? new Error("WhatsApp send failed");
}

function shouldRetry(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
