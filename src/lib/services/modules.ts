import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import type { ModuleType } from "@/lib/types/domain";

interface GenerateModuleRunInput {
  userId: string;
  module: ModuleType;
  requestedBy: string;
  input: Record<string, unknown>;
}

interface GeneratedArtifact {
  run: Record<string, unknown>;
  file: Record<string, unknown>;
  content: string;
}

interface ModuleSection {
  heading: string;
  requirement: string;
}

interface ModuleSpec {
  title: string;
  objective: string;
  sections: ModuleSection[];
}

const MODULE_SPECS: Record<ModuleType, ModuleSpec> = {
  padrao: {
    title: "Padrao de Atendimento",
    objective: "Definir padrao operacional de chegada, atendimento e saida com foco em indicadores escolhidos.",
    sections: [
      { heading: "Objetivo e Escopo", requirement: "Contexto do posto, indicadores escolhidos e publico-alvo." },
      { heading: "Diagnostico Inicial", requirement: "Resumo do cenario atual e gargalos." },
      { heading: "Chegada", requirement: "Condutas de acolhimento, postura, sinalizacao e imagem profissional." },
      { heading: "Atendimento", requirement: "Fluxo operacional, scripts e tecnicas de venda eticas." },
      { heading: "Saida", requirement: "Ritual de despedida e orientacoes finais ao cliente." },
      { heading: "Checklist de Auditoria", requirement: "Itens observaveis para monitorar aderencia ao padrao." },
      { heading: "Plano de Implantacao 30 Dias", requirement: "Acoes semanais, responsaveis e rotina de acompanhamento." },
    ],
  },
  checklist: {
    title: "Checklist Operacional",
    objective: "Montar checklist pronto para execucao de qualidade (ombro a ombro) ou custom.",
    sections: [
      { heading: "Objetivo e Escopo", requirement: "Definicao de area, periodicidade e proposito." },
      { heading: "Estrutura do Checklist", requirement: "Tabela com itens, criterio de avaliacao e criticidade." },
      { heading: "Ritmo de Execucao", requirement: "Frequencia recomendada e volume de avaliacoes." },
      { heading: "Metodo de Pontuacao", requirement: "Calculo de aderencia e interpretacao dos resultados." },
      { heading: "Plano de Correcao", requirement: "Acoes para itens NAO conformes com prazo e responsavel." },
    ],
  },
  promocao: {
    title: "Plano de Promocao",
    objective: "Criar promocao viavel com objetivo comercial claro e mensuracao.",
    sections: [
      { heading: "Objetivo Comercial", requirement: "KPI principal e criterio de sucesso." },
      { heading: "Mecanica da Promocao", requirement: "Regra, periodo, publico e oferta." },
      { heading: "Plano de Comunicacao", requirement: "Canais, mensagens e orientacao para pista/equipe." },
      { heading: "Riscos e Viabilidade", requirement: "Pontos de atencao financeiro-operacionais." },
      { heading: "Mensuracao de Resultado", requirement: "CAC, conversao e resultado financeiro com rotina de acompanhamento." },
      { heading: "Proximos Passos", requirement: "Checklist de lancamento e ajustes semanais." },
    ],
  },
  kpi: {
    title: "Plano de Indicadores (KPI)",
    objective: "Estruturar indicadores acionaveis com metodo de analise e governanca.",
    sections: [
      { heading: "Objetivo e Escopo", requirement: "Processos monitorados e dor principal." },
      { heading: "Indicadores Recomendados", requirement: "KPI com formula, meta e periodicidade." },
      { heading: "Metodo de Analise", requirement: "Aplicacao pratica de Pareto, Ishikawa, etc." },
      { heading: "Plano de Coleta", requirement: "Origem de dados, responsavel e cadencia." },
      { heading: "Ritual de Gestao", requirement: "Rotina de revisao e gatilhos de acao corretiva." },
    ],
  },
  marketing: {
    title: "Plano de Marketing 12 Meses",
    objective: "Criar plano editorial para Instagram e WhatsApp com foco em conversao operacional.",
    sections: [
      { heading: "Posicionamento e Persona", requirement: "Perfil do cliente, diferencial e tom de voz." },
      { heading: "Calendario Editorial (12 Meses)", requirement: "1 post e 1 reels por semana por 12 meses." },
      { heading: "Plano de Conteudo por Pilar", requirement: "Educacao, prova social, oferta e relacionamento." },
      { heading: "Copys e Scripts", requirement: "Textos prontos para post e roteiro de reels/stories." },
      { heading: "Matriz de Datas e Sazonalidade", requirement: "Ajustes por datas e picos de demanda." },
      { heading: "Metrica e Otimizacao", requirement: "KPI de alcance, engajamento e conversao com rotina de ajuste." },
      { heading: "Observacao sobre Artes", requirement: "Informar que a versao V1 nao gera artes automaticamente." },
    ],
  },
  swot: {
    title: "Analise SWOT (FOFA)",
    objective: "Consolidar matriz SWOT e plano de acao mensal.",
    sections: [
      { heading: "Contexto do Mes", requirement: "Resumo do cenario atual do posto." },
      { heading: "Matriz SWOT", requirement: "Forcas, Fraquezas, Oportunidades e Ameacas organizadas." },
      { heading: "Leituras Estrategicas", requirement: "Cruzar quadrantes e priorizar frentes." },
      { heading: "Plano de Acao", requirement: "Acoes com responsaveis, prazos e indicador de sucesso." },
      { heading: "Riscos e Mitigacoes", requirement: "Ameacas criticas e resposta planejada." },
      { heading: "Revisao Proximo Mes", requirement: "Checklist de acompanhamento mensal." },
    ],
  },
  compliance: {
    title: "Plano de Compliance",
    objective: "Organizar roteiro de conformidade operacional e regulatoria.",
    sections: [
      { heading: "Escopo de Compliance", requirement: "Ambitos e prioridades da unidade." },
      { heading: "Matriz de Requisitos", requirement: "Itens normativos e evidencias esperadas." },
      { heading: "Plano de Adequacao", requirement: "Acoes corretivas com prazos e responsaveis." },
      { heading: "Ritual de Auditoria", requirement: "Frequencia e governanca de revisao." },
    ],
  },
};

