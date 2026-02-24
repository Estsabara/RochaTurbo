import { addMinutes } from "date-fns";
import { getServerEnv } from "@/lib/env";
import { generateOtpCode, hashOtp, verifyOtp } from "@/lib/security/otp";
import { getServiceSupabaseClient } from "@/lib/supabase/server";

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

export async function createOtpChallenge(userId: string): Promise<{ code: string; challengeId: string }> {
  const env = getServerEnv();
  const supabase = getServiceSupabaseClient();
  const code = generateOtpCode(6);
  const codeHash = hashOtp(code, env.OTP_SECRET);
  const expiresAt = addMinutes(new Date(), OTP_TTL_MINUTES).toISOString();

  const { data, error } = await supabase
    .from("auth_otp_challenges")
    .insert({
      user_id: userId,
      channel: "whatsapp",
      code_hash: codeHash,
      expires_at: expiresAt,
      max_attempts: OTP_MAX_ATTEMPTS,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { code, challengeId: data.id as string };
}

export async function verifyLatestOtpChallenge(userId: string, providedCode: string): Promise<boolean> {
  const env = getServerEnv();
  const supabase = getServiceSupabaseClient();

  const { data: challenge, error } = await supabase
    .from("auth_otp_challenges")
    .select("*")
    .eq("user_id", userId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!challenge) return false;

  const expired = new Date(challenge.expires_at as string).getTime() < Date.now();
  const attempts = Number(challenge.attempt_count ?? 0);
  const maxAttempts = Number(challenge.max_attempts ?? OTP_MAX_ATTEMPTS);
  if (expired || attempts >= maxAttempts) {
    return false;
  }

  const valid = verifyOtp(providedCode, String(challenge.code_hash), env.OTP_SECRET);

  if (!valid) {
    const { error: updateError } = await supabase
      .from("auth_otp_challenges")
      .update({ attempt_count: attempts + 1 })
      .eq("id", challenge.id);
    if (updateError) throw updateError;
    return false;
  }

  const { error: consumeError } = await supabase
    .from("auth_otp_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id);
  if (consumeError) throw consumeError;

  return true;
}
