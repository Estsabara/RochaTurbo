import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/admin";
import { signInAction } from "./actions";

interface LoginPageProps {
  searchParams?: Promise<{
    err?: string;
    ok?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAdminSession();
  if (session) {
    redirect("/crm/dashboard");
  }

  const params = (await searchParams) ?? {};

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#d9f7e6_0%,#f8faf8_45%,#f1f5ff_100%)] px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Login administrativo</h1>
        <p className="mt-2 text-sm text-slate-600">
          Acesso restrito ao CRM Rocha Turbo. Use seu email e senha de administrador.
        </p>

        {params.ok ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {params.ok}
          </p>
        ) : null}

        {params.err ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {params.err}
          </p>
        ) : null}

        <form action={signInAction} className="mt-6 grid gap-3">
          <label className="text-sm">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="admin@rochaturbo.com.br"
            />
          </label>

          <label className="text-sm">
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="********"
            />
          </label>

          <button
            type="submit"
            className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-950"
          >
            Entrar
          </button>
        </form>
      </section>
    </main>
  );
}