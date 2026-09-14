import type { Piece2D } from '../../domain/customShape';

function formatM(v: number): string {
  return v.toFixed(1).replace('.', ',');
}

interface Props {
  pieces: Piece2D[];
  onRemovePiece: (id: string) => void;
}

/** Kompakte, umbrechende Chip-Liste der platzierten Stücke — ersetzt die frühere Liste mit
 *  einer vollen Zeile je Stück, die bei großen Bühnen (viele Dutzend Platten) sehr lang wurde.
 *  Position (x/y) bleibt als Tooltip erreichbar statt permanent sichtbarem Text; die Chips
 *  brechen bei Bedarf um, statt die Seite in die Höhe zu ziehen. */
export function PlacedPiecesChips({ pieces, onRemovePiece }: Props) {
  if (pieces.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {pieces.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onRemovePiece(p.id)}
          title={`Bei x=${formatM(p.x)}, y=${formatM(p.y)} m — klicken zum Entfernen`}
          className="group flex items-center gap-1.5 rounded-full border border-[var(--color-panel-stroke)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:border-[var(--color-danger)]"
        >
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {p.corner !== undefined ? '◺ ' : ''}
            {formatM(p.w)}×{formatM(p.d)} m
          </span>
          <span className="text-[var(--color-text-muted)] group-hover:text-[var(--color-danger)]" aria-hidden>
            ×
          </span>
          <span className="sr-only">entfernen</span>
        </button>
      ))}
    </div>
  );
}
