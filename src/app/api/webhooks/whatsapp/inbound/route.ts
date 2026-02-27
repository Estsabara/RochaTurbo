import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { verifyMetaWebhookSignature } from "@/lib/security/meta-webhook";
import {
  extractMessages,
  processWhatsAppInboundPayload,
  type WhatsAppWebhookPayload,
} from "@/lib/services/whatsapp-inbound-processor";
import { enqueueWhatsAppInbound } from "@/lib/queue/enqueue";
import { logWebhookEvent, updateWebhookEventStatus } from "@/lib/services/webhook-events";

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
  let webhookEventId: number | null = null;

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!verifyMetaWebhookSignature(rawBody, signature)) {
      console.warn("[whatsapp/inbound] invalid webhook signature", {
        hasSignature: Boolean(signature),
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
    const messages = extractMessages(payload);
    if (messages.length === 0) {
      // Meta may send status notifications to this endpoint when field subscriptions are broad.
      // Ignore non-message payloads here to keep inbound queue focused on user messages.
      console.info("[whatsapp/inbound] ignored payload without messages");
      return NextResponse.json({ received: true, ignored: true, reason: "no_messages" });
    }

    const eventKey = extractInboundEventKey(payload);

    const logged = await logWebhookEvent({
      provider: "whatsapp_inbound",
      eventType: "messages",
      eventKey,
      payload: (payload as Record<string, unknown>) ?? {},
      headers: {
        "x-hub-signature-256": signature,
        "user-agent": request.headers.get("user-agent"),
      },
      status: "received",
    });

    webhookEventId = logged.id;

    if (logged.duplicate && logged.existingStatus !== "failed") {
      return NextResponse.json({
        received: true,
        duplicate: true,
        status: logged.existingStatus,
      });
    }

    const queued = await enqueueWhatsAppInbound({
      webhookEventId,
      payload: (payload as Record<string, unknown>) ?? {},
    });

    if (queued) {
      await updateWebhookEventStatus(webhookEventId, "queued");
      return NextResponse.json({ received: true, queued: true }, { status: 202 });
    }

    await processWhatsAppInboundPayload(payload);
    await updateWebhookEventStatus(webhookEventId, "processed");

    return NextResponse.json({ received: true, queued: false });
  } catch (error) {
    console.error("[whatsapp/inbound] process failed", error);
    if (webhookEventId) {
      await updateWebhookEventStatus(webhookEventId, "failed", {
        error: error instanceof Error ? error.message : "unknown_error",
        incrementRetry: true,
      }).catch(() => {
        // noop
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process webhook" },
      { status: 500 },
    );
  }
}

function extractInboundEventKey(payload: WhatsAppWebhookPayload): string | null {
  const ids = extractMessages(payload)
    .map((message) => String(message.id || "").trim())
    .filter((id) => id.length > 0)
    .slice(0, 10);

  if (ids.length === 0) {
    return null;
  }

  return ids.join("|");
}
