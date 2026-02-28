import type { FlowStatus, FlowType } from "@/lib/types/domain";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

export interface ChatFlowRow {
  id: string;
  user_id: string;
  flow_type: FlowType;
  status: FlowStatus;
  month_ref: string | null;
  step_key: string;
  answers_json: Record<string, unknown>;
  context_json: Record<string, unknown>;
  last_wa_message_id: string | null;
  started_at: string;
  completed_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateChatFlowInput {
  userId: string;
  flowType: FlowType;
  stepKey: string;
  monthRef?: string | null;
  answers?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

interface UpdateChatFlowInput {
  status?: FlowStatus;
  stepKey?: string;
  monthRef?: string | null;
  answers?: Record<string, unknown>;
  context?: Record<string, unknown>;
  lastWaMessageId?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
}

export async function getActiveChatFlow(userId: string): Promise<ChatFlowRow | null> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("chat_flows")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatFlowRow | null) ?? null;
}

export async function getChatFlowById(flowId: string): Promise<ChatFlowRow | null> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.from("chat_flows").select("*").eq("id", flowId).maybeSingle();
  if (error) throw error;
  return (data as ChatFlowRow | null) ?? null;
}

export async function listChatFlowsByUser(userId: string, limit = 50): Promise<ChatFlowRow[]> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("chat_flows")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ChatFlowRow[] | null) ?? [];
}

export async function createChatFlow(input: CreateChatFlowInput): Promise<ChatFlowRow> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("chat_flows")
    .insert({
      user_id: input.userId,
      flow_type: input.flowType,
      status: "active",
      month_ref: input.monthRef ?? null,
      step_key: input.stepKey,
      answers_json: input.answers ?? {},
      context_json: input.context ?? {},
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ChatFlowRow;
}

export async function updateChatFlow(flowId: string, input: UpdateChatFlowInput): Promise<ChatFlowRow> {
  const supabase = getServiceSupabaseClient();
  const payload: Record<string, unknown> = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.stepKey ? { step_key: input.stepKey } : {}),
    ...(input.monthRef !== undefined ? { month_ref: input.monthRef } : {}),
    ...(input.answers ? { answers_json: input.answers } : {}),
    ...(input.context ? { context_json: input.context } : {}),
    ...(input.lastWaMessageId !== undefined ? { last_wa_message_id: input.lastWaMessageId } : {}),
    ...(input.completedAt !== undefined ? { completed_at: input.completedAt } : {}),
    ...(input.canceledAt !== undefined ? { canceled_at: input.canceledAt } : {}),
  };

  const { data, error } = await supabase.from("chat_flows").update(payload).eq("id", flowId).select("*").single();
  if (error) throw error;
  return data as ChatFlowRow;
}

export async function cancelChatFlow(flowId: string, reason?: string): Promise<ChatFlowRow> {
  const flow = await getChatFlowById(flowId);
  if (!flow) {
    throw new Error("Chat flow not found");
  }
  const context = {
    ...(flow.context_json ?? {}),
    canceled_reason: reason ?? null,
  };
  return updateChatFlow(flowId, {
    status: "canceled",
    canceledAt: new Date().toISOString(),
    context,
  });
}

