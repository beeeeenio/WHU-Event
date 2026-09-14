interface Props {
  heightOptionsCm: number[];
  valueCm: number;
  onChange: (heightCm: number) => void;
}

export function HeightSelector({ heightOptionsCm, valueCm, onChange }: Props) {
  return (
    <div>
      <span className="text-sm font-medium text-[var(--color-text)] block mb-2">Höhe</span>
      <div className="flex flex-wrap gap-2">
        {heightOptionsCm.map((h) => {
          const active = h === valueCm;
          return (
            <button
              key={h}
              type="button"
              onClick={() => onChange(h)}
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
    </div>
  );
}
