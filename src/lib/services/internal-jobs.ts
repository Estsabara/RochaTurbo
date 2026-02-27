import { getServiceSupabaseClient } from "@/lib/supabase/server";
import { refreshUserEntitlement } from "@/lib/services/entitlements";
import { sendWhatsAppTextMessage } from "@/lib/services/whatsapp";
import { logAuditEvent } from "@/lib/services/audit";
import type { InternalJobName } from "@/lib/queue/definitions";

export interface InternalJobResult {
  job: InternalJobName;
  ok: boolean;
  details: Record<string, unknown>;
}

export async function runInternalJob(job: InternalJobName): Promise<InternalJobResult> {
  switch (job) {
    case "retention":
      return runRetentionJob();
    case "dunning":
      return runDunningJob();
    case "subscription-renewal":
      return runSubscriptionRenewalJob();
    default:
      return {
        job,
        ok: false,
        details: { error: "Unknown job" },
      };
  }
}

async function runRetentionJob(): Promise<InternalJobResult> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.rpc("run_retention_cleanup");
  if (error) throw error;

  return {
    job: "retention",
    ok: true,
    details: {
      result: data,
    },
  };
}

async function runSubscriptionRenewalJob(): Promise<InternalJobResult> {
  const supabase = getServiceSupabaseClient();
  const { data: users, error } = await supabase.from("users").select("id").limit(1000);
  if (error) throw error;

  let refreshed = 0;
  for (const user of users ?? []) {
    await refreshUserEntitlement(String(user.id));
    refreshed += 1;
  }

  return {
    job: "subscription-renewal",
    ok: true,
    details: {
      refreshed,
    },
  };
}

async function runDunningJob(): Promise<InternalJobResult> {
  const supabase = getServiceSupabaseClient();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const { data: pendingPayments, error: pendingError } = await supabase
    .from("payments")
    .select("id, user_id, subscription_id, due_date, status")
    .in("status", ["pending", "overdue"])
    .not("due_date", "is", null)
    .lte("due_date", todayIso)
    .order("due_date", { ascending: true })
    .limit(200);

  if (pendingError) throw pendingError;

  let markedOverdue = 0;
  let remindersSent = 0;

  for (const payment of pendingPayments ?? []) {
    const userId = String(payment.user_id);

    if (String(payment.status) === "pending") {
      const { error: paymentUpdateError } = await supabase
        .from("payments")
        .update({ status: "overdue" })
        .eq("id", payment.id);
      if (paymentUpdateError) throw paymentUpdateError;
      markedOverdue += 1;
    }

    const { error: subscriptionUpdateError } = await supabase
      .from("subscriptions")
      .update({ status: "overdue" })
      .eq("user_id", userId);
    if (subscriptionUpdateError) throw subscriptionUpdateError;

    await refreshUserEntitlement(userId);

    const { data: user } = await supabase.from("users").select("phone_e164").eq("id", userId).maybeSingle();

    let sendStatus: "sent" | "failed" = "sent";
    try {
      if (user?.phone_e164) {
        await sendWhatsAppTextMessage({
          to: String(user.phone_e164),
          message:
            "Sua assinatura do Rocha Turbo esta em atraso. Regularize seu pagamento para reativar o acesso premium automaticamente.",
        });
        remindersSent += 1;
      }
    } catch {
      sendStatus = "failed";
    }

    await supabase.from("dunning_events").insert({
      user_id: userId,
      subscription_id: payment.subscription_id ?? null,
      payment_id: payment.id,
      stage: "overdue_notice",
      status: sendStatus,
      executed_at: new Date().toISOString(),
      channel: "whatsapp",
      metadata_json: {
        due_date: payment.due_date,
      },
    });
  }

  await logAuditEvent({
    actor: "internal_job",
    action: "dunning_run",
    entity: "dunning_events",
    entityId: null,
    metadata: {
      marked_overdue: markedOverdue,
      reminders_sent: remindersSent,
    },
  });

  return {
    job: "dunning",
    ok: true,
    details: {
      marked_overdue: markedOverdue,
      reminders_sent: remindersSent,
    },
  };
}
