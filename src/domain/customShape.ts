import { computeLayout } from './layout';
import { catalogSizeKey, isSondermassPiece, primaryPanel, sondermassSubstituteWidths, TRIANGLE_SIZE_KEY } from './panels';
import { nextTriangleCorner } from './triangle';
import type { LayoutResult, PanelInstance, TriangleCorner } from './types';

const EPS = 1e-6;
const GRID_M = 0.5;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function snapToGrid(v: number): number {
  return Math.round(v / GRID_M) * GRID_M;
}

/**
 * Ein Reihenkonzept gibt es nicht mehr: jedes Stück ist ein frei positioniertes, frei
 * drehbares 2D-Rechteck. Ein 2×1-m-Podest bleibt derselbe reale Artikel, ob als (w=2,d=1)
 * oder gedreht als (w=1,d=2) platziert — keine neue Geometrie, nur eine andere Ausrichtung
 * derselben echten Platte.
 */
export interface Piece2D {
  id: string;
  x: number;
  y: number;
  w: number;
  d: number;
  /** Nur gesetzt für das echte Dreieckpodest (Katheten 1×1 m) — welche Ecke der Bounding-Box
   *  den rechten Winkel trägt. Undefined = normales Rechteck (der Normalfall). WICHTIG: ein
   *  Dreieck hat dieselbe Bounding-Box (1×1) wie das echte 1×1-Sondermaß-Rechteck — deshalb
   *  IMMER zuerst `corner !== undefined` prüfen, bevor irgendeine (w,d)-basierte Katalogfunktion
   *  (isSondermassPiece/isPrimaryPanelPiece/catalogSizeKey) aufgerufen wird, sonst würde ein
   *  Dreieck fälschlich als das Rechteck erkannt. */
  corner?: TriangleCorner;
}

/** Frisch erzeugtes Stück ohne id — von Keil/Zeichnen-Werkzeug erzeugt, bevor es dem
 *  Canvas-Zustand hinzugefügt wird (genau eine Stelle vergibt danach eine id: der Aufrufer). */
export interface FilledPiece {
  x: number;
  y: number;
  w: number;
  d: number;
  corner?: TriangleCorner;
}

let idCounter = 0;
export function makePieceId(): string {
  idCounter += 1;
  return `piece-${idCounter}`;
}

/** Dreht ein Stück an Ort und Stelle — für ein Rechteck der bekannte Breite/Tiefe-Tausch
 *  (2 Zustände); für das Dreieckpodest ein Wechsel zur nächsten Ecke im Uhrzeigersinn
 *  (4 Zustände, siehe nextTriangleCorner) — die Bounding-Box bleibt dabei immer 1×1, ändert
 *  sich also nie, kann also nie neu mit etwas kollidieren. Zentrale Stelle statt (wie bisher)
 *  dreifach dupliziert in den Konfiguratoren. */
export function rotatePieceInPlace(piece: Piece2D): Piece2D {
  if (piece.corner !== undefined) return { ...piece, corner: nextTriangleCorner(piece.corner) };
  return { ...piece, w: piece.d, d: piece.w };
}

/**
 * "Normal" (Tiefe = 1 m, Modulachse) erlaubt die volle Sondermaß-Palette; jede andere feste
 * Tiefe (i.d.R. 2 m) ist laut Anleitung die feste Achse OHNE Sondermaß-Substitution.
 */
function orientationForPieceDepth(pieceDepthM: number): 'normal' | 'rotiert' {
  return Math.abs(pieceDepthM - primaryPanel().d) < 1e-6 ? 'normal' : 'rotiert';
}

export interface CatalogPieceOption {
  w: number;
  d: number;
  isSondermass: boolean;
}

/** Feste, kanvas-unabhängige Palette — es gibt kein pro-Canvas fixiertes "rowDepthM" mehr:
 *  Unterbau und Thekenplatte bauen beide aus demselben Katalog, Drehen ersetzt die alte
 *  Ausrichtungs-Bindung. Jede Größe ist gleichermaßen frei drehbar (siehe panels.ts). */
