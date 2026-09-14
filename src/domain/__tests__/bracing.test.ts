import { describe, expect, it } from 'vitest';
import { countHorizontalBraces } from '../bracing';
import { computeLayout } from '../layout';
import type { PanelInstance } from '../types';

describe('countHorizontalBraces', () => {
  it('8×6 m Raster (4×6 Zellen à 2×1 m): 28 Horizontalen à 2 m, 30 Horizontalen à 1 m', () => {
    const { normal } = computeLayout(8, 6);
    const braces = countHorizontalBraces(normal.panels);
    expect(braces).toEqual([
      { lengthMm: 2000, count: 28 },
      { lengthMm: 1000, count: 30 },
    ]);
  });

  it('eine einzelne 2×1 m Platte: 2 Horizontalen à 2 m, 2 Horizontalen à 1 m (der Rahmen selbst)', () => {
    const { normal } = computeLayout(2, 1);
    const braces = countHorizontalBraces(normal.panels);
    expect(braces).toEqual([
      { lengthMm: 2000, count: 2 },
      { lengthMm: 1000, count: 2 },
    ]);
  });

  it('ein einzelnes Dreieckpodest (1×1, rechter Winkel oben-links): nur die 2 echten Katheten, keine Hypotenuse', () => {
    const triangle: PanelInstance = { x: 0, y: 0, w: 1, d: 1, sizeKey: 'dreieck-1x1', isSondermass: false, corner: 'tl' };
    const braces = countHorizontalBraces([triangle]);
    // Beide Katheten sind 1 m lang (tl-tr oben, tl-bl links) — zusammengefasst zu einem Eintrag.
    expect(braces).toEqual([{ lengthMm: 1000, count: 2 }]);
  });

  it('Dreieck + angrenzendes Rechteck mit deckungsgleicher Kante: die geteilte Kante wird nur einmal gezählt', () => {
    // Dreieck bei (0,0), rechter Winkel oben-links → echte Kanten (0,0)-(1,0) [oben] und
    // (0,0)-(0,1) [links]. Rechteck direkt darüber bei (0,-1): seine untere Kante ist exakt
    // (0,0)-(1,0) — dieselbe Strecke wie die obere Kathete des Dreiecks.
    const triangle: PanelInstance = { x: 0, y: 0, w: 1, d: 1, sizeKey: 'dreieck-1x1', isSondermass: false, corner: 'tl' };
    const rectAbove: PanelInstance = { x: 0, y: -1, w: 1, d: 1, sizeKey: '1x1', isSondermass: true };
    const braces = countHorizontalBraces([triangle, rectAbove]);
    // Eindeutige Kanten: Dreieck-links (0,0)-(0,1), Rechteck-oben/-links/-rechts (3 Kanten) und
    // die EINE geteilte Kante (0,0)-(1,0) — macht 5, nicht 2+4=6 (die Dedup-Ersparnis von 1).
    expect(braces).toEqual([{ lengthMm: 1000, count: 5 }]);
  });
});
