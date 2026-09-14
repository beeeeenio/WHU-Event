import { phantomCorner } from './triangle';
import type { PanelInstance } from './types';

function roundMM(v: number): number {
  return Math.round(v * 1000);
}

function edgeKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = `${roundMM(x1)}:${roundMM(y1)}`;
  const b = `${roundMM(x2)}:${roundMM(y2)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface HorizontalBraceCount {
  lengthMm: number;
  count: number;
}

/**
 * Horizontalverstrebungen laufen laut NivTec-Anleitung AUSNAHMSLOS zwischen jedem
 * Paar benachbarter Füße (in allen Reihen und allen Achsen), unabhängig von der
 * Aufbauhöhe. Jede Plattenkante entspricht genau einer Horizontalen zwischen zwei
 * Fußpositionen; gemeinsame Kanten benachbarter Platten werden dedupliziert (wie
 * bei den Füßen selbst), damit keine Kante doppelt gezählt wird.
 */
export function countHorizontalBraces(panels: PanelInstance[]): HorizontalBraceCount[] {
  const edges = new Map<string, number>();
  for (const p of panels) {
    const corners = {
      tl: { x: p.x, y: p.y },
      tr: { x: p.x + p.w, y: p.y },
      bl: { x: p.x, y: p.y + p.d },
      br: { x: p.x + p.w, y: p.y + p.d },
    };
    // Ein Dreieckpodest hat nur seine 2 echten Katheten als Kante — kein Bauteil entlang der
    // Hypotenuse oder der beiden Kanten, die die Phantom-Ecke berühren (dieses System bildet
    // ohnehin keine diagonalen Streben ab, siehe Doku bei countHorizontalBraces oben).
    const omit = p.corner !== undefined ? phantomCorner(p.corner) : null;
    const sides: Array<[keyof typeof corners, keyof typeof corners, number]> = [
      ['tl', 'tr', p.w],
      ['bl', 'br', p.w],
      ['tl', 'bl', p.d],
      ['tr', 'br', p.d],
    ];
    for (const [aKey, bKey, length] of sides) {
      if (omit !== null && (aKey === omit || bKey === omit)) continue;
      const a = corners[aKey];
      const b = corners[bKey];
      const key = edgeKey(a.x, a.y, b.x, b.y);
      if (!edges.has(key)) edges.set(key, Math.round(length * 1000));
    }
  }

  const counts = new Map<number, number>();
  for (const lengthMm of edges.values()) {
    counts.set(lengthMm, (counts.get(lengthMm) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([lengthMm, count]) => ({ lengthMm, count }))
    .sort((a, b) => b.lengthMm - a.lengthMm);
}
