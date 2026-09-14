import { describe, expect, it } from 'vitest';
import { countFeet, labeledFootPositions } from '../feet';
import {
  buildLayoutFromPieces,
  catalogPieceOptions,
  defaultWedgeTemplate,
  fillHorizontalSpan,
  fillVerticalSpan,
  findFreePosition,
  fitsAllAt,
  fitsAt,
  rotatePieceInPlace,
  wedgePiecesAt,
  type Piece2D,
} from '../customShape';
import type { TriangleCorner } from '../types';

function piece(id: string, x: number, y: number, w: number, d: number): Piece2D {
  return { id, x, y, w, d };
}

function trianglePiece(id: string, x: number, y: number, corner: TriangleCorner): Piece2D {
  return { id, x, y, w: 1, d: 1, corner };
}

describe('fitsAt', () => {
  it('erkennt keine Überlappung bei getrennten Stücken', () => {
    const existing = [piece('a', 0, 0, 2, 1)];
    expect(fitsAt(existing, 2, 0, 2, 1)).toBe(true);
  });

  it('erkennt Überlappung mit einem vorhandenen Stück', () => {
    const existing = [piece('a', 0, 0, 2, 1)];
    expect(fitsAt(existing, 1, 0, 2, 1)).toBe(false);
  });

  it('erkennt Überlappung mit einem GEDREHTEN vorhandenen Stück (vertauschte w/d)', () => {
    // Ein 1×2-Stück (gedrehte Hauptplatte) bei (0,0) reicht bis y=2 — ein Stück, das gegen ein
    // 2×1-Fußabdruck an derselben Stelle passen würde, muss hier trotzdem blockiert werden.
    const existing = [piece('a', 0, 0, 1, 2)];
    expect(fitsAt(existing, 0.5, 1.5, 1, 1)).toBe(false);
    expect(fitsAt(existing, 1, 0, 1, 2)).toBe(true);
  });

  it('behandelt sich berührende Kanten nicht als Überlappung', () => {
    const existing = [piece('a', 0, 0, 2, 1)];
    expect(fitsAt(existing, 2, 0, 2, 1)).toBe(true);
    expect(fitsAt(existing, 0, 1, 2, 1)).toBe(true);
  });

  it('excludeId lässt ein Stück sich nicht an sich selbst stoßen (Verschieben/Drehen an Ort)', () => {
    const existing = [piece('a', 0, 0, 2, 1)];
    expect(fitsAt(existing, 0, 0, 2, 1, 'a')).toBe(true);
    expect(fitsAt(existing, 0, 0, 1, 2, 'a')).toBe(true);
  });
});

describe('findFreePosition', () => {
  it('nimmt die gewünschte Position, wenn sie frei und rasterkonform ist', () => {
    expect(findFreePosition([], 2, 1, 3.2, 1.1)).toEqual({ x: 3, y: 1 });
  });

  it('klemmt negative Wünsche auf den Ursprung (kein Bauen vor der Vorderkante/links vom Rand)', () => {
    expect(findFreePosition([], 2, 1, -1, -1)).toEqual({ x: 0, y: 0 });
  });

  it('weicht bei Kollision zur nächstgelegenen freien Raster-Position aus', () => {
    const existing = [piece('a', 2, 0, 2, 1)];
    const result = findFreePosition(existing, 2, 1, 2, 0);
    expect(fitsAt(existing, result.x, result.y, 2, 1)).toBe(true);
    // Die nächstgelegene freie Position bei diesem einfachen Fall ist direkt daneben.
    expect(Math.hypot(result.x - 2, result.y - 0)).toBeLessThanOrEqual(2);
  });

  it('liefert für ein gedrehtes Stück (vertauschte w/d) ebenfalls eine kollisionsfreie Position', () => {
    const existing = [piece('a', 0, 0, 2, 1)];
    const result = findFreePosition(existing, 1, 2, 0, 0);
    expect(fitsAt(existing, result.x, result.y, 1, 2)).toBe(true);
  });

  it('excludeId erlaubt eine Position, die nur vom Stück selbst belegt ist (Verschieben an dieselbe Stelle)', () => {
    const existing = [piece('a', 2, 2, 2, 1)];
    expect(findFreePosition(existing, 2, 1, 2, 2, 'a')).toEqual({ x: 2, y: 2 });
  });

  it('liefert IMMER ein Ergebnis, auch dicht umgeben von vorhandenen Stücken auf allen Seiten', () => {
    const existing = [
      piece('n', 2, 0, 2, 2),
      piece('s', 2, 4, 2, 2),
      piece('w', 0, 2, 2, 2),
      piece('e', 4, 2, 2, 2),
    ];
    const result = findFreePosition(existing, 2, 2, 2, 2);
    expect(fitsAt(existing, result.x, result.y, 2, 2)).toBe(true);
  });
});

