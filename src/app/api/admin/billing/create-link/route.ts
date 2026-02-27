import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { normalizeCpf } from "@/lib/security/cpf";
import { createAsaasBillingLink, mapAsaasPaymentStatus } from "@/lib/services/asaas";
import { logAuditEvent } from "@/lib/services/audit";
import { refreshUserEntitlement } from "@/lib/services/entitlements";
import { upsertPayment, getOrCreateSubscription, updateSubscriptionStatus } from "@/lib/services/subscriptions";
import { sendWhatsAppTextMessage } from "@/lib/services/whatsapp";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

const payloadSchema = z.object({
  user_id: z.string().uuid(),
  amount_brl: z.number().positive(),
  description: z.string().min(3).max(140),
  due_in_days: z.number().int().min(1).max(30).optional(),
  send_via_whatsapp: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await assertAdminRequest(request);
    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    const supabase = getServiceSupabaseClient();
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, name, phone_e164, cpf_encrypted")
      .eq("id", parsed.user_id)
      .single();
    if (userError) throw userError;

    const cpf = normalizeCpf(String(user.cpf_encrypted ?? ""));
    if (!cpf) {
      return NextResponse.json(
        { error: "Usuario sem CPF legivel. Atualize cpf_encrypted para gerar cobranca." },
        { status: 400 },
      );
    }

    const subscription = await getOrCreateSubscription(parsed.user_id);
    const billing = await createAsaasBillingLink({
      customerName: String(user.name),
      customerCpfCnpj: cpf,
      customerPhone: String(user.phone_e164),
      value: parsed.amount_brl,
      description: parsed.description,
      dueInDays: parsed.due_in_days,
      externalReference: parsed.user_id,
    });

    const paymentStatus = mapAsaasPaymentStatus(billing.status);
    const payment = await upsertPayment({
      userId: parsed.user_id,
      subscriptionId: String(subscription.id),
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
      },
    });

    await updateSubscriptionStatus(parsed.user_id, "pending_payment");
    await refreshUserEntitlement(parsed.user_id);

    if (parsed.send_via_whatsapp && billing.invoiceUrl) {
      await sendWhatsAppTextMessage({
        to: String(user.phone_e164),
        message:
          `Seu acesso ao Rocha Turbo esta pendente de pagamento.\n` +
          `Link para pagamento: ${billing.invoiceUrl}\n` +
          `Assim que confirmado, o acesso sera liberado automaticamente.`,
      });
    }

    await logAuditEvent({
      actor: admin.actor,
      action: "create_billing_link",
      entity: "payments",
      entityId: String(payment.id),
      metadata: {
        user_id: parsed.user_id,
        asaas_payment_id: billing.asaasPaymentId,
        amount_brl: parsed.amount_brl,
      },
    });

    return NextResponse.json({
      payment,
      invoice_url: billing.invoiceUrl,
      pix_payload: billing.pixPayload,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create billing link" },
      { status: 500 },
    );
  }
}
