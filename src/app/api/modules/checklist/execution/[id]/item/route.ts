import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { updateChecklistExecutionItem } from "@/lib/services/checklists";

const payloadSchema = z.object({
  template_item_id: z.string().uuid(),
  answer: z.enum(["S", "N", "NA"]),
  comment_text: z.string().optional(),
  evidence_url: z.string().url().optional(),
});

interface ChecklistItemRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: ChecklistItemRouteContext) {
  try {
    await assertAdminRequest(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Execution id is required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    const execution = await updateChecklistExecutionItem({
      executionId: id,
      templateItemId: parsed.template_item_id,
      answer: parsed.answer,
      commentText: parsed.comment_text ?? null,
      evidenceUrl: parsed.evidence_url ?? null,
    });

    return NextResponse.json({ execution });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update checklist execution item" },
      { status: 500 },
    );
  }
}
