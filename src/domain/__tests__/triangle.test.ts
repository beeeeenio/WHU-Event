import { describe, expect, it } from 'vitest';
import { nextTriangleCorner, phantomCorner, trianglePoints } from '../triangle';
import type { TriangleCorner } from '../types';

describe('phantomCorner', () => {
  it('liefert die diagonal gegenüberliegende Ecke für jede der 4 Ausrichtungen', () => {
    expect(phantomCorner('tl')).toBe('br');
    expect(phantomCorner('tr')).toBe('bl');
    expect(phantomCorner('bl')).toBe('tr');
    expect(phantomCorner('br')).toBe('tl');
  });
});

describe('trianglePoints', () => {
  const piece = { x: 0, y: 0, w: 2, d: 3 };

  it('liefert die 3 echten Eckpunkte je Ausrichtung, ohne die Phantom-Ecke', () => {
    expect(trianglePoints(piece, 'tl')).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 3 }]);
    expect(trianglePoints(piece, 'tr')).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }]);
    expect(trianglePoints(piece, 'bl')).toEqual([{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 2, y: 3 }]);
    expect(trianglePoints(piece, 'br')).toEqual([{ x: 2, y: 0 }, { x: 0, y: 3 }, { x: 2, y: 3 }]);
  });

  it('verschiebt die Punkte korrekt für ein Stück, das nicht am Ursprung liegt', () => {
    expect(trianglePoints({ x: 5, y: 4, w: 1, d: 1 }, 'tl')).toEqual([
      { x: 5, y: 4 },
      { x: 6, y: 4 },
      { x: 5, y: 5 },
    ]);
  });
});

describe('nextTriangleCorner', () => {
  it('rotiert im Uhrzeigersinn: tl→tr→br→bl→tl', () => {
    expect(nextTriangleCorner('tl')).toBe('tr');
    expect(nextTriangleCorner('tr')).toBe('br');
    expect(nextTriangleCorner('br')).toBe('bl');
    expect(nextTriangleCorner('bl')).toBe('tl');
  });

  it('kommt nach genau 4 Schritten wieder beim Ausgangspunkt an, für jede Startecke', () => {
    const corners: TriangleCorner[] = ['tl', 'tr', 'bl', 'br'];
    for (const start of corners) {
      let c = start;
      for (let i = 0; i < 4; i++) c = nextTriangleCorner(c);
      expect(c).toBe(start);
    }
  });
});
