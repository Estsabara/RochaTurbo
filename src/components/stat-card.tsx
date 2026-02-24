export function StatCard(props: { label: string; value: string | number; hint?: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{props.label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{props.value}</p>
      {props.hint ? <p className="mt-1 text-sm text-slate-600">{props.hint}</p> : null}
    </article>
  );
}
