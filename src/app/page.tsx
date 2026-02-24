import Link from "next/link";
import { CrmShell } from "@/components/crm-shell";

const endpointList = [
  "POST /api/webhooks/whatsapp/inbound",
  "POST /api/webhooks/whatsapp/status",
  "POST /api/webhooks/asaas",
  "POST /api/admin/users",
  "POST /api/admin/billing/create-link",
  "POST /api/admin/knowledge/upload",
  "POST /api/monthly/compute",
];

export default function HomePage() {
  return (
    <CrmShell
      title="Rocha Turbo"
      subtitle="Arquitetura ativa: WhatsApp Cloud API + n8n + Supabase + Next.js + OpenAI + Asaas"
    >
      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Estado da implementacao</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            <li>Dominio 100% centrado em usuario (sem entidade posto/empresa).</li>
            <li>Autenticacao CPF + OTP via WhatsApp pronta nos webhooks.</li>
            <li>Motor de KPI v1.1 com persistencia em Supabase.</li>
            <li>RAG com citacoes a partir da base documental.</li>
            <li>Cobranca via Asaas com webhook de liberacao de acesso.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/crm/dashboard"
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Abrir CRM
            </Link>
            <Link
              href="/crm/configuracoes"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
            >
              Ver configuracoes
            </Link>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Endpoints principais</h2>
          <ul className="mt-3 space-y-1.5 text-sm font-mono text-slate-700">
            {endpointList.map((endpoint) => (
              <li key={endpoint}>{endpoint}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate-600">
            A ingestao de documentos para RAG deve usar o endpoint de knowledge upload ou importacao direta via
            Supabase.
          </p>
        </article>
      </section>
    </CrmShell>
  );
}
