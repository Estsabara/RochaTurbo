import { CrmShell } from "@/components/crm-shell";
import { getOpenConversations, getRecentMessages } from "@/lib/dashboard-data";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  const [openConversations, messages] = await Promise.all([getOpenConversations(30), getRecentMessages(50)]);

  return (
    <CrmShell title="CRM Conversas" subtitle="Monitoramento das interacoes via WhatsApp">
      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Conversas abertas</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-2 py-2">ID</th>
                  <th className="px-2 py-2">Usuario</th>
                  <th className="px-2 py-2">Abertura</th>
                  <th className="px-2 py-2">Ult. msg</th>
                </tr>
              </thead>
              <tbody>
                {openConversations.map((row) => (
                  <tr key={String(row.id)} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-mono text-xs">{String(row.id)}</td>
                    <td className="px-2 py-2 font-mono text-xs">{String(row.user_id)}</td>
                    <td className="px-2 py-2">{formatDate(String(row.opened_at))}</td>
                    <td className="px-2 py-2">{formatDate(String(row.last_message_at ?? row.opened_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {openConversations.length === 0 ? (
              <p className="py-3 text-sm text-slate-500">Sem conversas abertas.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold">Mensagens recentes</h2>
          <ul className="mt-3 space-y-2">
            {messages.map((message) => (
              <li key={String(message.id)} className="rounded-md border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">
                  {formatDate(String(message.created_at))} | {String(message.direction)} |{" "}
                  {String(message.intent ?? "sem_intent")}
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  {String(message.content_text ?? "[mensagem sem texto]")}
                </p>
              </li>
            ))}
            {messages.length === 0 ? <p className="text-sm text-slate-500">Sem mensagens registradas.</p> : null}
          </ul>
        </article>
      </section>
    </CrmShell>
  );
}
