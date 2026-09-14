import { useState } from 'react';
import { computeRamp, computeStairs } from '../../domain/stairs';

interface Props {
  heightCm: number;
}

export function StairsRampCalculator({ heightCm }: Props) {
  const [mode, setMode] = useState<'treppe' | 'rampe'>('treppe');
  if (heightCm <= 0) return null;

  const stairs = computeStairs(heightCm);
  const ramp = computeRamp(heightCm);
  const heightM = heightCm / 100;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode('treppe')} className={tabClass(mode === 'treppe')}>
          Treppe
        </button>
        <button type="button" onClick={() => setMode('rampe')} className={tabClass(mode === 'rampe')}>
          Rampe
        </button>
      </div>
      {mode === 'treppe' ? (
        <>
          <p className="text-sm text-[var(--color-text)]">
            {stairs.stepCount} Stufen à {stairs.stepHeightCm} cm Höhe, {(stairs.stepDepthM * 100).toFixed(0)} cm
            Auftritt — für {heightCm} cm Höhenunterschied.
          </p>
          <StairsProfileSVG stepCount={stairs.stepCount} stepHeightM={stairs.stepHeightCm / 100} stepDepthM={stairs.stepDepthM} />
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--color-text)]">
            Rampenlänge ca. {ramp.lengthM.toFixed(2)} m bei 1:{ramp.inclineRatio}-Neigung (barrierefrei) — für{' '}
            {heightCm} cm Höhenunterschied.
          </p>
          <RampProfileSVG heightM={heightM} lengthM={ramp.lengthM} />
        </>
      )}
    </div>
  );
}

function tabClass(active: boolean): string {
  return `px-3 py-1 rounded-md text-sm border ${
    active
      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
      : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
  }`;
}

/** Seitenansicht der Treppe (Stufenprofil), analog der Darstellung in der NivTec-Anleitung. */
function StairsProfileSVG({
  stepCount,
  stepHeightM,
  stepDepthM,
}: {
  stepCount: number;
  stepHeightM: number;
  stepDepthM: number;
}) {
  const totalHeightM = stepCount * stepHeightM;
  const totalDepthM = stepCount * stepDepthM;
  const pad = Math.max(0.15, totalHeightM * 0.15);
  const viewBox = `${-pad} ${-pad} ${totalDepthM + pad * 2} ${totalHeightM + pad * 2}`;

  return (
    <svg viewBox={viewBox} className="w-full h-auto max-h-[160px]" role="img" aria-label="Treppenprofil">
      <rect x={-pad} y={-pad} width={totalDepthM + pad * 2} height={totalHeightM + pad * 2} fill="var(--color-surface)" />
      {Array.from({ length: stepCount }, (_, i) => {
        const stepTopY = totalHeightM - (i + 1) * stepHeightM;
        const x = i * stepDepthM;
        return (
          <rect
            key={i}
            x={x}
            y={stepTopY}
            width={stepDepthM}
            height={totalHeightM - stepTopY}
            fill="var(--color-panel-fill)"
            stroke="var(--color-panel-stroke)"
            strokeWidth={totalHeightM * 0.01}
          />
        );
      })}
      <line x1={-pad} y1={totalHeightM} x2={totalDepthM + pad} y2={totalHeightM} stroke="var(--color-grid-line)" strokeWidth={totalHeightM * 0.015} />
    </svg>
  );
}

/** Seitenansicht der Rampe (Neigungsprofil) — nicht maßstabsgetreu zur Bühne, da Rampen deutlich länger als hoch sind. */
function RampProfileSVG({ heightM, lengthM }: { heightM: number; lengthM: number }) {
  const pad = Math.max(0.2, heightM * 0.3);
  const viewBox = `${-pad} ${-pad} ${lengthM + pad * 2} ${heightM + pad * 2}`;

  return (
    <svg viewBox={viewBox} className="w-full h-auto max-h-[160px]" role="img" aria-label="Rampenprofil">
      <rect x={-pad} y={-pad} width={lengthM + pad * 2} height={heightM + pad * 2} fill="var(--color-surface)" />
      <polygon
        points={`0,${heightM} ${lengthM},${heightM} ${lengthM},0`}
        fill="var(--color-panel-fill)"
        stroke="var(--color-panel-stroke)"
        strokeWidth={heightM * 0.02}
      />
      <line x1={-pad} y1={heightM} x2={lengthM + pad} y2={heightM} stroke="var(--color-grid-line)" strokeWidth={heightM * 0.03} />
    </svg>
  );
}
