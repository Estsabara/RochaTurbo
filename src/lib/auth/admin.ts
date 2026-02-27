import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { getSupabaseRouteAuthClient, getSupabaseServerAuthClient } from "@/lib/supabase/auth";

type AdminProfile = {
  id: string;
  role: string;
  full_name: string | null;
};

export type AdminSession = {
  authUserId: string;
  email: string | null;
  role: string;
  profileId: string;
  fullName: string | null;
  actor: string;
};

async function getActiveAdminProfile(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<AdminProfile | null> {
  const { data, error } = await supabase
    .from("admin_profiles")
    .select("id, role, full_name, is_active")
    .eq("auth_user_id", authUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: String(data.id),
    role: String(data.role),
    full_name: (data.full_name as string | null) ?? null,
  };
}

async function getAdminSessionFromClient(supabase: SupabaseClient): Promise<AdminSession | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const profile = await getActiveAdminProfile(supabase, user.id);
  if (!profile) {
    return null;
  }

  const email = user.email ?? null;

  return {
    authUserId: user.id,
    email,
    role: profile.role,
    profileId: profile.id,
    fullName: profile.full_name,
    actor: email ? `admin:${email}` : `admin:${user.id}`,
  };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const supabase = await getSupabaseServerAuthClient();
  return getAdminSessionFromClient(supabase);
}

export async function getAdminSessionFromRequest(request: NextRequest): Promise<AdminSession | null> {
  const supabase = getSupabaseRouteAuthClient(request);
  return getAdminSessionFromClient(supabase);
}

export async function ensureActiveAdminForUser(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<AdminProfile | null> {
  return getActiveAdminProfile(supabase, authUserId);
}

export async function requireAdminSessionForPage(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

export async function requireAdminSessionForAction(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login?err=Sessao%20expirada");
  }
  return session;
}
