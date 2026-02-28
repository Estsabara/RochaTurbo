import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { listChatFlowsByUser } from "@/lib/services/chat-flows";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertAdminRequest(request);
    const params = paramsSchema.parse(await context.params);
    const flows = await listChatFlowsByUser(params.id, 100);
    return NextResponse.json({ flows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid user id", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list chat flows" },
      { status: 500 },
    );
  }
}

