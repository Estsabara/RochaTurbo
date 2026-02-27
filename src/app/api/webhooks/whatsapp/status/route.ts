import { NextRequest, NextResponse } from "next/server";
import {
  extractStatuses,
  processWhatsAppStatusPayload,
  type WhatsAppStatusPayload,
} from "@/lib/services/whatsapp-status-processor";
import { enqueueWhatsAppStatus } from "@/lib/queue/enqueue";
import { logWebhookEvent, updateWebhookEventStatus } from "@/lib/services/webhook-events";

export async function POST(request: NextRequest) {
  let webhookEventId: number | null = null;

  try {
    const payload = (await request.json()) as WhatsAppStatusPayload;
    const eventKey = extractStatusEventKey(payload);

    const logged = await logWebhookEvent({
      provider: "whatsapp_status",
      eventType: "message_status",
      eventKey,
      payload: (payload as Record<string, unknown>) ?? {},
      headers: {
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

    const queued = await enqueueWhatsAppStatus({
      webhookEventId,
      payload: (payload as Record<string, unknown>) ?? {},
    });

    if (queued) {
      await updateWebhookEventStatus(webhookEventId, "queued");
      return NextResponse.json({ received: true, queued: true }, { status: 202 });
    }

    await processWhatsAppStatusPayload(payload);
    await updateWebhookEventStatus(webhookEventId, "processed");

    return NextResponse.json({ received: true, queued: false });
  } catch (error) {
    console.error("[whatsapp/status] process failed", error);
    if (webhookEventId) {
      await updateWebhookEventStatus(webhookEventId, "failed", {
        error: error instanceof Error ? error.message : "unknown_error",
        incrementRetry: true,
      }).catch(() => {
        // noop
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process status webhook" },
      { status: 500 },
    );
  }
}

function extractStatusEventKey(payload: WhatsAppStatusPayload): string | null {
  const ids = extractStatuses(payload)
    .map((status) => String(status.id || "").trim())
    .filter((id) => id.length > 0)
    .slice(0, 10);

  if (ids.length === 0) {
    return null;
  }

  return ids.join("|");
}