describe('buildLayoutFromPieces', () => {
  it('liefert eine leere Fläche ohne Stücke', () => {
    const layout = buildLayoutFromPieces([]);
    expect(layout.panels).toHaveLength(0);
    expect(layout.widthM).toBe(0);
    expect(layout.depthM).toBe(0);
  });

  it('baut ein einzelnes Stück korrekt auf (Größe, Fläche, Bounding Box)', () => {
    const layout = buildLayoutFromPieces([piece('a', 1, 1, 2, 1)]);
    expect(layout.panels).toHaveLength(1);
    expect(layout.widthM).toBe(3);
    expect(layout.depthM).toBe(2);
    expect(layout.areaM2).toBe(2);
  });

  it('gemischte Orientierung der Hauptplatte zählt als EIN Materialliste-Posten (Rotations-Zählbug-Regression)', () => {
    const layout = buildLayoutFromPieces([piece('a', 0, 0, 2, 1), piece('b', 2, 0, 1, 2)]);
    const keys = Object.keys(layout.panelCountsBySize);
    expect(keys).toHaveLength(1);
    expect(layout.panelCountsBySize[keys[0]]).toBe(2);
  });

  it('mischt ein Sondermaß-Stück nie mit der Hauptplatte in einen Posten', () => {
    const layout = buildLayoutFromPieces([piece('a', 0, 0, 2, 1), piece('b', 2, 0, 1.5, 1)]);
    expect(Object.keys(layout.panelCountsBySize)).toHaveLength(2);
    const sondermassPanel = layout.panels.find((p) => p.w === 1.5)!;
    expect(sondermassPanel.isSondermass).toBe(true);
    const primaryPanel = layout.panels.find((p) => p.w === 2)!;
    expect(primaryPanel.isSondermass).toBe(false);
  });

  it('baut eine echte L-Ecke: countFeet/labeledFootPositions fassen den gemeinsamen Eck-Fuß korrekt zusammen', () => {
    // Waagerechter Lauf (2×1 bei x=0..2,y=0..1) + gedrehter Schenkel (1×2 bei x=2..3,y=0..2) —
    // beide teilen sich die Ecke (2,0), die feet.ts (unverändert) generisch dedupliziert.
    const layout = buildLayoutFromPieces([piece('a', 0, 0, 2, 1), piece('b', 2, 0, 1, 2)]);
    expect(layout.panels).toHaveLength(2);
    // 4 unabhängige Ecken je Stück wären 8 — der gemeinsame Eckpunkt (2,0) spart einen Fuß.
    expect(countFeet(layout.panels)).toBe(7);
    const shared = labeledFootPositions(layout.panels).find((f) => f.x === 2 && f.y === 0);
    expect(shared?.podeste).toHaveLength(2);
  });

  it('behält bei einem Dreieckpodest die Ecke bei und nutzt den eigenen Dreieck-Schlüssel', () => {
    const layout = buildLayoutFromPieces([trianglePiece('a', 0, 0, 'tl')]);
    expect(layout.panels).toHaveLength(1);
    expect(layout.panels[0].corner).toBe('tl');
    const keys = Object.keys(layout.panelCountsBySize);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe('1x1'); // nicht derselbe Schlüssel wie das echte 1×1-Rechteck
  });

  it('(1,1)-Mehrdeutigkeit: ein Dreieckpodest und ein echtes 1×1-Rechteck bleiben 2 getrennte Materialliste-Posten', () => {
    const layout = buildLayoutFromPieces([trianglePiece('a', 0, 0, 'tl'), piece('b', 2, 0, 1, 1)]);
    expect(Object.keys(layout.panelCountsBySize)).toHaveLength(2);
    expect(layout.panels.find((p) => p.corner === 'tl')?.isSondermass).toBe(false);
    expect(layout.panels.find((p) => p.corner === undefined)?.isSondermass).toBe(true);
  });
});

