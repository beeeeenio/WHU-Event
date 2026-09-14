import type { ReactNode } from 'react';

interface Props {
  tone?: 'info' | 'warning';
  children: ReactNode;
}

export function WarningBanner({ tone = 'warning', children }: Props) {
  const color = tone === 'warning' ? 'var(--color-warning)' : 'var(--color-accent)';
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm"
      style={{ borderColor: color, color, backgroundColor: 'color-mix(in srgb, ' + color + ' 12%, transparent)' }}
    >
      {children}
    </div>
  );
}
