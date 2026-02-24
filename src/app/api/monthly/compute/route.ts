import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { computeAndUpsertMonthlyKpis, upsertMonthlyInput } from "@/lib/services/monthly";
import { monthlyInputSchema } from "@/lib/validation/monthly-input";

const payloadSchema = z.object({
  user_id: z.string().uuid(),
  month_ref: z.string().regex(/^\d{4}-\d{2}-01$/),
  source: z.enum(["chat", "form", "import"]).optional(),
  input_data: monthlyInputSchema,
});

export async function POST(request: NextRequest) {
  try {
    assertAdminRequest(request);
    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    await upsertMonthlyInput(parsed.user_id, parsed.month_ref, parsed.input_data, parsed.source);
    const computed = await computeAndUpsertMonthlyKpis(parsed.user_id, parsed.month_ref, parsed.input_data);

    return NextResponse.json(computed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute monthly KPIs" },
      { status: 500 },
    );
  }
}
