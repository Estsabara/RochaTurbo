import { getServiceSupabaseClient } from "@/lib/supabase/server";

interface LogWebhookEventInput {
  provider: string;
  eventType?: string | null;
  eventKey?: string | null;
  payload: Record<string, unknown>;
  headers?: Record<string, unknown>;
  status?: "received" | "queued" | "processed" | "failed" | "ignored";
}

export interface LoggedWebhookEvent {
  id: number;
  duplicate: boolean;
  existingStatus: "received" | "queued" | "processed" | "failed" | "ignored" | null;
}

export async function logWebhookEvent(input: LogWebhookEventInput): Promise<LoggedWebhookEvent> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("webhook_events")
    .insert({
      provider: input.provider,
      event_type: input.eventType ?? null,
      event_key: input.eventKey ?? null,
      status: input.status ?? "received",
      payload: input.payload,
      headers_json: input.headers ?? {},
    })
    .select("id")
    .single();

  if (!error && data?.id) {
    return { id: Number(data.id), duplicate: false, existingStatus: null };
  }

  if (error && String((error as { code?: string }).code) === "23505") {
    const baseQuery = supabase
      .from("webhook_events")
      .select("id,status")
      .eq("provider", input.provider)
      .order("received_at", { ascending: false })
      .limit(1);

    const { data: existing, error: existingError } = input.eventKey
      ? await baseQuery.eq("event_key", input.eventKey).maybeSingle()
      : await baseQuery.is("event_key", null).maybeSingle();

    if (existingError) throw existingError;
    if (!existing?.id) throw error;
    return {
      id: Number(existing.id),
      duplicate: true,
      existingStatus: String(existing.status ?? "") as LoggedWebhookEvent["existingStatus"],
    };
  }

  if (error) throw error;
  throw new Error("Failed to log webhook event");
}

export async function updateWebhookEventStatus(
  webhookEventId: number,
  status: "queued" | "processed" | "failed" | "ignored",
  options?: { error?: string | null; incrementRetry?: boolean },
): Promise<void> {
  const supabase = getServiceSupabaseClient();
  const nowIso = new Date().toISOString();

  const payload: Record<string, unknown> = {
    status,
    processed_at: status === "processed" || status === "failed" || status === "ignored" ? nowIso : null,
    error_text: options?.error ?? null,
  };

  if (options?.incrementRetry) {
    const { data: existing } = await supabase
      .from("webhook_events")
      .select("retry_count")
      .eq("id", webhookEventId)
      .maybeSingle();
    payload.retry_count = Number(existing?.retry_count ?? 0) + 1;
  }

  const { error } = await supabase.from("webhook_events").update(payload).eq("id", webhookEventId);
  if (error) throw error;
}

export async function logJobFailure(input: {
  queueName: string;
  jobName: string;
  jobId?: string | null;
  payload?: Record<string, unknown>;
  errorText: string;
  stack?: string | null;
}): Promise<void> {
  const supabase = getServiceSupabaseClient();
  const { error } = await supabase.from("job_failures").insert({
    queue_name: input.queueName,
    job_name: input.jobName,
    job_id: input.jobId ?? null,
    payload: input.payload ?? {},
    error_text: input.errorText,
    stack: input.stack ?? null,
  });

  if (error) throw error;
}
