import { getServiceSupabaseClient } from "@/lib/supabase/server";
import { generateModuleArtifact } from "@/lib/services/modules";

type SwotQuadrant = "strengths" | "weaknesses" | "opportunities" | "threats";

export async function createSwotSession(input: {
  userId: string;
  monthRef?: string | null;
  inputContext?: Record<string, unknown>;
}) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("swot_sessions")
    .insert({
      user_id: input.userId,
      month_ref: input.monthRef ?? null,
      input_context: input.inputContext ?? {},
      status: "draft",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function addSwotAnswer(input: {
  sessionId: string;
  quadrant: SwotQuadrant;
  prompt?: string | null;
  answer: string;
  weight?: number | null;
}) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("swot_answers")
    .insert({
      session_id: input.sessionId,
      quadrant: input.quadrant,
      prompt: input.prompt ?? null,
      answer: input.answer,
      weight: input.weight ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function finalizeSwotSession(input: { sessionId: string; requestedBy: string }) {
  const supabase = getServiceSupabaseClient();

  const { data: session, error: sessionError } = await supabase
    .from("swot_sessions")
    .select("*")
    .eq("id", input.sessionId)
    .single();

  if (sessionError) throw sessionError;

  const { data: answers, error: answersError } = await supabase
    .from("swot_answers")
    .select("quadrant, prompt, answer, weight")
    .eq("session_id", input.sessionId)
    .order("created_at", { ascending: true });

  if (answersError) throw answersError;

  const matrix = {
    strengths: (answers ?? []).filter((row) => row.quadrant === "strengths"),
    weaknesses: (answers ?? []).filter((row) => row.quadrant === "weaknesses"),
    opportunities: (answers ?? []).filter((row) => row.quadrant === "opportunities"),
    threats: (answers ?? []).filter((row) => row.quadrant === "threats"),
  };

  const plan = {
    priorities: [
      "Usar forcas para capturar oportunidades priorizadas",
      "Criar plano de mitigacao para fraquezas criticas",
      "Definir responsavel e prazo por acao",
    ],
    generated_at: new Date().toISOString(),
  };

  const { error: planError } = await supabase.from("swot_action_plan").upsert(
    {
      session_id: input.sessionId,
      plan_json: plan,
    },
    { onConflict: "session_id" },
  );

  if (planError) throw planError;

  const artifact = await generateModuleArtifact({
    userId: String(session.user_id),
    module: "swot",
    requestedBy: input.requestedBy,
    input: {
      swot_session_id: input.sessionId,
      month_ref: session.month_ref,
      context: session.input_context,
      matrix,
      action_plan: plan,
    },
  });

  const { data: updatedSession, error: updateError } = await supabase
    .from("swot_sessions")
    .update({
      status: "completed",
      matrix_json: matrix,
      summary_text: `SWOT concluida com ${answers?.length ?? 0} respostas e plano inicial gerado.`,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.sessionId)
    .select("*")
    .single();

  if (updateError) throw updateError;

  return {
    session: updatedSession,
    artifact,
  };
}
