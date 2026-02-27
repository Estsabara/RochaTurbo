import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminRequest } from "@/lib/http/admin-auth";
import { createChecklistTemplateFromInput, generateModuleArtifact } from "@/lib/services/modules";
import { logAuditEvent } from "@/lib/services/audit";

const payloadSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string().min(3).max(180),
  description: z.string().max(1000).optional(),
  periodicity: z.string().max(60).optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  items: z
    .array(
      z.object({
        label: z.string().min(2),
        category: z.string().optional(),
        is_critical: z.boolean().optional(),
      }),
    )
    .optional(),
});

function getDefaultItems(name: string) {
  return [
    { label: `Apresentacao da equipe (${name})`, category: "atendimento", is_critical: true },
    { label: "Conferencia de itens de seguranca", category: "seguranca", is_critical: true },
    { label: "Padrao de abordagem ao cliente", category: "atendimento", is_critical: false },
    { label: "Oferta de servicos adicionais", category: "vendas", is_critical: false },
    { label: "Fechamento com conferencias finais", category: "operacao", is_critical: true },
  ];
}

export async function POST(request: NextRequest) {
  try {
    const admin = await assertAdminRequest(request);
    const body = await request.json();
    const parsed = payloadSchema.parse(body);

    const artifact = await generateModuleArtifact({
      userId: parsed.user_id,
      module: "checklist",
      requestedBy: admin.actor,
      input: {
        ...parsed.input,
        checklist_name: parsed.name,
        description: parsed.description ?? null,
        periodicity: parsed.periodicity ?? null,
      },
    });

    const template = await createChecklistTemplateFromInput({
      userId: parsed.user_id,
      moduleRunId: String(artifact.run.id),
      name: parsed.name,
      description: parsed.description ?? null,
      periodicity: parsed.periodicity ?? null,
      items: parsed.items ?? getDefaultItems(parsed.name),
    });

    await logAuditEvent({
      actor: admin.actor,
      action: "generate_module_checklist",
      entity: "checklist_templates",
      entityId: template.templateId,
      metadata: {
        user_id: parsed.user_id,
        module_run_id: artifact.run.id,
      },
    });

    return NextResponse.json({
      run: artifact.run,
      file: artifact.file,
      template_id: template.templateId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate checklist" },
      { status: 500 },
    );
  }
}
