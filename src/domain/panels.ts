import type { PanelSize } from './types';

/**
 * NivTec-Systempodest-Katalog. Quelle: offizielle NivTec-Anleitung "Edition 3.0",
 * Teil I/II (Artikelnummern, Aufbauschemata). Bühne, Tisch, Tresen und Tribüne
 * werden alle aus DENSELBEN Podestplatten gebaut — nur Höhe, Anordnung und
 * Zubehör (Geländer/Aussteifung) unterscheiden sich je Aufbautyp.
 *
 * Hauptplatte 200×100 cm (Art. 111 01 0). Sondermaß-Randfelder füllen Restbreiten schmaler
 * als die Hauptplatte, gleiche Bautiefe wie die Reihe, die sie ergänzen.
 *
 * Korrektur (nach Bennis eigener Praxiserfahrung, "das habe ich schon oft so gemacht"): Sondermaß-
 * Platten werden entgegen der ursprünglichen Annahme in diesem Projekt SEHR WOHL gedreht verbaut,
 * genau wie die Hauptplatte — es gibt keine feste, unveränderliche Bautiefe-Achse. `isSondermassPiece`/
 * `catalogSizeKey` erkennen daher beide Orientierungen einer Größe als denselben Artikel.
 */
export const PRIMARY_PANEL: PanelSize = { w: 2, d: 1 };

export const CATALOG_WIDTHS_M = [2, 1.5, 1] as const;
export const CATALOG_DEPTHS_M = [1, 0.75, 0.5, 0.39] as const;

/** Alle rechteckigen Katalogplatten (Standardausführung), in Katalog-Orientierung (w = Breite).
 *  13 Einträge: die 3×4-Matrix (2,1.5,1 m × 1,0.75,0.5,0.39 m) plus die 0.5×0.5 m-Platte. */
export const RECT_CATALOG: PanelSize[] = [
  ...CATALOG_WIDTHS_M.flatMap((w) =>
    CATALOG_DEPTHS_M.map((d) => ({ w, d, sondermassOnly: !(w === 2 && d === 1) })),
  ),
  { w: 0.5, d: 0.5, sondermassOnly: true },
];

/** Kein echtes rechteckiges Katalogstück: das rechtwinklige Dreieckpodest (Katheten 1×1 m,
 *  halbe 1×1-m-Fläche diagonal geteilt). Eigener Schlüssel, bewusst NICHT sizeKey(1,1) — sonst
 *  würde es mit dem echten 1×1-Sondermaß-Rechteck kollidieren/zusammengezählt werden. */
export const TRIANGLE_PANEL_SIZE_M = 1;
export const TRIANGLE_SIZE_KEY = 'dreieck-1x1';

/** Viertelkreis-Podest: Radius 1 m, Bounding-Box 1×1 m. */
export const QUARTER_CIRCLE_RADIUS_M = 1;
export const QUARTER_CIRCLE_SIZE_KEY = 'viertelkreis-r1';

/** 2×1 m Dreieckpodeste: Katheten 2×1 m, Bounding-Box 2×1 oder 1×2 je Orientierung. */
export const TRIANGLE_2X1_LEFT_KEY = 'dreieck-2x1-links';
export const TRIANGLE_2X1_RIGHT_KEY = 'dreieck-2x1-rechts';

/** Bekannte Artikelnummern, Schlüssel = sortiertes (w,d)-Paar (Orientierung egal).
 *  Weitere Nummern unbekannt → '–', bewusst nicht erfunden. */
const ARTICLE_NUMBERS: Record<string, string> = {
  '1x2': '111 01 0',
  '1x1.5': '111 03 0',
  '1x1': '111 05 0',
  '0.5x1': '111 06 0',
};

export function sizeKey(w: number, d: number): string {
  return `${formatM(w)}x${formatM(d)}`;
}

function formatM(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toString().replace('.', ',');
}

export function primaryPanel(): PanelSize {
  return PRIMARY_PANEL;
}

/** Verfügbare Sondermaß-Substitutbreiten (groß → klein) für eine gegebene Bautiefe — die
 *  1-m-Modulachse hat drei (1,5/1/0,5), die feste 2-m-Achse genau eine (0,5). Pflicht-Parameter
 *  (kein impliziter 1-m-Standard mehr): eine der beiden Achsen zu vergessen hieße sonst wieder
 *  unbemerkt "auf der 2-m-Achse gibt es keine Substitution" anzunehmen — genau der Fehler,
 *  den die 0,5×2-Platte hier korrigiert. */
