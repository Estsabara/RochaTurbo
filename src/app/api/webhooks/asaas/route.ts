import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { mapAsaasPaymentStatus } from "@/lib/services/asaas";
import { logAuditEvent } from "@/lib/services/audit";
import { updateSubscriptionStatus, upsertPayment } from "@/lib/services/subscriptions";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import { sendWhatsAppTextMessage } from "@/lib/services/whatsapp";

const asaasWebhookSchema = z.object({
  event: z.string(),
  payment: z
    .object({
      id: z.string(),
      status: z.string(),
      value: z.number().optional(),
      dueDate: z.string().optional(),
      paymentDate: z.string().nullable().optional(),
      invoiceUrl: z.string().nullable().optional(),
      invoiceNumber: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      billingType: z.string().nullable().optional(),
      externalReference: z.string().nullable().optional(),
      customer: z.string().optional(),
      pixTransaction: z
        .object({
          qrCode: z
            .object({
              payload: z.string().nullable().optional(),
            })
            .nullable()
            .optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const env = getServerEnv();
    const token = request.headers.get("asaas-access-token");
    if (env.ASAAS_WEBHOOK_TOKEN && token !== env.ASAAS_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: "Invalid webhook token" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = asaasWebhookSchema.parse(body);

    if (!parsed.payment) {
      return NextResponse.json({ received: true, ignored: true });
    }

    const paymentStatus = mapAsaasPaymentStatus(parsed.payment.status);
    const supabase = getServiceSupabaseClient();

    let userId: string | null = parsed.payment.externalReference ?? null;
    if (!userId) {
      const { data: paymentLookup } = await supabase
        .from("payments")
        .select("user_id, subscription_id")
        .eq("asaas_payment_id", parsed.payment.id)
        .maybeSingle();
      userId = (paymentLookup?.user_id as string | undefined) ?? null;
    }

    if (!userId) {
      await logAuditEvent({
        actor: "asaas_webhook",
        action: "payment_without_user_reference",
        entity: "payments",
        entityId: parsed.payment.id,
        metadata: { event: parsed.event, payload: body as Record<string, unknown> },
      });
      return NextResponse.json({ received: true, ignored: true });
    }

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    await upsertPayment({
      userId,
      subscriptionId: (subscription?.id as string | undefined) ?? null,
      asaasPaymentId: parsed.payment.id,
      asaasInvoiceNumber: parsed.payment.invoiceNumber ?? null,
      invoiceUrl: parsed.payment.invoiceUrl ?? null,
      pixPayload: parsed.payment.pixTransaction?.qrCode?.payload ?? null,
      method: parsed.payment.billingType ?? "UNDEFINED",
      amountCents: parsed.payment.value ? Math.round(parsed.payment.value * 100) : null,
      dueDate: parsed.payment.dueDate ?? null,
      status: paymentStatus,
      paidAt: parsed.payment.paymentDate ?? null,
      metadata: {
        event: parsed.event,
        asaas_status: parsed.payment.status,
      },
    });

    const subscriptionStatus =
      paymentStatus === "received"
        ? "active"
        : paymentStatus === "overdue"
          ? "overdue"
          : "pending_payment";

    await updateSubscriptionStatus(userId, subscriptionStatus);

    if (paymentStatus === "received") {
      const { data: user } = await supabase
        .from("users")
        .select("phone_e164")
        .eq("id", userId)
        .maybeSingle();
      if (user?.phone_e164) {
        await sendWhatsAppTextMessage({
          to: String(user.phone_e164),
          message:
            "Pagamento confirmado. Seu acesso ao Rocha Turbo foi liberado. " +
            "Se precisar, envie sua pergunta e eu sigo com o atendimento.",
        });
      }
    }

    await logAuditEvent({
      actor: "asaas_webhook",
      action: "payment_status_update",
      entity: "payments",
      entityId: parsed.payment.id,
      metadata: {
        event: parsed.event,
        user_id: userId,
        payment_status: paymentStatus,
      },
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}