describe('fillHorizontalSpan / fillVerticalSpan', () => {
  it('füllt einen waagerechten Lauf auf der Modulachse (1 m tief) inkl. Sondermaß-Zerlegung', () => {
    const pieces = fillHorizontalSpan(4.5, 1, 0, 3);
    expect(pieces.reduce((sum, p) => sum + p.w, 0)).toBeCloseTo(4.5, 5);
    for (const p of pieces) {
      expect([2, 1.5, 1, 0.5]).toContain(p.w);
      expect(p.d).toBe(1);
      expect(p.y).toBe(3);
    }
  });

  it('füllt einen waagerechten Lauf auf der festen 2-m-Achse jetzt auch mit der 0,5×2-Sondermaß-Platte (layout.ts-Fix)', () => {
    const pieces = fillHorizontalSpan(3.5, 2, 0, 0);
    expect(pieces.reduce((sum, p) => sum + p.w, 0)).toBeCloseTo(3.5, 5);
    expect(pieces.some((p) => p.w === 0.5)).toBe(true);
    for (const p of pieces) {
      expect([1, 0.5]).toContain(p.w);
      expect(p.d).toBe(2);
    }
  });

  it('füllt einen waagerechten Lauf auf der festen Achse (2 m tief) nur mit vollen 1-m-Stücken', () => {
    const pieces = fillHorizontalSpan(3, 2, 0, 0);
    expect(pieces).toHaveLength(3);
    for (const p of pieces) expect(p.w).toBe(1);
  });

  it('ist die transponierte Entsprechung von fillHorizontalSpan (keine eigene Mathematik)', () => {
    const horizontal = fillHorizontalSpan(4.5, 1, 2, 0);
    const vertical = fillVerticalSpan(4.5, 1, 0, 2);
    expect(vertical).toHaveLength(horizontal.length);
    for (let i = 0; i < horizontal.length; i++) {
      // x/y und w/d sind bei der vertikalen Variante vertauscht gegenüber der horizontalen.
      expect(vertical[i].y).toBeCloseTo(horizontal[i].x, 5);
      expect(vertical[i].d).toBeCloseTo(horizontal[i].w, 5);
      expect(vertical[i].x).toBe(0);
      expect(vertical[i].w).toBe(1);
    }
  });

  it('gibt eine leere Liste für eine Spannweite von 0 zurück', () => {
    expect(fillHorizontalSpan(0, 1, 0, 0)).toEqual([]);
    expect(fillVerticalSpan(0, 1, 0, 0)).toEqual([]);
  });
});

