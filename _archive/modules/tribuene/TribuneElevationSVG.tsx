import { footColorForHeight } from '../../domain/footColorScale';

interface Row {
  index: number;
  heightCm: number;
}

interface Props {
  rows: Row[];
  rowDepthM: number;
}

export function TribuneElevationSVG({ rows, rowDepthM }: Props) {
  if (rows.length === 0) return null;
  const totalHeightM = rows[rows.length - 1].heightCm / 100;
  const totalDepthM = rows.length * rowDepthM;
  const pad = 0.6;
  const viewBox = `${-pad} ${-pad} ${totalDepthM + pad * 2} ${totalHeightM + pad * 2}`;

  return (
    <svg viewBox={viewBox} className="w-full h-auto max-h-[360px]" role="img" aria-label="Tribünen-Seitenansicht">
      <rect x={-pad} y={-pad} width={totalDepthM + pad * 2} height={totalHeightM + pad * 2} fill="var(--color-surface)" />
      {rows.map((row) => {
        const heightM = row.heightCm / 100;
        const x = row.index * rowDepthM;
        const y = totalHeightM - heightM;
        return (
          <g key={row.index}>
            <rect
              x={x}
              y={y}
              width={rowDepthM}
              height={heightM}
              fill={footColorForHeight(row.heightCm)}
              fillOpacity={0.7}
              stroke="var(--color-panel-stroke)"
              strokeWidth={0.02}
            />
            <text
              x={x + rowDepthM / 2}
              y={y - 0.08}
              fontSize={0.16}
              textAnchor="middle"
              fill="var(--color-text-muted)"
            >
              {row.heightCm} cm
            </text>
          </g>
        );
      })}
      <line
        x1={-pad}
        y1={totalHeightM}
        x2={totalDepthM + pad}
        y2={totalHeightM}
        stroke="var(--color-grid-line)"
        strokeWidth={0.03}
      />
    </svg>
  );
}