export function catalogPieceOptions(): CatalogPieceOption[] {
  const primary = primaryPanel();
  return [
    { w: primary.w, d: primary.d, isSondermass: false },
    ...sondermassSubstituteWidths(primary.d).map((w) => ({ w, d: primary.d, isSondermass: true })),
    ...sondermassSubstituteWidths(2).map((w) => ({ w, d: 2, isSondermass: true })),
  ];
}

function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ad: number,
  bx: number,
  by: number,
  bw: number,
  bd: number,
): boolean {
  return ax < bx + bw - EPS && bx < ax + aw - EPS && ay < by + bd - EPS && by < ay + ad - EPS;
}

/**
 * Reine Kollisionsprüfung an einer gegebenen Position, ohne Meinung zu Kanvas-Grenzen — für
 * Platzieren, Verschieben UND Drehen-in-place. `excludeId` lässt ein Stück sich nicht an sich
 * selbst stoßen (wichtig beim Verschieben/Drehen des bereits vorhandenen Stücks).
 */
export function fitsAt(existing: Piece2D[], x: number, y: number, w: number, d: number, excludeId?: string): boolean {
  return existing.every((p) => p.id === excludeId || !aabbOverlap(x, y, w, d, p.x, p.y, p.w, p.d));
}

/**
 * Prüft eine ganze Charge frisch erzeugter Stücke (Dreieck-Keil, Zeichnen-Werkzeug) atomar
 * gegen vorhandene Stücke — alles oder nichts. Anders als beim Verschieben eines einzelnen
 * Stücks wird hier NICHT nachgerückt: das würde eine ganze Keil-/Zeichnen-Form unvorhersehbar
 * verschieben, statt ehrlich zu melden "hier passt sie nicht". Die Stücke EINER Charge
 * überlappen sich per Konstruktion nie untereinander (reine Katalog-Zerlegung einer
 * Spannweite), daher genügt die Prüfung gegen die vorhandenen Stücke.
 */
export function fitsAllAt(existing: Piece2D[], pieces: FilledPiece[]): boolean {
  return pieces.every((p) => fitsAt(existing, p.x, p.y, p.w, p.d));
}

function isWithinCanvas(x: number, y: number): boolean {
  return x >= -EPS && y >= -EPS;
}

/**
 * Sucht die nächstgelegene freie, rasterkonforme (x,y)-Position für ein Stück (w,d): testet
 * zuerst die gewünschte (gerasterte) Position, dann wachsende quadratische Ringe im 0,5-m-
 * Raster darum herum (nächster Kandidat zuerst, nach echter Distanz sortiert). Anders als die
 * frühere 1D-Suche (die an einer FESTEN Bühnenbreite scheitern konnte) gibt es hier KEINE
 * äußere Grenze — die Fläche wächst ja ausschließlich mit dem Inhalt — daher liefert diese
 * Funktion für ein EINZELNES Stück immer ein Ergebnis: spätestens außerhalb der Bounding Box
 * aller vorhandenen Stücke ist Platz frei. Gilt nur für Einzelstück-Platzierung/-Verschiebung;
 * für Mehrstück-Chargen siehe `fitsAllAt` (dort ist "kein Platz" ein echter Fehlerfall).
 */
