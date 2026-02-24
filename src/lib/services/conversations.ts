import type { ConversationState, IntentType, MessageDirection } from "@/lib/types/domain";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

interface EnsureSessionInput {
  userId?: string | null;
  waContactId: string;
  state?: ConversationState;
}

export async function ensureSession(input: EnsureSessionInput) {
  const supabase = getServiceSupabaseClient();
  const existing = await getSessionByWaContact(input.waContactId);
  if (existing) {
    const { data, error } = await supabase
      .from("sessions")
      .update({
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: input.userId ?? null,
      wa_contact_id: input.waContactId,
      state: input.state ?? "awaiting_cpf",
      last_seen_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSessionState(sessionId: string, state: ConversationState) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({
      state,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getSessionByWaContact(waContactId: string) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("wa_contact_id", waContactId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOpenConversation(userId: string) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureOpenConversation(userId: string) {
  const existing = await getOpenConversation(userId);
  if (existing) return existing;

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      channel: "whatsapp",
      status: "open",
      opened_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

interface AddMessageInput {
  conversationId: string;
  userId: string;
  direction: MessageDirection;
  contentText?: string | null;
  waMessageId?: string | null;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  transcriptionText?: string | null;
  intent?: IntentType | null;
  citations?: unknown[];
  rawPayload?: Record<string, unknown>;
}

export async function addConversationMessage(input: AddMessageInput) {
  const supabase = getServiceSupabaseClient();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      direction: input.direction,
      content_text: input.contentText ?? null,
      wa_message_id: input.waMessageId ?? null,
      media_url: input.mediaUrl ?? null,
      media_mime: input.mediaMime ?? null,
      transcription_text: input.transcriptionText ?? null,
      intent: input.intent ?? null,
      citations_json: input.citations ?? [],
      raw_payload: input.rawPayload ?? {},
    })
    .select("*")
    .single();

  if (error) throw error;

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", input.conversationId);

  return data;
}

export async function getRecentMessages(conversationId: string, limit = 15) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("messages")
    .select("direction, content_text")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse();
}
