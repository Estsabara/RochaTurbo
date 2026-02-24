import type { PaymentStatus, SubscriptionStatus } from "@/lib/types/domain";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

export async function getOrCreateSubscription(userId: string) {
  const supabase = getServiceSupabaseClient();
  const { data: existing, error: getError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (getError) throw getError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      status: "inactive",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export function isSubscriptionActive(status: SubscriptionStatus | null | undefined): boolean {
  return status === "active";
}

interface UpsertPaymentInput {
  userId: string;
  subscriptionId?: string | null;
  asaasPaymentId: string;
  asaasInvoiceNumber?: string | null;
  invoiceUrl?: string | null;
  pixPayload?: string | null;
  method?: string | null;
  amountCents?: number | null;
  dueDate?: string | null;
  status: PaymentStatus;
  paidAt?: string | null;
  metadata?: Record<string, unknown>;
}

export async function upsertPayment(input: UpsertPaymentInput) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("payments")
    .upsert(
      {
        user_id: input.userId,
        subscription_id: input.subscriptionId ?? null,
        asaas_payment_id: input.asaasPaymentId,
        asaas_invoice_number: input.asaasInvoiceNumber ?? null,
        invoice_url: input.invoiceUrl ?? null,
        pix_payload: input.pixPayload ?? null,
        method: input.method ?? null,
        amount_cents: input.amountCents ?? null,
        due_date: input.dueDate ?? null,
        status: input.status,
        paid_at: input.paidAt ?? null,
        metadata_json: input.metadata ?? {},
      },
      { onConflict: "asaas_payment_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateSubscriptionStatus(userId: string, status: SubscriptionStatus) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .update({
      status,
    })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