export function findFreePosition(
  existing: Piece2D[],
  w: number,
  d: number,
  desiredX: number,
  desiredY: number,
  excludeId?: string,
): { x: number; y: number } {
  const dx = Math.max(0, snapToGrid(desiredX));
  const dy = Math.max(0, snapToGrid(desiredY));
  const candidateOk = (x: number, y: number) => isWithinCanvas(x, y) && fitsAt(existing, x, y, w, d, excludeId);

  if (candidateOk(dx, dy)) return { x: dx, y: dy };

  const farthest = existing.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0);
  const maxRing = Math.ceil((farthest + 20) / GRID_M);
  for (let ring = 1; ring <= maxRing; ring++) {
    const candidates: { x: number; y: number }[] = [];
    for (let i = -ring; i <= ring; i++) {
      candidates.push({ x: dx + i * GRID_M, y: dy - ring * GRID_M }, { x: dx + i * GRID_M, y: dy + ring * GRID_M });
    }
    for (let j = -ring + 1; j <= ring - 1; j++) {
      candidates.push({ x: dx - ring * GRID_M, y: dy + j * GRID_M }, { x: dx + ring * GRID_M, y: dy + j * GRID_M });
    }
    candidates.sort((a, b) => Math.hypot(a.x - dx, a.y - dy) - Math.hypot(b.x - dx, b.y - dy));
    for (const c of candidates) if (candidateOk(c.x, c.y)) return c;
  }
  // Laut obigem Argument unerreichbar, aber als Sicherheitsnetz: rechts neben allem Bestehenden.
  return { x: snapToGrid(existing.reduce((m, p) => Math.max(m, p.x + p.w), 0)), y: dy };
}

/**
 * Baut ein LayoutResult direkt aus einer flachen Stückliste auf — keine Reihen, keine
 * Basisfläche. `orientation`/`cols`/`rows` sind für dieses Ergebnis reine Platzhalter (von
 * keinem Verbraucher des freien 2D-Modells gelesen; siehe Architektur-Prüfung im Plan).
 */
export function buildLayoutFromPieces(pieces: Piece2D[]): LayoutResult {
  const panels: PanelInstance[] = [];
  const panelCountsBySize: Record<string, number> = {};
  let hasSondermass = false;
  let maxX = 0;
  let maxY = 0;

  for (const piece of pieces) {
    if (piece.w <= 0 || piece.d <= 0) continue;
    // Dreieck zuerst behandeln und dabei komplett aussteigen (`continue`) — eine (w,d)-basierte
    // Katalogfunktion wie isSondermassPiece/catalogSizeKey würde (1,1) sonst fälschlich als das
    // echte 1×1-Sondermaß-Rechteck erkennen (identische Bounding-Box, siehe Piece2D.corner-Doku).
    if (piece.corner !== undefined) {
      panels.push({
        x: round3(piece.x),
        y: round3(piece.y),
        w: piece.w,
        d: piece.d,
        sizeKey: TRIANGLE_SIZE_KEY,
        isSondermass: false,
        corner: piece.corner,
      });
      panelCountsBySize[TRIANGLE_SIZE_KEY] = (panelCountsBySize[TRIANGLE_SIZE_KEY] ?? 0) + 1;
      maxX = Math.max(maxX, piece.x + piece.w);
      maxY = Math.max(maxY, piece.y + piece.d);
      continue;
    }
    const sondermass = isSondermassPiece(piece.w, piece.d);
    const key = catalogSizeKey(piece.w, piece.d);
    panels.push({ x: round3(piece.x), y: round3(piece.y), w: piece.w, d: piece.d, sizeKey: key, isSondermass: sondermass });
    panelCountsBySize[key] = (panelCountsBySize[key] ?? 0) + 1;
    hasSondermass = hasSondermass || sondermass;
    maxX = Math.max(maxX, piece.x + piece.w);
    maxY = Math.max(maxY, piece.y + piece.d);
  }

  return {
    orientation: 'normal',
    widthM: round3(maxX),
    depthM: round3(maxY),
    areaM2: round3(panels.reduce((sum, p) => sum + p.w * p.d, 0)),
    cols: 0,
    rows: 0,
    panels,
    panelCountsBySize,
    hasSondermass,
  };
}

/**
 * Zerlegt eine Spannweite in echte Katalogstücke (inkl. Sondermaß auf der Modulachse) — kennt
 * nur "eine Achse mit fester Tiefe", kein Reihen-/Richtungskonzept. Grundlage für die
 * horizontalen UND (transponiert) vertikalen Wrapper unten sowie für den Dreieck-Keil.
 */