describe('wedgePiecesAt / defaultWedgeTemplate', () => {
  it('liefert einen 3-reihigen, symmetrisch zulaufenden Keil aus Katalogstücken, verankert bei (anchorX, anchorY)', () => {
    const template = defaultWedgeTemplate(1);
    const pieces = wedgePiecesAt(template, 5, 10);
    const depths = Array.from(new Set(pieces.map((p) => p.y))).sort((a, b) => a - b);
    expect(depths).toHaveLength(3);
    expect(depths[0]).toBe(10);

    const rowSpans = depths.map((y) => {
      const row = pieces.filter((p) => p.y === y);
      const starts = row.map((p) => p.x);
      const ends = row.map((p) => p.x + p.w);
      return { start: Math.min(...starts), end: Math.max(...ends) };
    });
    const widths = rowSpans.map((s) => s.end - s.start);
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);

    for (const span of rowSpans) {
      const center = (span.start + span.end) / 2 - 5;
      expect(center).toBeGreaterThan(template.baseWidthM / 2 - 0.5);
      expect(center).toBeLessThan(template.baseWidthM / 2 + 0.5);
    }

    for (const w of pieces.map((p) => p.w)) expect([2, 1.5, 1, 0.5]).toContain(w);
  });

  it('zerlegt auf der festen 2-m-Achse (rotiert) mit der einen dort verfügbaren Sondermaß-Breite (0,5×2)', () => {
    // Vor der 0,5×2-Katalogkorrektur gab es auf dieser Achse KEIN Substitut — die Verjüngung
    // musste künstlich auf volle 1-m-Schritte gerundet werden. Jetzt läuft sie im normalen
    // 0,5-m-Raster wie auf der 1-m-Achse auch; ein Restbreiten-Rest wird mit der neuen 0,5×2-
    // Platte gefüllt statt (wie vorher) gar nicht erst zu entstehen.
    const template = defaultWedgeTemplate(2);
    const pieces = wedgePiecesAt(template, 0, 0);
    for (const p of pieces) {
      expect([1, 0.5]).toContain(p.w);
      expect(p.d).toBe(2);
    }
    expect(pieces.some((p) => p.w === 0.5)).toBe(true);
  });

  it('liefert eine leere Liste ohne Reihen oder Breite', () => {
    expect(wedgePiecesAt({ baseWidthM: 6, rowCount: 0, pieceDepthM: 1 }, 0, 0)).toHaveLength(0);
    expect(wedgePiecesAt({ baseWidthM: 0, rowCount: 3, pieceDepthM: 1 }, 0, 0)).toHaveLength(0);
  });
});

describe('fitsAllAt (Mehrstück-Chargen-Policy)', () => {
  it('platziert eine vollständig passende Charge', () => {
    const existing = [piece('a', 10, 10, 2, 1)];
    const batch = fillHorizontalSpan(4, 1, 0, 0);
    expect(fitsAllAt(existing, batch)).toBe(true);
  });

  it('verwirft eine Charge komplett, wenn genau ein Stück kollidiert (kein Teil-Platzieren)', () => {
    const existing = [piece('blocker', 1, 0, 1, 1)];
    const batch = fillHorizontalSpan(4, 1, 0, 0);
    expect(batch.length).toBeGreaterThan(1);
    expect(fitsAllAt(existing, batch)).toBe(false);
  });
});

describe('catalogPieceOptions', () => {
  it('enthält die Hauptplatte, die drei 1-m-Sondermaß-Breiten und die neue 0,5×2-Platte', () => {
    const options = catalogPieceOptions();
    expect(options).toContainEqual({ w: 2, d: 1, isSondermass: false });
    expect(options).toContainEqual({ w: 1.5, d: 1, isSondermass: true });
    expect(options).toContainEqual({ w: 1, d: 1, isSondermass: true });
    expect(options).toContainEqual({ w: 0.5, d: 1, isSondermass: true });
    expect(options).toContainEqual({ w: 0.5, d: 2, isSondermass: true });
    expect(options).toHaveLength(5);
  });
});

describe('rotatePieceInPlace', () => {
  it('tauscht bei einem Rechteck Breite und Tiefe', () => {
    expect(rotatePieceInPlace(piece('a', 1, 2, 2, 1))).toMatchObject({ x: 1, y: 2, w: 1, d: 2 });
  });

  it('behält bei einem Rechteck Position/Id bei, ändert nur w/d', () => {
    const rotated = rotatePieceInPlace(piece('a', 1, 2, 2, 1));
    expect(rotated.id).toBe('a');
    expect(rotated.x).toBe(1);
    expect(rotated.y).toBe(2);
  });

  it('wechselt bei einem Dreieck die Ecke, lässt w/d/Position unverändert', () => {
    const rotated = rotatePieceInPlace(trianglePiece('a', 3, 4, 'tl'));
    expect(rotated).toMatchObject({ x: 3, y: 4, w: 1, d: 1, corner: 'tr' });
  });
});
