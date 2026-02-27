import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { addSwotAnswer } from "@/lib/services/swot";

const payloadSchema = z.object({
  quadrant: z.enum(["strengths", "weaknesses", "opportunities", "threats"]),
  prompt: z.string().optional(),
  answer: z.string().min(2),
  weight: z.number().optional(),
});

interface SwotAnswerRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: SwotAnswerRouteContext) {
  try {
    await assertAdminRequest(request);
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Session id is required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    const answer = await addSwotAnswer({
      sessionId: id,
      quadrant: parsed.quadrant,
      prompt: parsed.prompt,
      answer: parsed.answer,
      weight: parsed.weight,
    });

    return NextResponse.json({ answer }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create SWOT answer" },
      { status: 500 },
    );
  }
}