let openaiClient: OpenAI | null = null;

function getOpenAiClientOrNull(): OpenAI | null {
  if (openaiClient) return openaiClient;
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) return null;
  openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openaiClient;
}

async function buildModuleContent(module: ModuleType, input: Record<string, unknown>): Promise<string> {
  const spec = MODULE_SPECS[module];
  const client = getOpenAiClientOrNull();
  if (!client) {
    return buildFallbackContent(spec, input);
  }

  const maxAttempts = 2;
  let previousMissing: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Voce e a R.Ai do Rocha Turbo. Gere documento tecnico e pratico, em portugues-BR, para uso imediato em operacao de posto. " +
            "Seja objetivo, evite generalidades e entregue passos acionaveis.",
        },
        {
          role: "user",
          content: buildModulePrompt(spec, input, previousMissing),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    const missingHeadings = validateModuleContent(content, spec);
    if (missingHeadings.length === 0) {
      return content;
    }
    previousMissing = missingHeadings;
  }

  return buildFallbackContent(spec, input, previousMissing);
}

function buildModulePrompt(spec: ModuleSpec, input: Record<string, unknown>, missingHeadings: string[]): string {
  const requiredHeadings = spec.sections.map((section) => `## ${section.heading}`).join("\n");
  const sectionChecklist = spec.sections
    .map((section, index) => `${index + 1}. ${section.heading}: ${section.requirement}`)
    .join("\n");
  const correctionNote =
    missingHeadings.length > 0
      ? `\nIMPORTANTE: na tentativa anterior faltaram as secoes: ${missingHeadings.join(", ")}. Inclua todas agora.`
      : "";

  return [
    `Titulo do documento: ${spec.title}`,
    `Objetivo: ${spec.objective}`,
    "",
    "Regras obrigatorias:",
    "- Entregar em Markdown.",
    "- Usar exatamente os titulos abaixo (nivel ##):",
    requiredHeadings,
    "- Cada secao deve conter orientacoes praticas, passos e observacoes operacionais.",
    "- Se algum dado nao foi informado, assumir como pendente e indicar claramente o que falta.",
    correctionNote,
    "",
    "Checklist de conteudo minimo por secao:",
    sectionChecklist,
    "",
    "Entrada JSON:",
    "```json",
    JSON.stringify(input, null, 2),
    "```",
  ].join("\n");
}

function validateModuleContent(content: string, spec: ModuleSpec): string[] {
  const missing: string[] = [];
  for (const section of spec.sections) {
    const escaped = escapeRegExp(section.heading);
    const regex = new RegExp(`^##\\s+${escaped}\\s*$`, "im");
    if (!regex.test(content)) {
      missing.push(section.heading);
    }
  }
  return missing;
}

