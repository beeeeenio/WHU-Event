import { describe, expect, it } from 'vitest';
import { buildLayoutFromPieces, type Piece2D } from '../customShape';
import { buildMaterialList } from '../materialList';
import type { RailingSide } from '../types';

function piece(id: string, x: number, y: number, w: number, d: number): Piece2D {
  return { id, x, y, w, d };
}

function offset(pieces: Piece2D[], dx: number, dy: number): Piece2D[] {
  return pieces.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

describe('buildMaterialList', () => {
  // 100 cm: Diagonalverstrebung (perimeterbasiert) ist dabei, Geländer ebenfalls — beides hing
  // früher an layout.widthM/depthM, die vom Ursprung aus messen.
  const input = {
    structureType: 'buehne' as const,
    heightCm: 100,
    activeRailingSides: ['vorne', 'links'] as RailingSide[],
  };
  const atOrigin = [piece('a', 0, 0, 2, 1), piece('b', 2, 0, 2, 1), piece('c', 0, 1, 2, 1)];

  it('hängt nicht davon ab, wo die Fläche auf der Zeichenfläche liegt', () => {
    const reference = buildMaterialList({ ...input, layout: buildLayoutFromPieces(atOrigin) });
    const moved = buildMaterialList({ ...input, layout: buildLayoutFromPieces(offset(atOrigin, 1.5, 0.5)) });
    expect(moved).toEqual(reference);
  });

  it('zählt die Diagonalverstrebung aus dem echten Umfang (4×2 m → 6 Stück)', () => {
    const items = buildMaterialList({ ...input, layout: buildLayoutFromPieces(offset(atOrigin, 3, 0)) });
    const diagonal = items.find((i) => i.artikel.startsWith('Diagonalverstrebung'));
    expect(diagonal?.menge).toBe(Math.ceil((2 * (4 + 2)) / 2));
  });
});