function fillSpanWithCatalog(spanWidthM: number, pieceDepthM: number, offsetX: number): { x: number; w: number }[] {
  if (spanWidthM <= 0) return [];
  const rowLayout = computeLayout(spanWidthM, pieceDepthM)[orientationForPieceDepth(pieceDepthM)];
  return rowLayout.panels.map((p) => ({ x: round3(offsetX + p.x), w: p.w }));
}

/** Waagerechter Lauf, feste Tiefe: Zerlegung entlang x bei fixer y — z.B. der Hauptlauf einer Theke. */
export function fillHorizontalSpan(spanWidthM: number, pieceDepthM: number, offsetX: number, fixedY: number): FilledPiece[] {
  return fillSpanWithCatalog(spanWidthM, pieceDepthM, offsetX).map((p) => ({ x: p.x, y: fixedY, w: p.w, d: pieceDepthM }));
}

/** Senkrechter Lauf, feste Breite — für einen Eck-Schenkel. Reine Vertauschung derselben
 *  1D-Zerlegung (keine eigene Mathematik): die "Breite" der Zerlegung wird hier als y-Lauf
 *  interpretiert, die "feste Tiefe" der Zerlegung als konstante Stückbreite. */
export function fillVerticalSpan(spanDepthM: number, pieceWidthM: number, fixedX: number, offsetY: number): FilledPiece[] {
  return fillSpanWithCatalog(spanDepthM, pieceWidthM, offsetY).map((p) => ({ x: fixedX, y: p.x, w: pieceWidthM, d: p.w }));
}

interface TaperRow {
  depthM: number;
  pieces: { x: number; w: number }[];
}

/**
 * Linear zulaufende Reihen, zentriert im lokalen Rahmen [0, baseWidthM] und in Katalogstücke
 * zerlegt — Grundlage für den Dreieck-Keil. Rasterbreite ist einheitlich 0,5 m auf beiden
 * Achsen — die frühere Einschränkung auf volle 1-m-Schritte für die feste 2-m-Achse (weil es
 * dort angeblich kein Sondermaß-Substitut gab) ist mit der 0,5×2-Platte hinfällig.
 */
function linearTaperRows(baseWidthM: number, rowCount: number, pieceDepthM: number): TaperRow[] {
  if (rowCount <= 0 || baseWidthM <= 0) return [];
  const widthGrid = GRID_M;
  const rows: TaperRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const raw = (baseWidthM * (rowCount - i)) / (rowCount + 1);
    const w = Math.max(widthGrid, Math.round(raw / widthGrid) * widthGrid);
    const rowOffsetX = snapToGrid((baseWidthM - w) / 2);
    const pieces = fillSpanWithCatalog(w, pieceDepthM, rowOffsetX);
    rows.push({ depthM: pieceDepthM, pieces });
  }
  return rows;
}

export interface WedgeTemplate {
  baseWidthM: number;
  rowCount: number;
  pieceDepthM: number;
}

/** Fester, handlicher Dreieck-Keil zum Platzieren — 3 Reihen, oben 3 m breit, läuft zu. */
export function defaultWedgeTemplate(pieceDepthM: number): WedgeTemplate {
  return { baseWidthM: 3, rowCount: 3, pieceDepthM };
}

/** Setzt den Keil an eine konkrete Stelle (anchorX/anchorY) — flache Stückliste, keine ids. */
export function wedgePiecesAt(template: WedgeTemplate, anchorX: number, anchorY: number): FilledPiece[] {
  const rows = linearTaperRows(template.baseWidthM, template.rowCount, template.pieceDepthM);
  const pieces: FilledPiece[] = [];
  let y = anchorY;
  for (const row of rows) {
    for (const p of row.pieces) pieces.push({ x: round3(p.x + anchorX), y, w: p.w, d: row.depthM });
    y = round3(y + row.depthM);
  }
  return pieces;
}
