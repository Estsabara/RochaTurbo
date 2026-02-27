import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { redeemCouponForUser, getUserEntitlement } from "@/lib/services/entitlements";
import { logAuditEvent } from "@/lib/services/audit";

const payloadSchema = z.object({
  user_id: z.string().uuid(),
  code: z.string().min(3),
  email: z.string().email().optional(),
  cnpj: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await assertAdminRequest(request);
    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    const result = await redeemCouponForUser({
      userId: parsed.user_id,
      code: parsed.code,
      email: parsed.email,
      cnpj: parsed.cnpj,
    });

    if (result.ok !== true) {
      return NextResponse.json({ error: result.error ?? "coupon_redeem_failed", result }, { status: 400 });
    }

    const entitlement = await getUserEntitlement(parsed.user_id);

    await logAuditEvent({
      actor: admin.actor,
      action: "redeem_coupon",
      entity: "coupon_redemptions",
      entityId: (result.redemption_id as string | undefined) ?? null,
      metadata: {
        user_id: parsed.user_id,
        coupon_code: parsed.code,
      },
    });

    return NextResponse.json({ ok: true, result, entitlement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to redeem coupon" },
      { status: 500 },
    );
  }
}
