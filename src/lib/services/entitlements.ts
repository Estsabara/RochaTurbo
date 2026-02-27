import { getServiceSupabaseClient } from "@/lib/supabase/server";
import type { EntitlementStatus } from "@/lib/types/domain";

export interface UserEntitlement {
  user_id: string;
  subscription_id: string | null;
  source: "subscription" | "coupon" | "manual" | "none";
  status: EntitlementStatus;
  is_premium: boolean;
  starts_at: string | null;
  ends_at: string | null;
  metadata_json: Record<string, unknown>;
  updated_at: string;
}

export async function refreshUserEntitlement(userId: string): Promise<Record<string, unknown>> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.rpc("refresh_user_entitlement", { p_user_id: userId });
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? {};
}

export async function getUserEntitlement(userId: string, options?: { refresh?: boolean }): Promise<UserEntitlement | null> {
  if (options?.refresh) {
    await refreshUserEntitlement(userId);
  }

  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase
    .from("subscription_entitlements")
    .select(
      "user_id, subscription_id, source, status, is_premium, starts_at, ends_at, metadata_json, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    user_id: String(data.user_id),
    subscription_id: (data.subscription_id as string | null) ?? null,
    source: String(data.source) as UserEntitlement["source"],
    status: String(data.status) as EntitlementStatus,
    is_premium: Boolean(data.is_premium),
    starts_at: (data.starts_at as string | null) ?? null,
    ends_at: (data.ends_at as string | null) ?? null,
    metadata_json: (data.metadata_json as Record<string, unknown>) ?? {},
    updated_at: String(data.updated_at),
  };
}

export async function redeemCouponForUser(input: {
  userId: string;
  code: string;
  email?: string | null;
  cnpj?: string | null;
}): Promise<Record<string, unknown>> {
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.rpc("redeem_coupon", {
    p_user_id: input.userId,
    p_code: input.code,
    p_email: input.email ?? null,
    p_cnpj: input.cnpj ?? null,
  });

  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? {};
}

export async function hasPremiumEntitlement(userId: string): Promise<boolean> {
  const entitlement = await getUserEntitlement(userId, { refresh: true });
  if (!entitlement?.is_premium) return false;

  if (!entitlement.ends_at) {
    return true;
  }

  return new Date(entitlement.ends_at).getTime() >= Date.now();
}
