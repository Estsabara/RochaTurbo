import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { generateModuleArtifact } from "@/lib/services/modules";
import { logAuditEvent } from "@/lib/services/audit";

const payloadSchema = z.object({
  user_id: z.string().uuid(),
  input: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await assertAdminRequest(request);
    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    const artifact = await generateModuleArtifact({
      userId: parsed.user_id,
      module: "marketing",
      requestedBy: admin.actor,
      input: parsed.input,
    });

    await logAuditEvent({
      actor: admin.actor,
      action: "generate_module_marketing",
      entity: "module_runs",
      entityId: String(artifact.run.id ?? ""),
      metadata: {
        user_id: parsed.user_id,
      },
    });

    return NextResponse.json({ run: artifact.run, file: artifact.file });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate marketing" },
      { status: 500 },
    );
  }
}
