import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { cancelChatFlow, getChatFlowById } from "@/lib/services/chat-flows";

const paramsSchema = z.object({
  id: z.string().uuid(),
  flowId: z.string().uuid(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; flowId: string }> }) {
  try {
    await assertAdminRequest(request);
    const params = paramsSchema.parse(await context.params);
    const flow = await getChatFlowById(params.flowId);
    if (!flow || flow.user_id !== params.id) {
      return NextResponse.json({ error: "Flow not found for user" }, { status: 404 });
    }

    const canceled = await cancelChatFlow(params.flowId, "admin_cancel");
    return NextResponse.json({ flow: canceled });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid params", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel flow" },
      { status: 500 },
    );
  }
}

