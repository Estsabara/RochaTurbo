import { CrmShell } from "@/components/crm-shell";
import { createBillingLinkAction } from "@/app/crm/actions";
import { getRecentPayments, getUsersForDashboard } from "@/lib/dashboard-data";
import { formatCurrencyFromCents, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface CobrancaPageProps {
  searchParams?: Promise<{
    ok?: string;
    err?: string;
  }>;
}

export default async function CobrancaPage({ searchParams }: CobrancaPageProps) {
  const params = (await searchParams) ?? {};
  const [payments, users] = await Promise.all([getRecentPayments(100), getUsersForDashboard(200)]);

  return (
    <CrmShell title="CRM Cobranca" subtitle="Acompanhamento de pagamentos e assinaturas via Asaas">
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
        <h2 className="text-base font-semibold">Gerar cobranca</h2>
        <form action={createBillingLinkAction} className="mt-4 grid gap-3 md:grid-cols-2">
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
            Valor (BRL)
            <input
              name="amount_brl"
              type="number"
              step="0.01"
              min="1"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              defaultValue="149.90"
            />
          </label>
          <label className="text-sm md:col-span-2">
            Descricao
            <input
              name="description"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              defaultValue="Assinatura Rocha Turbo"
            />
          </label>
          <label className="text-sm">
            Vencimento (dias)
            <input
              name="due_in_days"
              type="number"
              min="1"
              max="30"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              defaultValue="2"
            />
          </label>
          <label className="mt-7 flex items-center gap-2 text-sm">
            <input type="checkbox" name="send_via_whatsapp" defaultChecked />
            Enviar link no WhatsApp
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Criar cobranca
            </button>
          </div>
        </form>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Pagamentos recentes</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">Pagamento</th>
                <th className="px-2 py-2">Usuario</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Valor</th>
                <th className="px-2 py-2">Vencimento</th>
                <th className="px-2 py-2">Pago em</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={String(payment.id)} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-mono text-xs">{String(payment.asaas_payment_id)}</td>
                  <td className="px-2 py-2 font-mono text-xs">{String(payment.user_id)}</td>
                  <td className="px-2 py-2">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs">{String(payment.status)}</span>
                  </td>
                  <td className="px-2 py-2">{formatCurrencyFromCents(payment.amount_cents as number | null)}</td>
                  <td className="px-2 py-2">{String(payment.due_date ?? "-")}</td>
                  <td className="px-2 py-2">{formatDate(String(payment.paid_at ?? ""))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 ? <p className="py-3 text-sm text-slate-500">Sem pagamentos encontrados.</p> : null}
        </div>
      </article>
    </CrmShell>
  );
}
