import { describe, expect, it } from 'vitest';
import { articleNumberFor, catalogSizeKey, findCatalogRect, isCatalogRect, isPrimaryPanelPiece, isSondermassPiece, RECT_CATALOG, widthsForDepth } from '../panels';

describe('RECT_CATALOG', () => {
  it('enthält 13 Einträge (3×4 Grid plus 0,5×0,5)', () => {
    expect(RECT_CATALOG).toHaveLength(13);
  });

  it('enthält die 0,5×0,5-Platte mit sondermassOnly=true', () => {
    const entry = RECT_CATALOG.find((p) => Math.abs(p.w - 0.5) < 1e-6 && Math.abs(p.d - 0.5) < 1e-6);
    expect(entry).toBeDefined();
    expect(entry?.sondermassOnly).toBe(true);
  });

  it('markiert 2×1 mit sondermassOnly=false, alle anderen mit true', () => {
    const primary = RECT_CATALOG.find((p) => Math.abs(p.w - 2) < 1e-6 && Math.abs(p.d - 1) < 1e-6);
    expect(primary?.sondermassOnly).toBe(false);
    const others = RECT_CATALOG.filter((p) => !(Math.abs(p.w - 2) < 1e-6 && Math.abs(p.d - 1) < 1e-6));
    expect(others.every((p) => p.sondermassOnly === true)).toBe(true);
  });
});

describe('isCatalogRect', () => {
  it('ist true für bekannte Größen in jeder Orientierung', () => {
    expect(isCatalogRect(0.39, 2)).toBe(true);
    expect(isCatalogRect(2, 0.39)).toBe(true);
    expect(isCatalogRect(0.75, 1.5)).toBe(true);
    expect(isCatalogRect(1.5, 0.75)).toBe(true);
    expect(isCatalogRect(0.5, 0.5)).toBe(true);
  });

  it('ist false für unbekannte Größen', () => {
    expect(isCatalogRect(0.75, 0.75)).toBe(false);
    expect(isCatalogRect(0.39, 0.39)).toBe(false);
    expect(isCatalogRect(3, 1)).toBe(false);
  });
});

describe('findCatalogRect', () => {
  it('gibt die kanonische (w,d) zurück, egal welche Orientierung eingegeben wird', () => {
    const rect1 = findCatalogRect(2, 0.39);
    const rect2 = findCatalogRect(0.39, 2);
    expect(rect1).toBeDefined();
    expect(rect2).toBeDefined();
    expect(rect1?.w).toBe(2);
    expect(rect1?.d).toBe(0.39);
    expect(rect2?.w).toBe(2);
    expect(rect2?.d).toBe(0.39);
  });
});

describe('widthsForDepth', () => {
  it('gibt alle Breiten für Tiefe 1 m (direkt und gedreht), groß → klein', () => {
    // Einträge mit d=1: (2,1), (1.5,1), (1,1) → widths 2, 1.5, 1
    // Einträge mit w=1: (1,1), (1,0.75), (1,0.5), (1,0.39) → depths 1, 0.75, 0.5, 0.39
    expect(widthsForDepth(1)).toEqual([2, 1.5, 1, 0.75, 0.5, 0.39]);
  });

  it('gibt alle Breiten für Tiefe 0,5 m (direkt und gedreht)', () => {
    // Einträge mit d=0.5: (2,0.5), (1.5,0.5), (1,0.5) → widths 2, 1.5, 1
    // Einträge mit w=0.5: (0.5,0.5) → depth 0.5
    expect(widthsForDepth(0.5)).toEqual([2, 1.5, 1, 0.5]);
  });

  it('gibt Breiten für Tiefe 0,39 m (nur direkt, keine gedrehten Einträge mit w=0.39)', () => {
    // Einträge mit d=0.39: (2,0.39), (1.5,0.39), (1,0.39) → widths 2, 1.5, 1
    expect(widthsForDepth(0.39)).toEqual([2, 1.5, 1]);
  });

  it('gibt auch Breiten für Tiefe 2 m (von gedrehten Einträgen)', () => {
    // Einträge mit w=2: (2,1), (2,0.75), (2,0.5), (2,0.39) → depths 1, 0.75, 0.5, 0.39
    expect(widthsForDepth(2)).toEqual([1, 0.75, 0.5, 0.39]);
  });

  it('gibt leere Liste für Tiefe ohne bekannte Einträge', () => {
    expect(widthsForDepth(0.3)).toEqual([]);
  });
});

