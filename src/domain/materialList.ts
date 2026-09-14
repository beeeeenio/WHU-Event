import { countHorizontalBraces } from './bracing';
import { countFeet } from './feet';
import { articleNumberFor, TRIANGLE_SIZE_KEY } from './panels';
import { isBracingRequired, isHorizontalBracingRequired } from './rules';
import type { LayoutResult, MaterialListItem, RailingSide, StructureTypeId } from './types';

/** Gängige Geländer-Segmentlängen in Metern, größte zuerst. */
const RAILING_ELEMENT_LENGTHS = [2, 1];

function splitIntoElements(lengthM: number, lengths: number[] = RAILING_ELEMENT_LENGTHS): number[] {
  const sorted = [...lengths].sort((a, b) => b - a);
  let remaining = lengthM;
  const out: number[] = [];
  while (remaining > 1e-6) {
    const fit = sorted.find((l) => l <= remaining + 1e-6) ?? sorted[sorted.length - 1];
    out.push(fit);
    remaining -= fit;
  }
  return out;
}

function parseSizeKey(key: string): { w: number; d: number } {
  const [wStr, dStr] = key.split('x');
  return { w: parseFloat(wStr.replace(',', '.')), d: parseFloat(dStr.replace(',', '.')) };
}

function formatPanelLabel(w: number, d: number): string {
  const fmt = (v: number) => v.toFixed(1).replace('.', ',');
  return `Systempodest ${fmt(w)}×${fmt(d)} m`;
}

/** Fußgruppen mit Aussteifung (Horizontal-/Diagonalverstrebung) — nur echte Gerüstsysteme, nicht Tisch. */
const SCAFFOLD_TYPES: StructureTypeId[] = ['buehne', 'tribuene', 'tresen'];

export interface MaterialListInput {
  structureType: StructureTypeId;
  layout: LayoutResult;
  heightCm: number;
  activeRailingSides: RailingSide[];
  /** Überschreibt die Fuß-Artikelbezeichnung (z.B. für Spindelfüße statt LV-Füßen). */
  footLabel?: string;
  /** Überschreibt, ob Horizontal-/Diagonalverstrebung mit aufgeführt wird (Standard: je nach Aufbautyp). */
  includeBracing?: boolean;
}

