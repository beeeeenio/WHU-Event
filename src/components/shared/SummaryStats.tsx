interface Stat {
  label: string;
  value: string;
  hint?: string;
}

export function SummaryStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="text-xs text-[var(--color-text-muted)]">{s.label}</div>
          <div className="text-xl font-semibold text-[var(--color-text)] tabular-nums">{s.value}</div>
          {s.hint && <div className="text-xs text-[var(--color-text-muted)] mt-0.5">{s.hint}</div>}
        </div>
      ))}
    </div>
  );
}
