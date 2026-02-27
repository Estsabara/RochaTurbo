import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { getUserEntitlement } from "@/lib/services/entitlements";

const querySchema = z.object({
  user_id: z.string().uuid(),
  refresh: z.enum(["0", "1"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await assertAdminRequest(request);

    const parsed = querySchema.parse({
      user_id: request.nextUrl.searchParams.get("user_id"),
      refresh: request.nextUrl.searchParams.get("refresh") ?? undefined,
    });

    const entitlement = await getUserEntitlement(parsed.user_id, {
      refresh: parsed.refresh === "1",
    });

    return NextResponse.json({ entitlement });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid query", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch entitlement" },
      { status: 500 },
    );
  }
}
