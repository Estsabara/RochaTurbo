import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Visao Geral" },
  { href: "/crm/dashboard", label: "Dashboard" },
  { href: "/crm/usuarios", label: "Usuarios" },
  { href: "/crm/conversas", label: "Conversas" },
  { href: "/crm/cobranca", label: "Cobranca" },
  { href: "/crm/configuracoes", label: "Configuracoes" },
];

export function CrmShell(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#d9f7e6_0%,#f8faf8_45%,#f1f5ff_100%)] text-slate-900">
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{props.title}</h1>
            {props.subtitle ? <p className="text-sm text-slate-600">{props.subtitle}</p> : null}
          </div>
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{props.children}</main>
    </div>
  );
}
