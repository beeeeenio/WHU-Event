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

export const SONDERMASS_PANELS: PanelSize[] = [
  { w: 1.5, d: 1, sondermassOnly: true },
  { w: 1, d: 1, sondermassOnly: true },
  { w: 0.5, d: 1, sondermassOnly: true },
  // Substitut für die 2-m-Achse (analog zu den drei obigen für die 1-m-Modulachse) — genau wie
  // diese ebenfalls frei drehbar verbaubar.
  { w: 0.5, d: 2, sondermassOnly: true },
];

/** Kein echtes rechteckiges Katalogstück: das rechtwinklige Dreieckpodest (Katheten 1×1 m,
 *  halbe 1×1-m-Fläche diagonal geteilt). Eigener Schlüssel, bewusst NICHT sizeKey(1,1) — sonst
 *  würde es mit dem echten 1×1-Sondermaß-Rechteck kollidieren/zusammengezählt werden. */
export const TRIANGLE_PANEL_SIZE_M = 1;
export const TRIANGLE_SIZE_KEY = 'dreieck-1x1';

/** Bekannte Artikelnummern, Schlüssel = sortiertes (w,d)-Paar (Orientierung egal). */
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
  return SONDERMASS_PANELS.filter((p) => closeTo(p.d, depthM))
    .map((p) => p.w)
    .sort((a, b) => b - a);
}

function closeTo(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** True für die Hauptplatte in JEDER Orientierung (2×1 normal oder 1×2 gedreht) — beide sind
 *  derselbe reale Artikel (111 01 0), nur um 90° gedreht verbaut. */
export function isPrimaryPanelPiece(w: number, d: number): boolean {
  const p = PRIMARY_PANEL;
  return (closeTo(w, p.w) && closeTo(d, p.d)) || (closeTo(w, p.d) && closeTo(d, p.w));
}

/** Sondermaß-Substitut ist eine der Größen aus SONDERMASS_PANELS, in JEDER Orientierung — siehe
 *  Korrektur oben, Sondermaß-Platten werden genau wie die Hauptplatte gedreht verbaut. (w=1,
 *  d=2) z.B. ist trotzdem KEIN Sondermaß-Stück, sondern die Hauptplatte gedreht — deshalb bei
 *  Mehrdeutigkeit zuerst gegen die Hauptplatte prüfen (Vorrang, siehe auch catalogSizeKey). */
export function isSondermassPiece(w: number, d: number): boolean {
  if (isPrimaryPanelPiece(w, d)) return false;
  return SONDERMASS_PANELS.some((p) => (closeTo(p.w, w) && closeTo(p.d, d)) || (closeTo(p.w, d) && closeTo(p.d, w)));
}

/** Gruppierungsschlüssel für Materialliste/Zählung: jedes echte Katalogstück (Hauptplatte wie
 *  Sondermaß) zählt als EIN Artikel, unabhängig von seiner Orientierung — sonst wären z.B.
 *  sizeKey(0,5,1) und sizeKey(1,0,5) fälschlich unterschiedliche, doppelt gezählte Posten für
 *  dieselbe reale Platte. Normalisiert auf die im Katalog hinterlegte (w,d)-Reihenfolge, damit
 *  die Materialliste unabhängig davon, wie ein Stück gerade gedreht liegt, immer denselben
 *  Schlüssel/dieselbe Anzeige liefert. */
export function catalogSizeKey(w: number, d: number): string {
  if (isPrimaryPanelPiece(w, d)) return sizeKey(PRIMARY_PANEL.w, PRIMARY_PANEL.d);
  const match = SONDERMASS_PANELS.find((p) => (closeTo(p.w, w) && closeTo(p.d, d)) || (closeTo(p.w, d) && closeTo(p.d, w)));
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
