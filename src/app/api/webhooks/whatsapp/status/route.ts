import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

interface WhatsAppStatusPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          id?: string;
          recipient_id?: string;
          status?: string;
        }>;
      };
    }>;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as WhatsAppStatusPayload;
    const supabase = getServiceSupabaseClient();
    const statuses = extractStatuses(payload);

    if (statuses.length > 0) {
      const rows = statuses.map((status) => ({
        wa_message_id: status.id,
        recipient_id: status.recipient_id,
        status: status.status,
        raw_payload: payload as Record<string, unknown>,
      }));
      const { error } = await supabase.from("message_status_events").insert(rows);
      if (error) throw error;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process status webhook" },
      { status: 500 },
    );
  }
}

function extractStatuses(payload: WhatsAppStatusPayload) {
  const result: Array<{ id: string; recipient_id: string | null; status: string }> = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (status.id && status.status) {
          result.push({
            id: status.id,
            recipient_id: status.recipient_id ?? null,
            status: status.status,
          });
        }
      }
    }
  }
  return result;
}