function buildFallbackContent(spec: ModuleSpec, input: Record<string, unknown>, missingHeadings: string[] = []): string {
  const lines: string[] = [
    `# ${spec.title}`,
    "",
    `Objetivo: ${spec.objective}`,
    "",
  ];

  for (const section of spec.sections) {
    lines.push(`## ${section.heading}`);
    lines.push(section.requirement);
    lines.push("- Acao recomendada 1: mapear situacao atual.");
    lines.push("- Acao recomendada 2: definir responsavel e prazo.");
    lines.push("- Acao recomendada 3: medir resultado e revisar semanalmente.");
    lines.push("");
  }

  if (missingHeadings.length > 0) {
    lines.push("## Ajustes de Validacao");
    lines.push(`As secoes ${missingHeadings.join(", ")} foram adicionadas no fallback para garantir completude.`);
    lines.push("");
  }

  lines.push("## Entrada Coletada");
  lines.push("```json");
  lines.push(JSON.stringify(input, null, 2));
  lines.push("```");
  return lines.join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function generateModuleArtifact(input: GenerateModuleRunInput): Promise<GeneratedArtifact> {
  const supabase = getServiceSupabaseClient();

  const { data: run, error: runError } = await supabase
    .from("module_runs")
    .insert({
      user_id: input.userId,
      requested_by: input.requestedBy,
      module: input.module,
      status: "processing",
      input_json: input.input,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (runError) throw runError;

  try {
    const content = await buildModuleContent(input.module, input.input);
    const env = getServerEnv();
    const storageBucket = env.MODULE_FILES_BUCKET;
    const runId = String(run.id);
    const fileName = `${input.module}-${runId}.md`;
    const storagePath = `${input.userId}/${input.module}/${runId}/${fileName}`;

    const bytes = Buffer.from(content, "utf-8");
    const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, bytes, {
      contentType: "text/markdown; charset=utf-8",
      upsert: true,
    });

    if (uploadError) throw uploadError;

    const { data: generatedFile, error: generatedFileError } = await supabase
      .from("generated_files")
      .insert({
        module_run_id: runId,
        user_id: input.userId,
        file_name: fileName,
        content_type: "text/markdown",
        storage_bucket: storageBucket,
        storage_path: storagePath,
        size_bytes: bytes.length,
      })
      .select("*")
      .single();

    if (generatedFileError) throw generatedFileError;

    const { data: completedRun, error: completeError } = await supabase
      .from("module_runs")
      .update({
        status: "completed",
        output_json: {
          file_id: generatedFile.id,
          file_name: fileName,
          storage_path: storagePath,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .select("*")
      .single();

    if (completeError) throw completeError;

    return {
      run: (completedRun as Record<string, unknown>) ?? {},
      file: (generatedFile as Record<string, unknown>) ?? {},
      content,
    };
  } catch (error) {
    await supabase
      .from("module_runs")
      .update({
        status: "failed",
        error_text: error instanceof Error ? error.message : "unknown_error",
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    throw error;
  }
}

export async function createChecklistTemplateFromInput(input: {
  userId: string;
  moduleRunId: string;
  name: string;
  description?: string | null;
  periodicity?: string | null;
  items: Array<{ label: string; category?: string | null; is_critical?: boolean }>;
}): Promise<{ templateId: string }> {
  const supabase = getServiceSupabaseClient();

  const { data: template, error: templateError } = await supabase
    .from("checklist_templates")
    .insert({
      user_id: input.userId,
      module_run_id: input.moduleRunId,
      name: input.name,
      description: input.description ?? null,
      periodicity: input.periodicity ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (templateError) throw templateError;

  const rows = input.items.map((item, index) => ({
    template_id: template.id,
    item_order: index,
    category: item.category ?? null,
    label: item.label,
    is_critical: item.is_critical ?? false,
  }));

  const { error: itemError } = await supabase.from("checklist_template_items").insert(rows);
  if (itemError) throw itemError;

  return { templateId: String(template.id) };
}

export async function getGeneratedFileSignedUrl(fileId: string, expiresInSeconds = 60 * 60 * 24 * 7) {
  const supabase = getServiceSupabaseClient();
  const { data: file, error: fileError } = await supabase
    .from("generated_files")
    .select("storage_bucket, storage_path")
    .eq("id", fileId)
    .single();

  if (fileError) throw fileError;

  const { data, error } = await supabase.storage
    .from(String(file.storage_bucket))
    .createSignedUrl(String(file.storage_path), expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}
