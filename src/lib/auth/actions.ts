"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerAuthClient } from "@/lib/supabase/auth";

export async function signOutAction(): Promise<never> {
  const supabase = await getSupabaseServerAuthClient();
  await supabase.auth.signOut();
  redirect("/login?ok=Sessao%20encerrada");
}
