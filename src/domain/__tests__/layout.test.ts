import { describe, expect, it } from 'vitest';
import { computeLayout } from '../layout';
import { countFeet } from '../feet';

describe('computeLayout — Golden Test gegen nivteccalculator.evtp.de', () => {
  it('8×6 m: 24 Podeste, Raster 4×6, 35 Füße, kein Sondermaß, Normal empfohlen', () => {
    const { normal, rotiert, recommended } = computeLayout(8, 6);

    expect(normal.cols).toBe(4);
    expect(normal.rows).toBe(6);
    expect(normal.panels).toHaveLength(24);
    expect(normal.hasSondermass).toBe(false);
    expect(countFeet(normal.panels)).toBe(35);

    expect(rotiert.cols).toBe(8);
    expect(rotiert.rows).toBe(3);
    expect(rotiert.panels).toHaveLength(24);
    expect(rotiert.hasSondermass).toBe(false);
    // Gleiche Fläche, gleiche Plattenzahl, aber ein 8×3-Raster hat mehr Gitterpunkte
    // (9×4=36) als ein 4×6-Raster (5×7=35) — deshalb ist "Normal" hier die bessere Wahl.
    expect(countFeet(rotiert.panels)).toBe(36);

    expect(recommended).toBe('normal');
  });

  it('alle Panel-Größen im Ergebnis sind 2×1 m im Normal-Raster', () => {
    const { normal } = computeLayout(8, 6);
    expect(normal.panelCountsBySize).toEqual({ '2x1': 24 });
  });
});

describe('computeLayout — Sondermaß laut NivTec-Anleitung (Substitutplatte, keine Drehung)', () => {
  it('8,5×6 m: Restspalte von 0,5 m wird mit einer 0,5×1 m Sondermaß-Platte je Reihe gefüllt', () => {
    const { normal } = computeLayout(8.5, 6);
    expect(normal.hasSondermass).toBe(true);
    expect(normal.cols).toBe(4);
    expect(normal.rows).toBe(6);
    const regular = normal.panels.filter((p) => !p.isSondermass);
    const sonder = normal.panels.filter((p) => p.isSondermass);
    expect(regular).toHaveLength(24);
    // Eine Sondermaß-Platte pro Reihe (6 Reihen), jeweils 0,5×1 m — keine Drehung.
    expect(sonder).toHaveLength(6);
    expect(sonder.every((p) => p.w === 0.5 && p.d === 1)).toBe(true);
    expect(normal.sondermassWarning).toBeUndefined();
  });

  it('warnt, wenn ein Restmaß in keine NivTec-Sondermaß-Platte (1,5/1,0/0,5 m) passt', () => {
    const { normal } = computeLayout(8.3, 6);
    expect(normal.hasSondermass).toBe(true);
    expect(normal.sondermassWarning).toBeDefined();
    // Kein Fill-Panel, da 0,3 m zu keiner Standardgröße passt.
    expect(normal.panels).toHaveLength(24);
  });

  it('warnt, wenn die Tiefe (fixe 1-m-Achse) kein Vielfaches von 1 m ist', () => {
    const { normal } = computeLayout(8, 6.4);
    expect(normal.rows).toBe(6);
    expect(normal.hasSondermass).toBe(true);
    expect(normal.sondermassWarning).toContain('Vielfaches von 1');
  });
});

describe('computeLayout — Sondermaß auf der festen 2-m-Achse (0,5×2-Platte)', () => {
  it('2,5 m Breite bei 2 m Tiefe (rotiert): Restbreite 0,5 m wird mit der 0,5×2-Platte gefüllt', () => {
    const { rotiert } = computeLayout(2.5, 2);
    expect(rotiert.hasSondermass).toBe(true);
    expect(rotiert.sondermassWarning).toBeUndefined();
    const regular = rotiert.panels.filter((p) => !p.isSondermass);
    const sonder = rotiert.panels.filter((p) => p.isSondermass);
    expect(regular).toHaveLength(2); // 2 Spalten à 1×2 m (rotierte Hauptplatte)
    expect(sonder).toHaveLength(1);
    expect(sonder[0]).toMatchObject({ w: 0.5, d: 2 });
  });

  it('2,3 m Breite bei 2 m Tiefe (rotiert): Restbreite 0,3 m passt zu keiner Sondermaß-Platte → nur Warnung', () => {
    const { rotiert } = computeLayout(2.3, 2);
    expect(rotiert.sondermassWarning).toBeDefined();
    expect(rotiert.panels.filter((p) => p.isSondermass)).toHaveLength(0);
  });
});

describe('computeLayout — Randfall: eine Ausrichtung baut gar nichts', () => {
  it('3×0,5 m: Normal-Ausrichtung liefert 0 Podeste (Tiefe < 1 m), Rotiert wird empfohlen', () => {
    const { normal, rotiert, recommended } = computeLayout(3, 0.5);
    expect(normal.panels).toHaveLength(0);
    expect(rotiert.panels.length).toBeGreaterThan(0);
    expect(recommended).toBe('rotiert');
  });
});

describe('computeLayout — kleine Aufbauten (Tisch-Anwendungsfall)', () => {
  it('2×1 m: genau eine Standardplatte, 4 Füße', () => {
    const { normal } = computeLayout(2, 1);
    expect(normal.panels).toHaveLength(1);
    expect(countFeet(normal.panels)).toBe(4);
  });
});
