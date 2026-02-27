import { CrmShell } from "@/components/crm-shell";
import { StatCard } from "@/components/stat-card";
import { getDashboardSnapshot, getOpenConversations, getUsersForDashboard } from "@/lib/dashboard-data";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CrmDashboardPage() {
  const [metrics, openConversations, users] = await Promise.all([
    getDashboardSnapshot(),
    getOpenConversations(10),
    getUsersForDashboard(10),
  ]);

  const usersStats = (metrics as { users?: Record<string, number> } | null)?.users ?? {};
  const messagesStats = (metrics as { messages?: Record<string, number> } | null)?.messages ?? {};
  const billingStats = (metrics as { billing?: Record<string, number> } | null)?.billing ?? {};
  const conversationStats =
    (metrics as { conversations?: Record<string, number> } | null)?.conversations ?? {};

  return (
    <CrmShell title="CRM Dashboard" subtitle="Visao operacional em tempo real do atendimento WhatsApp" showSignOut>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Usuarios ativos" value={usersStats.active_users ?? 0} />
        <StatCard label="Conversas abertas" value={conversationStats.open_conversations ?? 0} />
        <StatCard label="Mensagens (24h)" value={messagesStats.messages_24h ?? 0} />
        <StatCard label="Assinaturas ativas" value={billingStats.subscriptions_active ?? 0} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Conversas abertas</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Usuario</th>
                  <th className="px-2 py-2">Abertura</th>
                  <th className="px-2 py-2">Ult. mensagem</th>
                </tr>
              </thead>
              <tbody>
                {openConversations.map((row) => (
                  <tr key={String(row.id)} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-mono text-xs">{String(row.id).slice(0, 8)}</td>
                    <td className="px-2 py-2 font-mono text-xs">{String(row.user_id).slice(0, 8)}</td>
                    <td className="px-2 py-2">{formatDate(String(row.opened_at))}</td>
                    <td className="px-2 py-2">{formatDate(String(row.last_message_at ?? row.opened_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {openConversations.length === 0 ? (
              <p className="py-3 text-sm text-slate-500">Nenhuma conversa aberta encontrada.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Novos usuarios</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2">Telefone</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={String(user.id)} className="border-b border-slate-100">
                    <td className="px-2 py-2">{String(user.name)}</td>
                    <td className="px-2 py-2 font-mono text-xs">{String(user.phone_e164)}</td>
                    <td className="px-2 py-2">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs">{String(user.status)}</span>
                    </td>
                    <td className="px-2 py-2">{formatDate(String(user.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 ? <p className="py-3 text-sm text-slate-500">Nenhum usuario cadastrado.</p> : null}
          </div>
        </article>
      </section>
    </CrmShell>
  );
}

