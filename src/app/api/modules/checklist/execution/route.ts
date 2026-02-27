import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { completeChecklistExecution, createChecklistExecution } from "@/lib/services/checklists";

const payloadSchema = z.object({
  template_id: z.string().uuid(),
  user_id: z.string().uuid(),
  executed_by: z.string().optional(),
  shift: z.string().optional(),
  complete: z.boolean().optional(),
  answers: z
    .array(
      z.object({
        template_item_id: z.string().uuid(),
        answer: z.enum(["S", "N", "NA"]),
        comment_text: z.string().optional(),
        evidence_url: z.string().url().optional(),
      }),
    )
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    await assertAdminRequest(request);
    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    const execution = await createChecklistExecution({
      templateId: parsed.template_id,
      userId: parsed.user_id,
      executedBy: parsed.executed_by,
      shift: parsed.shift,
      answers: parsed.answers,
    });

    if (parsed.complete) {
      const completed = await completeChecklistExecution(String(execution.id), parsed.executed_by);
      return NextResponse.json({ execution: completed });
    }

    return NextResponse.json({ execution }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create checklist execution" },
      { status: 500 },
    );
  }
}
