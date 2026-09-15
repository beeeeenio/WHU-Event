export type StructureTypeId = 'buehne' | 'tisch' | 'tresen' | 'tribuene';

export type FootType = 'fest' | 'spindel';

export type RailingSide = 'hinten' | 'links' | 'rechts' | 'vorne';

/** Eine Standard-Plattengröße aus dem Katalog eines Aufbautyps. */
export interface PanelSize {
  /** Breite in Metern (lange Seite bei den meisten Größen) */
  w: number;
  /** Tiefe in Metern */
  d: number;
  /**
   * true = nur als Sondermaß-Substitut für den Restbereich der Modulachse nutzbar
   * (schmalere Platte gleicher Tiefe), nicht fürs Hauptraster. Laut NivTec-Anleitung
   * wird dafür NICHT rotiert, sondern eine schmalere Platte gleicher Bautiefe verbaut.
   */
  sondermassOnly?: boolean;
}

/** Welche Ecke der Bounding-Box eines Dreieckpodests den rechten Winkel trägt. */
export type TriangleCorner = 'tl' | 'tr' | 'bl' | 'br';

/** Eine platzierte Platte im Grundriss, in Metern, Ursprung oben-links. */
export interface PanelInstance {
  x: number;
  y: number;
  w: number;
  d: number;
  /** z.B. "2x1" — Schlüssel für die Materialliste */
  sizeKey: string;
  isSondermass: boolean;
  /** Nur gesetzt für das echte Dreieckpodest — siehe Piece2D.corner in customShape.ts für die
   *  volle Erklärung (insb. die (1,1)-Mehrdeutigkeit mit dem echten 1×1-Rechteck). */
  corner?: TriangleCorner;
  /** Überschreibt die Fuß-Höhe NUR für diese Platte (z.B. Ausgleich bei unebenem Untergrund) —
   *  sonst gilt die globale Aufbauhöhe. Betrifft nur Fuß-Farbe/Materialliste, nicht die Höhe der
   *  Platte selbst (die Deckfläche bleibt eben, siehe labeledFootPositions in feet.ts). */
  footHeightCm?: number;
}

export interface LayoutResult {
  orientation: 'normal' | 'rotiert';
  widthM: number;
  depthM: number;
  areaM2: number;
  cols: number;
  rows: number;
  panels: PanelInstance[];
  panelCountsBySize: Record<string, number>;
  hasSondermass: boolean;
  /** Warnung, wenn der Reststreifen nicht sauber mit Standardgrößen gefüllt werden konnte */
  sondermassWarning?: string;
}

export interface FootCount {
  heightCm: number;
  type: FootType;
  count: number;
}

export interface RailingRequirement {
  required: boolean;
  optional: boolean;
  activeSides: RailingSide[];
}

export interface StairsResult {
  heightCm: number;
  stepCount: number;
  stepHeightCm: number;
  stepDepthM: number;
}

export interface RampResult {
  heightCm: number;
  inclineRatio: number;
  lengthM: number;
}

export interface MaterialListItem {
  pos: number;
  gruppe: string;
  artikel: string;
  /** Offizielle NivTec-Artikelnummer, falls bekannt (nur Bühne/Tribüne-Bauteile). */
  artikelNr?: string;
  menge: number;
  einheit: string;
}