describe('articleNumberFor', () => {
  it('findet die Artikelnummer unabhängig von Komma/Punkt-Notation und Seitenreihenfolge', () => {
    expect(articleNumberFor(2, 1)).toBe('111 01 0');
    expect(articleNumberFor(1, 2)).toBe('111 01 0');
    expect(articleNumberFor(1.5, 1)).toBe('111 03 0');
    expect(articleNumberFor(1, 1.5)).toBe('111 03 0');
    expect(articleNumberFor(1, 1)).toBe('111 05 0');
    expect(articleNumberFor(0.5, 1)).toBe('111 06 0');
    expect(articleNumberFor(1, 0.5)).toBe('111 06 0');
  });

  it('gibt undefined für unbekannte Größen zurück', () => {
    expect(articleNumberFor(3, 3)).toBeUndefined();
  });
});

describe('isPrimaryPanelPiece', () => {
  it('erkennt die Hauptplatte in beiden Orientierungen', () => {
    expect(isPrimaryPanelPiece(2, 1)).toBe(true);
    expect(isPrimaryPanelPiece(1, 2)).toBe(true);
  });

  it('erkennt Sondermaß-Größen nicht als Hauptplatte', () => {
    expect(isPrimaryPanelPiece(1.5, 1)).toBe(false);
    expect(isPrimaryPanelPiece(1, 1)).toBe(false);
    expect(isPrimaryPanelPiece(0.5, 1)).toBe(false);
  });
});

describe('isSondermassPiece', () => {
  it('ist true für alle Katalog-Einträge außer 2×1', () => {
    expect(isSondermassPiece(1.5, 1)).toBe(true);
    expect(isSondermassPiece(1, 1)).toBe(true);
    expect(isSondermassPiece(0.5, 1)).toBe(true);
    expect(isSondermassPiece(0.5, 2)).toBe(true);
    expect(isSondermassPiece(0.5, 0.5)).toBe(true);
  });

  it('erkennt Sondermaß-Größen in jeder Orientierung', () => {
    expect(isSondermassPiece(1, 1.5)).toBe(true);
    expect(isSondermassPiece(1, 0.5)).toBe(true);
    expect(isSondermassPiece(2, 0.5)).toBe(true);
  });

  it('ist false für die Hauptplatte in jeder Orientierung', () => {
    expect(isSondermassPiece(2, 1)).toBe(false);
    expect(isSondermassPiece(1, 2)).toBe(false);
  });

  it('ist false für unbekannte Größen', () => {
    expect(isSondermassPiece(3, 3)).toBe(false);
  });
});

describe('catalogSizeKey', () => {
  it('gruppiert die Hauptplatte in beiden Orientierungen auf denselben Schlüssel', () => {
    expect(catalogSizeKey(2, 1)).toBe(catalogSizeKey(1, 2));
  });

  it('hält Sondermaß-Schlüssel eigenständig, auch untereinander', () => {
    expect(catalogSizeKey(1.5, 1)).not.toBe(catalogSizeKey(2, 1));
    expect(catalogSizeKey(1.5, 1)).not.toBe(catalogSizeKey(1, 1));
    expect(catalogSizeKey(1, 1)).not.toBe(catalogSizeKey(0.5, 1));
  });

  it('gruppiert eine gedrehte Sondermaß-Platte auf denselben Schlüssel wie ungedreht', () => {
    expect(catalogSizeKey(0.5, 1)).toBe(catalogSizeKey(1, 0.5));
    expect(catalogSizeKey(0.5, 2)).toBe(catalogSizeKey(2, 0.5));
    expect(catalogSizeKey(1.5, 1)).toBe(catalogSizeKey(1, 1.5));
  });

  it('normalisiert 0,39-m-Größen korrekt', () => {
    expect(catalogSizeKey(0.39, 2)).toBe(catalogSizeKey(2, 0.39));
  });
});
