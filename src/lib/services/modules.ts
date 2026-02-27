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

let openaiClient: OpenAI | null = null;

function getOpenAiClientOrNull(): OpenAI | null {
  if (openaiClient) return openaiClient;
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) return null;
  openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return openaiClient;
}

async function buildModuleContent(module: ModuleType, input: Record<string, unknown>): Promise<string> {
  const client = getOpenAiClientOrNull();
  if (!client) {
    return [
      `# Documento ${module}`,
      "",
      "Gerado em modo fallback (sem OPENAI_API_KEY).",
      "",
      "## Entrada",
      "```json",
      JSON.stringify(input, null, 2),
      "```",
    ].join("\n");
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "Voce e a R.Ai do Rocha Turbo. Gere material pratico, em portugues-BR, direto e estruturado para postos de combustiveis. " +
          "O output deve ser util para execucao em campo e conter checklists, passos, metas e observacoes quando aplicavel.",
      },
      {
        role: "user",
        content:
          `Modulo: ${module}\n` +
          "Gere um documento completo em Markdown com secoes objetivas, plano de acao e proximos passos.\n" +
          "Entrada JSON:\n```json\n" +
          `${JSON.stringify(input, null, 2)}\n` +
          "```",
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || "Nao foi possivel gerar conteudo agora.";
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

  const { data, error } = await supabase
    .storage
    .from(String(file.storage_bucket))
    .createSignedUrl(String(file.storage_path), expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}