export function buildMaterialList({
  structureType,
  layout,
  heightCm,
  activeRailingSides,
  footLabel,
  includeBracing,
}: MaterialListInput): MaterialListItem[] {
  const items: MaterialListItem[] = [];
  let pos = 1;

  const sizeKeys = Object.keys(layout.panelCountsBySize).sort();
  for (const key of sizeKeys) {
    if (key === TRIANGLE_SIZE_KEY) {
      // Eigener Zweig statt parseSizeKey/articleNumberFor(1,1) — das würde fälschlich die
      // Artikelnummer des echten 1×1-Rechtecks liefern (siehe (1,1)-Mehrdeutigkeit in
      // customShape.ts). Keine Artikelnummer bekannt → bleibt undefined, rendert wie jeder
      // andere unbekannte Artikel als "–" (MaterialListTable.tsx, bestehendes Verhalten).
      items.push({
        pos: pos++,
        gruppe: 'PLATTEN',
        artikel: 'Systempodest, Dreieck 1×1 m (rechtwinklig)',
        artikelNr: undefined,
        menge: layout.panelCountsBySize[key],
        einheit: 'Stk.',
      });
      continue;
    }
    const { w, d } = parseSizeKey(key);
    items.push({
      pos: pos++,
      gruppe: 'PLATTEN',
      artikel: formatPanelLabel(w, d),
      artikelNr: articleNumberFor(w, d),
      menge: layout.panelCountsBySize[key],
      einheit: 'Stk.',
    });
  }

  const totalFeet = countFeet(layout.panels);
  if (totalFeet > 0) {
    items.push({
      pos: pos++,
      gruppe: 'FÜSSE',
      artikel: footLabel ?? `Alu-Lastenverteilerfuß (LV-Fuß), BH: ${heightCm} cm`,
      menge: totalFeet,
      einheit: 'Stk.',
    });
  }

  if (activeRailingSides.length > 0) {
    const segmentCounts = new Map<number, number>();
    for (const side of activeRailingSides) {
      const length = side === 'links' || side === 'rechts' ? layout.depthM : layout.widthM;
      for (const seg of splitIntoElements(length)) {
        segmentCounts.set(seg, (segmentCounts.get(seg) ?? 0) + 1);
      }
    }
    const railingHeightCm = structureType === 'tribuene' ? 110 : 100;
    const railingName = structureType === 'tribuene' ? 'Stabsicherheitsgeländer' : 'Sicherheitsgeländer';
    for (const [seg, count] of Array.from(segmentCounts.entries()).sort((a, b) => b[0] - a[0])) {
      items.push({
        pos: pos++,
        gruppe: 'GELÄNDER',
        artikel: `${railingName} H: ${railingHeightCm} cm, B: ${seg.toFixed(1).replace('.', ',')} m`,
        menge: count,
        einheit: 'Stk.',
      });
    }
  }

  const shouldIncludeBracing = includeBracing ?? SCAFFOLD_TYPES.includes(structureType);
  if (shouldIncludeBracing && totalFeet > 0) {
    // Laut Aufbauregeln 2.1-2.3: <80cm keine Verstrebung, 80-140cm nur Diagonal-,
    // erst >140cm zusätzlich Horizontalverstrebung — NICHT immer verbaut.
    if (isHorizontalBracingRequired(structureType, heightCm)) {
      for (const { lengthMm, count } of countHorizontalBraces(layout.panels)) {
        items.push({
          pos: pos++,
          gruppe: 'VERSTREBUNG',
          artikel: `Horizontalverstrebung, ${lengthMm} mm`,
          menge: count,
          einheit: 'Stk.',
        });
      }
    }

    if (isBracingRequired(structureType, heightCm)) {
      // Vereinfachte Näherung für die Diagonalenlänge (Pythagoras aus 2 m-Feld + Höhe);
      // die exakte Abstandsregel (max. X freie Felder je Achse) wird nicht nachgebildet.
      const heightM = heightCm / 100;
      const diagonalLengthMm = Math.round(Math.sqrt(2 ** 2 + heightM ** 2) * 1000);
      const perimeter = 2 * (layout.widthM + layout.depthM);
      const bracingCount = Math.max(1, Math.ceil(perimeter / 2));
      items.push({
        pos: pos++,
        gruppe: 'VERSTREBUNG',
        artikel: `Diagonalverstrebung, ${diagonalLengthMm} mm (BH ${heightCm} cm)`,
        menge: bracingCount,
        einheit: 'Stk.',
      });
    }
  }

  return items;
}

/** Fasst mehrere Materiallisten (z.B. je Tribünen-Reihe oder Tresen-Ebene) zusammen und summiert gleiche Artikel. */
export function mergeMaterialLists(lists: MaterialListItem[][]): MaterialListItem[] {
  const merged = new Map<string, MaterialListItem>();
  const order: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.gruppe}::${item.artikel}::${item.einheit}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...item });
        order.push(key);
      } else {
        existing.menge += item.menge;
      }
    }
  }
  return order.map((key, i) => ({ ...merged.get(key)!, pos: i + 1 }));
}

/** Gruppiert Materialliste-Positionen für die Anzeige (z.B. mit Zwischenüberschriften). */
export function groupMaterialList(items: MaterialListItem[]): Array<[string, MaterialListItem[]]> {
  const groups = new Map<string, MaterialListItem[]>();
  for (const item of items) {
    if (!groups.has(item.gruppe)) groups.set(item.gruppe, []);
    groups.get(item.gruppe)!.push(item);
  }
  return Array.from(groups.entries());
}
