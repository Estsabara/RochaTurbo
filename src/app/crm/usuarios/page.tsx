import { CrmShell } from "@/components/crm-shell";
import { getUsersForDashboard } from "@/lib/dashboard-data";
import { formatDate } from "@/lib/format";
import { createUserAction, setUserStatusAction } from "@/app/crm/actions";

export const dynamic = "force-dynamic";

interface UsuariosPageProps {
  searchParams?: Promise<{
    ok?: string;
    err?: string;
  }>;
}

export default async function UsuariosPage({ searchParams }: UsuariosPageProps) {
  const params = (await searchParams) ?? {};
  const users = await getUsersForDashboard(200);

  return (
    <CrmShell
      title="CRM Usuarios"
      subtitle="Gestao operacional de usuarios (criar, ativar, bloquear e cancelar)"
    >
      {params.ok ? (
        <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {params.ok}
        </p>
      ) : null}
      {params.err ? (
        <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {params.err}
        </p>
      ) : null}

      <article className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Novo usuario</h2>
        <form action={createUserAction} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Nome
            <input
              name="name"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Nome do usuario"
            />
          </label>
          <label className="text-sm">
            Telefone (E.164)
            <input
              name="phone_e164"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="+5511999999999"
            />
          </label>
          <label className="text-sm">
            CPF
            <input
              name="cpf"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Somente numeros"
            />
          </label>
          <label className="text-sm">
            Status inicial
            <select
              name="status"
              defaultValue="pending_activation"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="pending_activation">pending_activation</option>
              <option value="active">active</option>
              <option value="blocked">blocked</option>
              <option value="canceled">canceled</option>
            </select>
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Salvar usuario
            </button>
          </div>
        </form>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Usuarios cadastrados</h2>
        <p className="mt-1 text-sm text-slate-600">Acoes por linha atualizam o status imediatamente.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">ID</th>
                <th className="px-2 py-2">Nome</th>
                <th className="px-2 py-2">Telefone</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Criado em</th>
                <th className="px-2 py-2">Acao</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={String(user.id)} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-mono text-xs">{String(user.id)}</td>
                  <td className="px-2 py-2">{String(user.name)}</td>
                  <td className="px-2 py-2 font-mono text-xs">{String(user.phone_e164)}</td>
                  <td className="px-2 py-2">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs">{String(user.status)}</span>
                  </td>
                  <td className="px-2 py-2">{formatDate(String(user.created_at))}</td>
                  <td className="px-2 py-2">
                    <form action={setUserStatusAction} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={String(user.id)} />
                      <select
                        name="status"
                        defaultValue={String(user.status)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="pending_activation">pending_activation</option>
                        <option value="active">active</option>
                        <option value="blocked">blocked</option>
                        <option value="canceled">canceled</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900"
                      >
                        Aplicar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 ? <p className="py-4 text-sm text-slate-500">Sem dados no momento.</p> : null}
        </div>
      </article>
    </CrmShell>
  );
}
