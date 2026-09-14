interface Props {
  label: string;
  valueM: number;
  min: number;
  max: number;
  step?: number;
  onChange: (valueM: number) => void;
}

export function DimensionSlider({ label, valueM, min, max, step = 0.5, onChange }: Props) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-[var(--color-text)]">{label}</span>
        <span className="text-sm text-[var(--color-text-muted)] tabular-nums">{valueM.toFixed(2)} m</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valueM}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}
