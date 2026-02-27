"use server";

import { redirect } from "next/navigation";
import { ensureActiveAdminForUser } from "@/lib/auth/admin";
import { getSupabaseServerAuthClient } from "@/lib/supabase/auth";

function redirectToLoginWithError(message: string): never {
  redirect(`/login?err=${encodeURIComponent(message)}`);
}

export async function signInAction(formData: FormData): Promise<never> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirectToLoginWithError("Informe email e senha.");
  }

  const supabase = await getSupabaseServerAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirectToLoginWithError("Credenciais invalidas.");
  }

  const profile = await ensureActiveAdminForUser(supabase, data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    redirectToLoginWithError("Usuario sem acesso administrativo.");
  }

  redirect("/crm/dashboard");
}
