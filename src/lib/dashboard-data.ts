import { tryGetServerEnv } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";

function getClient() {
  const env = tryGetServerEnv();
  if (!env) return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getDashboardSnapshot() {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client.rpc("get_dashboard_metrics");
  if (error) return null;
  return data;
}

export async function getUsersForDashboard(limit = 20) {
  const client = getClient();
  if (!client) return [];
  const { data } = await client
    .from("users")
    .select("id, name, phone_e164, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getOpenConversations(limit = 20) {
  const client = getClient();
  if (!client) return [];
  const { data } = await client
    .from("conversations")
    .select("id, user_id, status, topic, opened_at, last_message_at")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getRecentMessages(limit = 50) {
  const client = getClient();
  if (!client) return [];
  const { data } = await client
    .from("messages")
    .select("id, conversation_id, direction, content_text, intent, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getRecentPayments(limit = 20) {
  const client = getClient();
  if (!client) return [];
  const { data } = await client
    .from("payments")
    .select("id, user_id, asaas_payment_id, status, amount_cents, due_date, paid_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getSystemSettings() {
  const client = getClient();
  if (!client) return [];
  const { data } = await client
    .from("system_settings")
    .select("key, value, description, updated_at")
    .order("key", { ascending: true });
  return data ?? [];
}
