import { footColorForHeight } from '../../domain/footColorScale';

interface Props {
  /** Die in dieser Ansicht tatsächlich vorkommenden Höhen (cm) — wird dedupliziert/sortiert angezeigt. */
  heights: number[];
}

/** Zeigt die Höhe-zu-Farbe-Zuordnung, die Füße im 2D-Grundriss, 3D und PPTX-Export einheitlich verwenden. */
export function FootColorLegend({ heights }: Props) {
  const unique = Array.from(new Set(heights)).sort((a, b) => a - b);
  if (unique.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
      <span className="font-medium text-[var(--color-text)]">Fußhöhe:</span>
      {unique.map((heightCm) => (
        <span key={heightCm} className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: footColorForHeight(heightCm) }} />
          {heightCm} cm
        </span>
      ))}
    </div>
  );
}
