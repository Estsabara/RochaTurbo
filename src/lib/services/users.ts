import { getServerEnv } from "@/lib/env";
import { hashCpf } from "@/lib/security/cpf";
import { getServiceSupabaseClient } from "@/lib/supabase/server";
import type { UserStatus } from "@/lib/types/domain";

interface CreateUserInput {
  name: string;
  phoneE164: string;
  cpf: string;
  cpfEncrypted?: string;
  status?: UserStatus;
}

export async function createOrUpdateUser(input: CreateUserInput) {
  const env = getServerEnv();
  const supabase = getServiceSupabaseClient();
  const cpfHash = hashCpf(input.cpf, env.OTP_SECRET);

  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        name: input.name,
        phone_e164: input.phoneE164,
        cpf_hash: cpfHash,
        cpf_encrypted: input.cpfEncrypted ?? null,
        status: input.status ?? "pending_activation",
      },
      { onConflict: "cpf_hash" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function findUserByCpf(cpf: string) {
  const env = getServerEnv();
  const supabase = getServiceSupabaseClient();
  const cpfHash = hashCpf(cpf, env.OTP_SECRET);

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("cpf_hash", cpfHash)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findUserByPhone(phoneE164: string) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateUserStatus(userId: string, status: UserStatus) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .update({ status })
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listUsers(limit = 100) {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, name, phone_e164, status, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
