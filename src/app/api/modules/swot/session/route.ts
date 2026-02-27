import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { createSwotSession } from "@/lib/services/swot";

const payloadSchema = z.object({
  user_id: z.string().uuid(),
  month_ref: z.string().regex(/^\d{4}-\d{2}-01$/).optional(),
  input_context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await assertAdminRequest(request);
    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    const session = await createSwotSession({
      userId: parsed.user_id,
      monthRef: parsed.month_ref ?? null,
      inputContext: parsed.input_context,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create SWOT session" },
      { status: 500 },
    );
  }
}
