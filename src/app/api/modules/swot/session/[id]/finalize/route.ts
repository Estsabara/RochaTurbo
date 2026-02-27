import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { finalizeSwotSession } from "@/lib/services/swot";
import { logAuditEvent } from "@/lib/services/audit";

interface SwotFinalizeRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: SwotFinalizeRouteContext) {
  try {
    const admin = await assertAdminRequest(request);
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Session id is required" }, { status: 400 });
    }

    const result = await finalizeSwotSession({
      sessionId: id,
      requestedBy: admin.actor,
    });

    await logAuditEvent({
      actor: admin.actor,
      action: "finalize_swot_session",
      entity: "swot_sessions",
      entityId: id,
      metadata: {
        artifact_file_id: result.artifact.file.id,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to finalize SWOT session" },
      { status: 500 },
    );
  }
}
