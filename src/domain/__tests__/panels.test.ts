import { describe, expect, it } from 'vitest';
import { articleNumberFor, catalogSizeKey, isPrimaryPanelPiece, isSondermassPiece, sondermassSubstituteWidths } from '../panels';

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
  it('erkennt alle drei Sondermaß-Substitutbreiten bei Tiefe 1 m', () => {
    expect(isSondermassPiece(1.5, 1)).toBe(true);
    expect(isSondermassPiece(1, 1)).toBe(true);
    expect(isSondermassPiece(0.5, 1)).toBe(true);
  });

  it('erkennt die 0,5×2-Substitutplatte auf der festen 2-m-Achse', () => {
    expect(isSondermassPiece(0.5, 2)).toBe(true);
  });

  // Korrektur nach Bennis Praxiserfahrung: Sondermaß-Platten werden genau wie die Hauptplatte
  // gedreht verbaut — die frühere Annahme "Sondermaß nie gedreht" war falsch.
  it('erkennt Sondermaß-Substitutbreiten auch in gedrehter Orientierung', () => {
    expect(isSondermassPiece(1, 1.5)).toBe(true);
    expect(isSondermassPiece(1, 0.5)).toBe(true);
    expect(isSondermassPiece(2, 0.5)).toBe(true);
  });

  it('erkennt die Hauptplatte in keiner Orientierung als Sondermaß', () => {
    expect(isSondermassPiece(2, 1)).toBe(false);
    expect(isSondermassPiece(1, 2)).toBe(false);
  });

  it('erkennt eine unbekannte Größe nicht als Sondermaß', () => {
    expect(isSondermassPiece(3, 3)).toBe(false);
  });
});

describe('sondermassSubstituteWidths', () => {
  it('liefert die drei Substitutbreiten für die 1-m-Modulachse, groß zuerst', () => {
    expect(sondermassSubstituteWidths(1)).toEqual([1.5, 1, 0.5]);
  });

  it('liefert genau eine Substitutbreite (0,5) für die feste 2-m-Achse', () => {
    expect(sondermassSubstituteWidths(2)).toEqual([0.5]);
  });

  it('liefert eine leere Liste für eine Bautiefe ohne bekanntes Substitut', () => {
    expect(sondermassSubstituteWidths(3)).toEqual([]);
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
});
