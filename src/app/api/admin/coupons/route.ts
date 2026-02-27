import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/services/audit";

const createSchema = z.object({
  code: z.string().min(3).max(60),
  description: z.string().max(240).optional(),
  free_days: z.number().int().min(1).max(365),
  expires_at: z.string().datetime().optional(),
  usage_limit: z.number().int().min(1).max(1_000_000).optional(),
  allow_existing_accounts: z.boolean().optional(),
  restricted_email: z.string().email().optional(),
  restricted_cnpj: z.string().optional(),
  is_active: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await assertAdminRequest(request);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "100");

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100);

    if (error) throw error;
    return NextResponse.json({ coupons: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list coupons" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await assertAdminRequest(request);
    const body = await request.json();
    const parsed = createSchema.parse(body);

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from("coupons")
      .insert({
        code: parsed.code.trim().toUpperCase(),
        description: parsed.description ?? null,
        free_days: parsed.free_days,
        expires_at: parsed.expires_at ?? null,
        usage_limit: parsed.usage_limit ?? null,
        allow_existing_accounts: parsed.allow_existing_accounts ?? false,
        restricted_email: parsed.restricted_email ?? null,
        restricted_cnpj: parsed.restricted_cnpj ?? null,
        is_active: parsed.is_active ?? true,
        metadata_json: parsed.metadata ?? {},
        created_by: admin.actor,
      })
      .select("*")
      .single();

    if (error) throw error;

    await logAuditEvent({
      actor: admin.actor,
      action: "create_coupon",
      entity: "coupons",
      entityId: String(data.id),
      metadata: {
        code: data.code,
        free_days: data.free_days,
      },
    });

    return NextResponse.json({ coupon: data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create coupon" },
      { status: 500 },
    );
  }
}