export function sondermassSubstituteWidths(depthM: number): number[] {
  // Äquivalent zu den alten SONDERMASS_PANELS:
  // d=1: [1.5, 1, 0.5] (direkt (1.5,1), (1,1), und rotiert (0.5,1) = (1,0.5))
  // d=2: [0.5] (rotiert (0.5,2) = (2,0.5))
  if (closeTo(depthM, 1)) {
    return [1.5, 1, 0.5];
  }
  if (closeTo(depthM, 2)) {
    return [0.5];
  }
  // Für andere Tiefen, die nicht in den ursprünglichen SONDERMASS_PANELS vorkamen
  return [];
}

function closeTo(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** Sucht die Katalog-Größe mit gegebenen (w,d) oder (d,w), unabhängig von Orientierung.
 *  Gibt undefined zurück, wenn keine exakte Match vorliegt. */
export function findCatalogRect(w: number, d: number): PanelSize | undefined {
  return RECT_CATALOG.find((p) => (closeTo(p.w, w) && closeTo(p.d, d)) || (closeTo(p.w, d) && closeTo(p.d, w)));
}

/** True, wenn (w,d) oder (d,w) in RECT_CATALOG vorhanden ist. */
export function isCatalogRect(w: number, d: number): boolean {
  return findCatalogRect(w, d) !== undefined;
}

/** Alle Breiten w aus RECT_CATALOG, für die ein Eintrag (w, depthM) ODER (depthM, w) existiert.
 *  Sortiert groß → klein, ohne Duplikate. */
export function widthsForDepth(depthM: number): number[] {
  const widths = new Set<number>();
  for (const entry of RECT_CATALOG) {
    if (closeTo(entry.d, depthM)) widths.add(entry.w);
    if (closeTo(entry.w, depthM)) widths.add(entry.d);
  }
  return Array.from(widths).sort((a, b) => b - a);
}

/** True für die Hauptplatte in JEDER Orientierung (2×1 normal oder 1×2 gedreht) — beide sind
 *  derselbe reale Artikel (111 01 0), nur um 90° gedreht verbaut. */
export function isPrimaryPanelPiece(w: number, d: number): boolean {
  const p = PRIMARY_PANEL;
  return (closeTo(w, p.w) && closeTo(d, p.d)) || (closeTo(w, p.d) && closeTo(d, p.w));
}

/** Sondermaß-Stück = aus RECT_CATALOG, aber NICHT die 2×1-Hauptplatte (nur UI-Hervorhebung,
 *  ändert nichts an Katalog-Verhalten oder Tests). */
export function isSondermassPiece(w: number, d: number): boolean {
  return isCatalogRect(w, d) && !isPrimaryPanelPiece(w, d);
}

/** Gruppierungsschlüssel für Materialliste/Zählung: jedes echte Katalogstück (Hauptplatte wie
 *  Sondermaß) zählt als EIN Artikel, unabhängig von seiner Orientierung — sonst wären z.B.
 *  sizeKey(0,5,1) und sizeKey(1,0,5) fälschlich unterschiedliche, doppelt gezählte Posten für
 *  dieselbe reale Platte. Normalisiert auf die im Katalog hinterlegte (w,d)-Reihenfolge, damit
 *  die Materialliste unabhängig davon, wie ein Stück gerade gedreht liegt, immer denselben
 *  Schlüssel/dieselbe Anzeige liefert. */
export function catalogSizeKey(w: number, d: number): string {
  if (isPrimaryPanelPiece(w, d)) return sizeKey(PRIMARY_PANEL.w, PRIMARY_PANEL.d);
  const match = findCatalogRect(w, d);
  return match ? sizeKey(match.w, match.d) : sizeKey(w, d);
}

function canonicalArticleKey(w: number, d: number): string {
  const [a, b] = [w, d].sort((x, y) => x - y);
  // Bewusst Punkt statt Komma (anders als formatM/sizeKey, die für die Anzeige
  // German-Komma nutzen) — reiner interner Lookup-Schlüssel, muss zu den
  // ARTICLE_NUMBERS-Keys oben passen.
  return `${a}x${b}`;
}

/** Offizielle NivTec-Artikelnummer für eine Plattengröße, falls bekannt. */
export function articleNumberFor(w: number, d: number): string | undefined {
  return ARTICLE_NUMBERS[canonicalArticleKey(w, d)];
}

/** True für Katalog-Dreieckpodeste: (1,1), (2,1), oder (1,2) innerhalb einer kleinen Toleranz. */
export function isCatalogTriangleBox(w: number, d: number): boolean {
  const eps = 1e-6;
  const isEqual = (a: number, b: number) => Math.abs(a - b) < eps;
  return (
    (isEqual(w, TRIANGLE_PANEL_SIZE_M) && isEqual(d, TRIANGLE_PANEL_SIZE_M)) ||
    (isEqual(w, 2) && isEqual(d, 1)) ||
    (isEqual(w, 1) && isEqual(d, 2))
  );
}
