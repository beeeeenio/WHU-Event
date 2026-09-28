interface Props {
  heightOptionsCm: number[];
  valueCm: number;
  onChange: (heightCm: number) => void;
}

export function HeightSelector({ heightOptionsCm, valueCm, onChange }: Props) {
  return (
    <div role="group" aria-label="Höhe" className="flex flex-wrap gap-2">
      {heightOptionsCm.map((h) => {
        const active = h === valueCm;
        return (
          <button
            key={h}
            type="button"
            onClick={() => onChange(h)}
            aria-pressed={active}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
              active
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]'
            }`}
            title="Alu-Lastenverteilerfuß (LV-Fuß)"
          >
            {h} cm
          </button>
        );
      })}
    </div>
  );
}
