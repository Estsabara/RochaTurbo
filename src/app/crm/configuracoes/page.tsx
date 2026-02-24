import { CrmShell } from "@/components/crm-shell";
import { computeMonthlyAction, runRetentionAction, uploadKnowledgeAction } from "@/app/crm/actions";
import { getSystemSettings, getUsersForDashboard } from "@/lib/dashboard-data";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface ConfiguracoesPageProps {
  searchParams?: Promise<{
    ok?: string;
    err?: string;
  }>;
}

const sampleInputJson = `{
  "a_tipo_posto": "urbano",
  "b_volume_diesel_l": 120000,
  "c_volume_otto_l": 95000,
  "g_qtd_frentistas": 9,
  "h_turno": "8h",
  "aa_qtd_abastecimentos_mes": 6200
}`;

export default async function ConfiguracoesPage({ searchParams }: ConfiguracoesPageProps) {
  const params = (await searchParams) ?? {};
  const [settings, users] = await Promise.all([getSystemSettings(), getUsersForDashboard(200)]);

  return (
    <CrmShell
      title="CRM Configuracoes"
      subtitle="Parametros globais (suporte, retencao, constantes de KPI e versao de prompt)"
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

      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Upload de conhecimento (RAG)</h2>
          <form action={uploadKnowledgeAction} className="mt-4 grid gap-3">
            <label className="text-sm">
              Titulo
              <input
                name="title"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ex: ROCHA_TURBO_Especificacao_v1_1"
              />
            </label>
            <label className="text-sm">
              Source
              <input
                name="source"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="C:\\Base de Dados\\arquivo.docx"
              />
            </label>
            <label className="text-sm">
              Versao (opcional)
              <input name="version" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm">
              Secao (opcional)
              <input
                name="section_hint"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              Texto
              <textarea
                name="text"
                required
                rows={8}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Cole aqui o conteudo do documento para indexar."
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Indexar documento
            </button>
          </form>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Operacoes de manutencao</h2>

          <form action={runRetentionAction} className="mt-4">
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
            >
              Executar limpeza de retencao agora
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold">Calculo mensal de KPI</h3>
            <form action={computeMonthlyAction} className="mt-3 grid gap-3">
              <label className="text-sm">
                Usuario
                <select
                  name="user_id"
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecione</option>
                  {users.map((user) => (
                    <option key={String(user.id)} value={String(user.id)}>
                      {String(user.name)} ({String(user.phone_e164)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Mes de referencia (YYYY-MM-01)
                <input
                  name="month_ref"
                  required
                  defaultValue={new Date().toISOString().slice(0, 7) + "-01"}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                Input JSON
                <textarea
                  name="input_json"
                  required
                  rows={8}
                  defaultValue={sampleInputJson}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
              >
                Calcular e salvar KPI
              </button>
            </form>
          </div>
        </article>
      </section>

      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">System Settings</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">Chave</th>
                <th className="px-2 py-2">Valor</th>
                <th className="px-2 py-2">Descricao</th>
                <th className="px-2 py-2">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((setting) => (
                <tr key={String(setting.key)} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-mono text-xs">{String(setting.key)}</td>
                  <td className="max-w-md px-2 py-2 font-mono text-xs">{JSON.stringify(setting.value)}</td>
                  <td className="px-2 py-2">{String(setting.description ?? "-")}</td>
                  <td className="px-2 py-2">{formatDate(String(setting.updated_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {settings.length === 0 ? <p className="py-3 text-sm text-slate-500">Sem configuracoes cadastradas.</p> : null}
        </div>
      </article>
    </CrmShell>
  );
}
