import type { LayoutComparison } from '../../domain/layout';
import { countFeet } from '../../domain/feet';

interface Props {
  comparison: LayoutComparison;
  selected: 'normal' | 'rotiert';
  onSelect: (orientation: 'normal' | 'rotiert') => void;
}

export function OrientationCards({ comparison, selected, onSelect }: Props) {
  const cards = [
    { key: 'normal' as const, title: 'Normal', hint: 'Lange Seite → Breite', layout: comparison.normal },
    { key: 'rotiert' as const, title: 'Rotiert', hint: 'Lange Seite → Tiefe', layout: comparison.rotiert },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {cards.map(({ key, title, hint, layout }) => {
        const active = selected === key;
        const isRecommended = comparison.recommended === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`text-left rounded-lg border p-3 transition-colors ${
              active
                ? 'border-[var(--color-accent)] bg-[var(--color-panel-fill)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]'
            }`}
          >
            <div className="font-medium text-[var(--color-text)]">{title}</div>
            <div className="text-xs text-[var(--color-text-muted)]">{hint}</div>
            <div className="text-sm mt-1 text-[var(--color-text)]">
              {layout.panels.filter((p) => !p.isSondermass).length}× Standardplatten
              {layout.hasSondermass ? ', Sondermaß' : ' — kein Sondermaß'}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">{countFeet(layout.panels)} Füße gesamt</div>
            {isRecommended && <div className="text-xs text-[var(--color-accent)] mt-1">★ empfohlen</div>}
          </button>
        );
      })}
    </div>
  );
}
