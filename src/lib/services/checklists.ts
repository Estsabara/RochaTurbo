import { getServiceSupabaseClient } from "@/lib/supabase/server";

export async function createChecklistExecution(input: {
  templateId: string;
  userId: string;
  executedBy?: string | null;
  shift?: string | null;
  answers?: Array<{
    template_item_id: string;
    answer: "S" | "N" | "NA";
    comment_text?: string;
    evidence_url?: string;
  }>;
}) {
  const supabase = getServiceSupabaseClient();

  const { data: execution, error: executionError } = await supabase
    .from("checklist_executions")
    .insert({
      template_id: input.templateId,
      user_id: input.userId,
      executed_by: input.executedBy ?? null,
      shift: input.shift ?? null,
      status: "in_progress",
    })
    .select("*")
    .single();

  if (executionError) throw executionError;

  if (input.answers && input.answers.length > 0) {
    const rows = input.answers.map((item) => ({
      execution_id: execution.id,
      template_item_id: item.template_item_id,
      answer: item.answer,
      comment_text: item.comment_text ?? null,
      evidence_url: item.evidence_url ?? null,
    }));

    const { error: answersError } = await supabase.from("checklist_execution_items").insert(rows);
    if (answersError) throw answersError;

    await recalculateChecklistExecution(String(execution.id));
  }

  return execution;
}

export async function updateChecklistExecutionItem(input: {
  executionId: string;
  templateItemId: string;
  answer: "S" | "N" | "NA";
  commentText?: string | null;
  evidenceUrl?: string | null;
}) {
  const supabase = getServiceSupabaseClient();

  const { error } = await supabase.from("checklist_execution_items").upsert(
    {
      execution_id: input.executionId,
      template_item_id: input.templateItemId,
      answer: input.answer,
      comment_text: input.commentText ?? null,
      evidence_url: input.evidenceUrl ?? null,
    },
    { onConflict: "execution_id,template_item_id" },
  );

  if (error) throw error;

  return recalculateChecklistExecution(input.executionId);
}

export async function completeChecklistExecution(executionId: string, signedBy?: string | null) {
  const supabase = getServiceSupabaseClient();
  await recalculateChecklistExecution(executionId);

  const { data, error } = await supabase
    .from("checklist_executions")
    .update({
      status: "completed",
      signed_at: new Date().toISOString(),
      executed_by: signedBy ?? undefined,
      executed_at: new Date().toISOString(),
    })
    .eq("id", executionId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function recalculateChecklistExecution(executionId: string) {
  const supabase = getServiceSupabaseClient();

  const { data: items, error: itemsError } = await supabase
    .from("checklist_execution_items")
    .select("answer")
    .eq("execution_id", executionId);

  if (itemsError) throw itemsError;

  const totalItems = Number(items?.length ?? 0);
  const totalYes = Number(items?.filter((row) => row.answer === "S").length ?? 0);
  const totalNo = Number(items?.filter((row) => row.answer === "N").length ?? 0);
  const totalNa = Number(items?.filter((row) => row.answer === "NA").length ?? 0);

  const denominator = totalItems - totalNa;
  const scorePct = denominator > 0 ? (totalYes / denominator) * 100 : null;

  const { data, error } = await supabase
    .from("checklist_executions")
    .update({
      total_items: totalItems,
      total_yes: totalYes,
      total_no: totalNo,
      total_na: totalNa,
      score_pct: scorePct,
      updated_at: new Date().toISOString(),
    })
    .eq("id", executionId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
