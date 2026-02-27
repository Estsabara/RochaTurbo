import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";

const patchSchema = z
  .object({
    description: z.string().max(240).nullable().optional(),
    free_days: z.number().int().min(1).max(365).optional(),
    expires_at: z.string().datetime().nullable().optional(),
    usage_limit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    allow_existing_accounts: z.boolean().optional(),
    restricted_email: z.string().email().nullable().optional(),
    restricted_cnpj: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

interface CouponRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: CouponRouteContext) {
  try {
    const admin = await assertAdminRequest(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Coupon id is required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = patchSchema.parse(body);

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.description !== undefined) updatePayload.description = parsed.description;
    if (parsed.free_days !== undefined) updatePayload.free_days = parsed.free_days;
    if (parsed.expires_at !== undefined) updatePayload.expires_at = parsed.expires_at;
    if (parsed.usage_limit !== undefined) updatePayload.usage_limit = parsed.usage_limit;
    if (parsed.allow_existing_accounts !== undefined) {
      updatePayload.allow_existing_accounts = parsed.allow_existing_accounts;
    }
    if (parsed.restricted_email !== undefined) updatePayload.restricted_email = parsed.restricted_email;
    if (parsed.restricted_cnpj !== undefined) updatePayload.restricted_cnpj = parsed.restricted_cnpj;
    if (parsed.is_active !== undefined) updatePayload.is_active = parsed.is_active;
    if (parsed.metadata !== undefined) updatePayload.metadata_json = parsed.metadata;

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from("coupons")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    await logAuditEvent({
      actor: admin.actor,
      action: "update_coupon",
      entity: "coupons",
      entityId: String(id),
      metadata: {
        fields: Object.keys(updatePayload),
      },
    });

    return NextResponse.json({ coupon: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update coupon" },
      { status: 500 },
    );
  }
}
