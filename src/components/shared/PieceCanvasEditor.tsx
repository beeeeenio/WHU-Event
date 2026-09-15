import { useRef, useState } from 'react';
import {
  catalogPieceOptions,
  fillHorizontalSpan,
  fillVerticalSpan,
  findFreePosition,
  fitsAllAt,
  fitsAt,
  wedgePiecesAt,
  type CatalogPieceOption,
  type FilledPiece,
  type Piece2D,
} from '../../domain/customShape';
import { isSondermassPiece, TRIANGLE_PANEL_SIZE_M } from '../../domain/panels';
import { mirrorTriangleCornerDiagonal, mirrorTriangleCornerVertical, nextTriangleCorner, trianglePoints } from '../../domain/triangle';
import type { TriangleCorner } from '../../domain/types';

type ToolPayload =
  | { kind: 'piece'; w: number; d: number }
  | { kind: 'wedge' }
  | { kind: 'draw' }
  | { kind: 'triangle'; corner: TriangleCorner };

interface Props {
  pieces: Piece2D[];
  onAddPieces: (pieces: FilledPiece[]) => void;
  onRemovePiece: (id: string) => void;
  onMovePiece: (id: string, x: number, y: number) => void;
  onRotatePiece: (id: string) => void;
  /** Setzt/löscht die Fuß-Höhen-Überschreibung einer einzelnen Platte (undefined = zurück auf
   *  die globale Aufbauhöhe) — nur sichtbar/bedienbar, wenn onSetFootHeightOverride gesetzt ist. */
  onSetFootHeightOverride?: (id: string, heightCm: number | undefined) => void;
  /** Globale Aufbauhöhe dieser Ebene — Ausgangswert/„Standard“ für die Fuß-Höhen-Überschreibung. */
  defaultHeightCm?: number;
  /** Erlaubte Höhen für die Fuß-Höhen-Überschreibung (dieselbe Serie wie der Haupt-Höhenregler). */
  heightOptionsCm?: number[];
  /** Beschriftung über der Kante, an der y=0 liegt (z.B. "Bühnenvorderkante"). */
  frontEdgeLabel?: string;
  /** Erzwingt eine Mindest-viewBox-Breite — z.B. damit zwei Ebenen (Tresen: Unterbau +
   *  Thekenplatte) dieselbe Skala teilen, statt unabhängig auf den eigenen Inhalt zu skalieren. */
  minCanvasWidthM?: number;
  /** Gestrichelter Referenz-Umriss einer anderen Fläche, links-/vorderkantenbündig (x=0,y=0). */
  referenceFootprint?: { widthM: number; depthM: number; label?: string };
}

const PAD = 0.6;
const MIN_CANVAS_WIDTH_M = 6;
const MIN_CANVAS_DEPTH_M = 4;
const BUFFER_M = 2;
const DRAG_THRESHOLD_PX = 4;
const GRID_STEP_M = 0.5;
// Ab welchem Verhältnis (kürzere Zug-Achse ÷ längere) ein Zeichnen-Zug als "schräg" statt
// "gerade" gilt — siehe drawFillFor. 0,35 heißt: die kürzere Achse muss gut ein Drittel der
// längeren erreichen, bevor ein Keil statt einer geraden Fläche entsteht (rein zufällige
// Diagonal-Abweichung beim geraden Ziehen soll nicht versehentlich einen Keil auslösen).
const DIAGONAL_RATIO_THRESHOLD = 0.35;

function formatM(v: number): string {
  return v.toFixed(1).replace('.', ',');
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

const CATALOG_OPTIONS = catalogPieceOptions();
const SMALLEST_WIDTH = Math.min(...CATALOG_OPTIONS.map((o) => o.w));

function matchesOption(payload: ToolPayload, opt: CatalogPieceOption): boolean {
  return (
    payload.kind === 'piece' &&
    ((payload.w === opt.w && payload.d === opt.d) || (payload.w === opt.d && payload.d === opt.w))
  );
}

interface ShapeGeometry {
  x: number;
  y: number;
  w: number;
  d: number;
  corner?: TriangleCorner;
}

/** Rendert ein Stück (egal ob platziert, Geist beim Ziehen oder Vorschau) als `<rect>` oder,
 *  bei einem Dreieckpodest, als `<polygon>` mit den 3 echten Eckpunkten — eine Stelle statt
 *  vierfach dupliziert (platzierte Stücke, Verschiebe-Ziel-Geist, Platzier-/Zieh-Vorschau). */
function PieceShape({
  piece,
  fill,
  fillOpacity,
  stroke,
  strokeWidth,
  pointerEvents,
  style,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  children,
}: {
  piece: ShapeGeometry;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth: number;
  pointerEvents?: 'all' | 'none';
  style?: React.CSSProperties;
  onPointerDown?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGElement>) => void;
  children?: React.ReactNode;
}) {
  const shared = { fill, fillOpacity, stroke, strokeWidth, pointerEvents, style, onPointerDown, onPointerMove, onPointerUp };
  if (piece.corner === undefined) {
    return (
      <rect x={piece.x} y={piece.y} width={piece.w} height={piece.d} {...shared}>
        {children}
      </rect>
    );
  }
  const points = trianglePoints(piece, piece.corner)
    .map((pt) => `${pt.x},${pt.y}`)
    .join(' ');
  return (
    <polygon points={points} {...shared}>
      {children}
    </polygon>
  );
}

/** Maß-Beschriftung wie auf einem echten Aufmaßblatt — folgt einem einzelnen Stück
 *  beim Ziehen/Platzieren-Vorschau. Bei Mehrstück-Chargen (Keil/Zeichnen) bewusst
 *  nicht gezeigt, da dort keine einzelne Breite/Tiefe die Fläche sinnvoll beschreibt. */
function DimensionLabel({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  return (
    <text
      x={x + w / 2}
      y={y - 0.12}
      fontSize={0.16}
      textAnchor="middle"
      fill="var(--color-accent)"
      fontFamily="var(--font-mono)"
      style={{ pointerEvents: 'none' }}
    >
      {formatM(w)}×{formatM(d)} m
    </text>
  );
}

/** Fuß-Höhen-Überschreibung für die ausgewählte Platte — z.B. Ausgleich bei unebenem
 *  Untergrund. Zeigt bei aktiver Überschreibung zusätzlich einen "Standard"-Link zum
 *  Zurücksetzen; landet die Stufe zufällig wieder genau auf der globalen Höhe, wird die
 *  Überschreibung automatisch gelöscht statt redundant gleich gespeichert zu bleiben. */
function FootHeightStepper({
  piece,
  defaultHeightCm,
  heightOptionsCm,
  onChange,
}: {
  piece: Piece2D;
  defaultHeightCm: number;
  heightOptionsCm: number[];
  onChange: (heightCm: number | undefined) => void;
}) {
  const effective = piece.footHeightCm ?? defaultHeightCm;
  const isOverridden = piece.footHeightCm !== undefined;
  const sorted = [...heightOptionsCm].sort((a, b) => a - b);

  function step(direction: 1 | -1) {
    const currentIndex = sorted.indexOf(effective);
    const fallbackIndex = sorted.reduce(
      (best, v, i) => (Math.abs(v - effective) < Math.abs(sorted[best] - effective) ? i : best),
      0,
    );
    const nextIndex = Math.min(sorted.length - 1, Math.max(0, (currentIndex >= 0 ? currentIndex : fallbackIndex) + direction));
    const next = sorted[nextIndex];
    onChange(next === defaultHeightCm ? undefined : next);
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-[var(--color-text-muted)]">Fuß-Höhe:</span>
      <button
        type="button"
        onClick={() => step(-1)}
        className="w-5 h-5 flex items-center justify-center rounded border border-[var(--color-border)] text-xs hover:border-[var(--color-accent)]"
        aria-label="Fuß-Höhe verringern"
      >
        −
      </button>
      <span
        className="min-w-[3.5rem] text-center text-xs"
        style={{ fontFamily: 'var(--font-mono)', color: isOverridden ? 'var(--color-accent)' : 'var(--color-text)' }}
        title={isOverridden ? 'Abweichend von der globalen Aufbauhöhe' : 'Globale Aufbauhöhe'}
      >
        {effective} cm
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        className="w-5 h-5 flex items-center justify-center rounded border border-[var(--color-border)] text-xs hover:border-[var(--color-accent)]"
        aria-label="Fuß-Höhe erhöhen"
      >
        +
      </button>
      {isOverridden && (
        <button type="button" onClick={() => onChange(undefined)} className="text-xs text-[var(--color-text-muted)] underline">
          Standard
        </button>
      )}
    </div>
  );
}

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  target: { x: number; y: number } | null;
}

interface TracingState {
  start: { x: number; y: number };
  current: { x: number; y: number };
}

interface PaletteDragState {
  payload: ToolPayload;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  overCanvas: boolean;
}

export function PieceCanvasEditor({
  pieces,
  onAddPieces,
  onRemovePiece,
  onMovePiece,
  onRotatePiece,
  onSetFootHeightOverride,
  defaultHeightCm,
  heightOptionsCm,
  frontEdgeLabel = 'Vorderkante',
  minCanvasWidthM,
  referenceFootprint,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [armed, setArmedState] = useState<ToolPayload | null>(null);
  const [pieceThicknessM, setPieceThicknessM] = useState<1 | 2>(1);
  // Einstellbare Keil-Größe statt fest 3 m Basisbreite / 3 Reihen — Benni fand den festen Keil
  // "nicht gut". Grenzen sind großzügig, aber nicht grenzenlos (0,5-m-Raster, min. 2 Reihen für
  // eine sichtbare Verjüngung).
  const [wedgeBaseWidthM, setWedgeBaseWidthM] = useState(3);
  const [wedgeRowCount, setWedgeRowCount] = useState(3);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [tracing, setTracing] = useState<TracingState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragState | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  // Ein Button hat natives Klick-Verhalten, das nach einem echten Ziehen trotzdem feuert
  // (Pointer-Events und das nachfolgende `click` sind getrennte, aufeinanderfolgende Dinge,
  // auch bei Pointer-Capture). Ein Ref statt State, damit der Wert synchron und ohne
  // Render-Verzögerung im direkt danach feuernden `onClick` verfügbar ist.
  const suppressNextClickRef = useRef(false);

  function arm(payload: ToolPayload | null) {
    setArmedState(payload);
    setSelectedId(null);
    setPointerPos(null);
    setTracing(null);
  }

  function showBlockedMessage(text: string) {
    setBlockedMessage(text);
    setTimeout(() => setBlockedMessage((cur) => (cur === text ? null : cur)), 2500);
  }

  const contentWidthM = Math.max(
    pieces.reduce((m, p) => Math.max(m, p.x + p.w), 0),
    referenceFootprint?.widthM ?? 0,
  );
  const contentDepthM = Math.max(
    pieces.reduce((m, p) => Math.max(m, p.y + p.d), 0),
    referenceFootprint?.depthM ?? 0,
  );
  const canvasWidthM = Math.max(minCanvasWidthM ?? 0, MIN_CANVAS_WIDTH_M, contentWidthM + BUFFER_M);
  const canvasDepthM = Math.max(MIN_CANVAS_DEPTH_M, contentDepthM + BUFFER_M);
  const viewBox = `${-PAD} ${-PAD} ${canvasWidthM + PAD * 2} ${canvasDepthM + PAD * 2}`;

  /**
   * Wandelt einen Bildschirmpunkt exakt in viewBox-Koordinaten (Meter) um, über die
   * Bildschirm-CTM der SVG. Wichtig: die SVG skaliert per preserveAspectRatio (Standard
   * "xMidYMid meet") innerhalb von w-full/max-h — bei abweichendem Seitenverhältnis entsteht
   * Letter-/Pillarboxing, wodurch ein naiver Bounding-Rect-Bruchteil falsche Koordinaten
   * liefern würde. getScreenCTM() berücksichtigt das automatisch korrekt — auch für Punkte
   * weit außerhalb der SVG-eigenen Box (reine Koordinatentransformation, kein Clipping),
   * wichtig für das Ziehen aus der Palette, bevor der Cursor den Canvas erreicht hat.
   */
  function svgPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  /** Entscheidet, ob ein Zeichnen-Zug als gerade Fläche oder als Keil (Verjüngung) gilt — von
   *  `drawFillFor` UND der Live-Vorschau-Beschriftung genutzt, damit beide exakt übereinstimmen. */
  function classifyDrag(
    start: { x: number; y: number },
    current: { x: number; y: number },
    thickness: number,
  ): { mode: 'straight' } | { mode: 'taper'; baseWidthM: number; rowCount: number } {
    const adx = Math.abs(current.x - start.x);
    const ady = Math.abs(current.y - start.y);
    const maxAxis = Math.max(adx, ady);
    const minAxis = Math.min(adx, ady);
    if (maxAxis >= SMALLEST_WIDTH && minAxis / Math.max(maxAxis, 1e-6) >= DIAGONAL_RATIO_THRESHOLD) {
      return {
        mode: 'taper',
        baseWidthM: Math.max(SMALLEST_WIDTH, round1(minAxis)),
        rowCount: Math.max(2, Math.round(maxAxis / thickness)),
      };
    }
    return { mode: 'straight' };
  }

  /** Baut einen Keil in EXAKT der Richtung, in die tatsächlich gezogen wurde (oben/unten/links/
   *  rechts) — Basisbreite am Start-Punkt, Spitze Richtung `current`. Nutzt dieselbe
   *  `wedgePiecesAt`-Geometrie wie der Keil-Button (lokal, "nach unten wachsend" erzeugt) und
   *  transformiert das Ergebnis passend, statt die Verjüngungs-Mathematik zweimal zu bauen. */
  function taperPiecesForDrag(
    start: { x: number; y: number },
    current: { x: number; y: number },
    baseWidthM: number,
    rowCount: number,
    pieceDepthM: number,
  ): FilledPiece[] {
    const totalDepthM = rowCount * pieceDepthM;
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const native = wedgePiecesAt({ baseWidthM, rowCount, pieceDepthM }, 0, 0);

    // Jeder der 4 Zweige transformiert nicht nur x/y/w/d, sondern muss eine ggf. vorhandene
    // Dreieck-Spitzen-Ecke (aus linearTaperRows, siehe corner an der letzten Zeile) exakt
    // passend mitdrehen/-spiegeln — sonst würde die Phantom-Ecke nach einer Diagonal-Zeichnung
    // in die falsche Richtung zeigen. Welche Transformation wohin gehört, ergibt sich direkt aus
    // der jeweiligen x/y/w/d-Transformation der Zeile selbst (Herleitung: Wohin bildet dieser
    // Zweig die 4 Bounding-Box-Ecken der Zeile ab?):
    // - dy>=0: reine Verschiebung → Ecke unverändert.
    // - dy<0: y wird gespiegelt, x bleibt → vertikale Spiegelung (oben/unten tauschen).
    // - dx>=0: x/y vertauscht (Transposition) → Spiegelung an der Hauptdiagonale.
    // - dx<0: x/y vertauscht UND gespiegelt → das ist exakt der 4er-Rotationszyklus (nextTriangleCorner).
    return native.map((p) => {
      if (vertical) {
        const baseX = start.x - baseWidthM / 2 + p.x;
        if (dy >= 0) return { x: round3(baseX), y: round3(start.y + p.y), w: p.w, d: p.d, corner: p.corner };
        const flippedY = totalDepthM - p.y - p.d;
        const corner = p.corner === undefined ? undefined : mirrorTriangleCornerVertical(p.corner);
        return { x: round3(baseX), y: round3(start.y - totalDepthM + flippedY), w: p.w, d: p.d, corner };
      }
      // Waagerechter Zug: Zeilen werden zu Spalten (x/y und w/d vertauscht).
      const baseY = start.y - baseWidthM / 2 + p.x;
      if (dx >= 0) {
        const corner = p.corner === undefined ? undefined : mirrorTriangleCornerDiagonal(p.corner);
        return { x: round3(start.x + p.y), y: round3(baseY), w: p.d, d: p.w, corner };
      }
      const flippedY = totalDepthM - p.y - p.d;
      const corner = p.corner === undefined ? undefined : nextTriangleCorner(p.corner);
      return { x: round3(start.x - totalDepthM + flippedY), y: round3(baseY), w: p.d, d: p.w, corner };
    });
  }

  function drawFillFor(start: { x: number; y: number }, current: { x: number; y: number }, thickness: number): FilledPiece[] {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const span = horizontal ? Math.abs(dx) : Math.abs(dy);

    if (span < SMALLEST_WIDTH) {
      // Kaum Bewegung: wie ein einfacher Klick auf "Stück" behandeln, statt wirkungslos zu
      // bleiben — kleinstes verfügbares Stück, mittig auf den Startpunkt.
      const pos = findFreePosition(pieces, SMALLEST_WIDTH, thickness, start.x - SMALLEST_WIDTH / 2, start.y - thickness / 2);
      return [{ x: pos.x, y: pos.y, w: SMALLEST_WIDTH, d: thickness }];
    }
    const drag = classifyDrag(start, current, thickness);
    if (drag.mode === 'taper') {
      return taperPiecesForDrag(start, current, drag.baseWidthM, drag.rowCount, thickness);
    }
    if (horizontal) {
      const minX = Math.max(0, Math.min(start.x, current.x));
      const fixedY = Math.max(0, start.y - thickness / 2);
      return fillHorizontalSpan(round1(span), thickness, minX, fixedY);
    }
    const minY = Math.max(0, Math.min(start.y, current.y));
    const fixedX = Math.max(0, start.x - thickness / 2);
    return fillVerticalSpan(round1(span), thickness, fixedX, minY);
  }

  // Bedient sowohl den Klick-Bewaffnen-Hover als auch das Ziehen aus der Palette (sobald der
  // Cursor über dem Canvas ist) — eine einzige Vorschau-Quelle für beide Wege.
  function previewForPayload(payload: ToolPayload | null): FilledPiece[] | null {
    if (!payload || payload.kind === 'draw' || !pointerPos) return null;
    if (payload.kind === 'piece') {
      const pos = findFreePosition(pieces, payload.w, payload.d, pointerPos.x - payload.w / 2, pointerPos.y - payload.d / 2);
      return [{ x: pos.x, y: pos.y, w: payload.w, d: payload.d }];
    }
    if (payload.kind === 'triangle') {
      const s = TRIANGLE_PANEL_SIZE_M;
      const pos = findFreePosition(pieces, s, s, pointerPos.x - s / 2, pointerPos.y - s / 2);
      return [{ x: pos.x, y: pos.y, w: s, d: s, corner: payload.corner }];
    }
    const template = { baseWidthM: wedgeBaseWidthM, rowCount: wedgeRowCount, pieceDepthM: pieceThicknessM };
    const anchorX = pointerPos.x - template.baseWidthM / 2;
    const anchorY = Math.max(0, pointerPos.y);
    const filled = wedgePiecesAt(template, anchorX, anchorY);
    return fitsAllAt(pieces, filled) ? filled : null;
  }

  // arm(null) beim Start eines Paletten-Ziehens sorgt dafür, dass armed/paletteDrag nie
  // gleichzeitig aktiv sind — das `??` ist defensiv, nicht tragend.
  const activePayload = armed ?? (paletteDrag?.overCanvas ? paletteDrag.payload : null);
  const previewPieces =
    armed?.kind === 'draw' ? (tracing ? drawFillFor(tracing.start, tracing.current, pieceThicknessM) : null) : previewForPayload(activePayload);

  // Reine Platzier-Funktion ohne Seiteneffekt auf armed/paletteDrag — das bleibt Sache der
  // Aufrufer (Klick-Platzieren-Pfad, Paletten-Ziehen UND Tastatur-Platzieren nutzen dieselbe
  // Logik, nur die Umrechnung von Bildschirm- zu Meter-Koordinaten unterscheidet sich).
  function commitPayloadAtPoint(payload: ToolPayload, pos: { x: number; y: number }) {
    if (payload.kind === 'draw') return;
    if (payload.kind === 'piece') {
      const target = findFreePosition(pieces, payload.w, payload.d, pos.x - payload.w / 2, pos.y - payload.d / 2);
      onAddPieces([{ x: target.x, y: target.y, w: payload.w, d: payload.d }]);
    } else if (payload.kind === 'triangle') {
      const s = TRIANGLE_PANEL_SIZE_M;
      const target = findFreePosition(pieces, s, s, pos.x - s / 2, pos.y - s / 2);
      onAddPieces([{ x: target.x, y: target.y, w: s, d: s, corner: payload.corner }]);
    } else {
      const template = { baseWidthM: wedgeBaseWidthM, rowCount: wedgeRowCount, pieceDepthM: pieceThicknessM };
      const filled = wedgePiecesAt(template, pos.x - template.baseWidthM / 2, Math.max(0, pos.y));
      if (fitsAllAt(pieces, filled)) {
        onAddPieces(filled);
      } else {
        showBlockedMessage('Hier ist kein Platz für den Dreieck-Keil (braucht Platz für 3 Reihen ab hier).');
      }
    }
  }

  function commitPayloadAt(payload: ToolPayload, clientX: number, clientY: number) {
    commitPayloadAtPoint(payload, svgPointFromClient(clientX, clientY));
  }

  function handlePaletteButtonPointerDown(e: React.PointerEvent<HTMLButtonElement>, payload: ToolPayload) {
    suppressNextClickRef.current = false;
    arm(null);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // best-effort, siehe bestehendes Muster bei handlePiecePointerDown
    }
    setPaletteDrag({ payload, startClientX: e.clientX, startClientY: e.clientY, moved: false, overCanvas: false });
  }

  function handlePaletteButtonPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!paletteDrag) return;
    if (Math.hypot(e.clientX - paletteDrag.startClientX, e.clientY - paletteDrag.startClientY) < DRAG_THRESHOLD_PX) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const overCanvas = !!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (overCanvas) setPointerPos(svgPointFromClient(e.clientX, e.clientY));
    setPaletteDrag((d) => (d ? { ...d, moved: true, overCanvas } : d));
  }

  function handlePaletteButtonPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const pd = paletteDrag;
    setPaletteDrag(null);
    if (!pd?.moved) return; // kein echtes Ziehen: der nachfolgende native `click` armt wie bisher
    suppressNextClickRef.current = true;
    if (pd.overCanvas) commitPayloadAt(pd.payload, e.clientX, e.clientY);
    arm(null);
  }

  // Drehen, während ein Stück noch aus der Palette gezogen wird (vor dem Loslassen) — der
  // Button behält seinen Fokus über die ganze Zieh-Geste (Pointer-Capture ändert daran nichts),
  // daher reicht ein normaler onKeyDown hier. Nur für 'piece'/'triangle' relevant — Dreieck-Keil
  // und Zeichnen kennen kein Drehen (siehe rotateSelected/das bestehende Arm-Drehen).
  function handlePaletteButtonKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key.toLowerCase() !== 'r' || !paletteDrag) return;
    e.preventDefault();
    setPaletteDrag((d) => {
      if (!d) return d;
      if (d.payload.kind === 'piece') return { ...d, payload: { kind: 'piece', w: d.payload.d, d: d.payload.w } };
      if (d.payload.kind === 'triangle') return { ...d, payload: { kind: 'triangle', corner: nextTriangleCorner(d.payload.corner) } };
      return d;
    });
  }

  function handlePiecePointerDown(e: React.PointerEvent<SVGElement>, piece: Piece2D) {
    if (armed) return;
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture kann ohne aktiven, vom Browser registrierten Pointer werfen
      // (z.B. bei synthetisch erzeugten Events) — das Ziehen funktioniert trotzdem.
    }
    setDrag({ id: piece.id, startClientX: e.clientX, startClientY: e.clientY, moved: false, target: null });
  }

  function handlePiecePointerMove(e: React.PointerEvent<SVGElement>, piece: Piece2D) {
    if (!drag || drag.id !== piece.id) return;
    const movedPx = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
    if (movedPx < DRAG_THRESHOLD_PX) return;
    const { x, y } = svgPointFromClient(e.clientX, e.clientY);
    const target = findFreePosition(pieces, piece.w, piece.d, x - piece.w / 2, y - piece.d / 2, piece.id);
    setDrag((d) => (d ? { ...d, moved: true, target } : d));
  }

  function handlePiecePointerUp(piece: Piece2D) {
    if (drag?.id === piece.id) {
      if (drag.moved && drag.target) {
        onMovePiece(piece.id, drag.target.x, drag.target.y);
        setSelectedId(null);
      } else {
        setSelectedId((cur) => (cur === piece.id ? null : piece.id));
      }
    }
    setDrag(null);
  }

  const selectedPiece = selectedId ? pieces.find((p) => p.id === selectedId) ?? null : null;

  function rotateSelected() {
    if (!selectedPiece) return;
    // Ein Dreieck behält beim Drehen exakt seine 1×1-Bounding-Box (nur die Ecke wechselt) —
    // kann also nie neu kollidieren, eine Prüfung ist hier unnötig (anders als beim
    // Rechteck-Breite/Tiefe-Tausch, der die Box tatsächlich ändert).
    if (selectedPiece.corner !== undefined) {
      onRotatePiece(selectedPiece.id);
      return;
    }
    const rotatedW = selectedPiece.d;
    const rotatedD = selectedPiece.w;
    if (fitsAt(pieces, selectedPiece.x, selectedPiece.y, rotatedW, rotatedD, selectedPiece.id)) {
      onRotatePiece(selectedPiece.id);
      return;
    }
    // Passt an der aktuellen Stelle gedreht nicht (die Bounding-Box wächst/schrumpft je nach
    // Achse) — statt hart zu blockieren, wie beim Ziehen die nächstgelegene freie Stelle für die
    // gedrehten Maße suchen und dorthin rücken. findFreePosition liefert für ein Einzelstück
    // immer ein Ergebnis (siehe customShape.ts), ein echter Fehlerfall entfällt damit.
    const target = findFreePosition(pieces, rotatedW, rotatedD, selectedPiece.x, selectedPiece.y, selectedPiece.id);
    onMovePiece(selectedPiece.id, target.x, target.y);
    onRotatePiece(selectedPiece.id);
  }

  function removeSelected() {
    if (!selectedPiece) return;
    onRemovePiece(selectedPiece.id);
    setSelectedId(null);
  }

  const ARROW_DELTA: Partial<Record<string, [number, number]>> = {
    ArrowUp: [0, -GRID_STEP_M],
    ArrowDown: [0, GRID_STEP_M],
    ArrowLeft: [-GRID_STEP_M, 0],
    ArrowRight: [GRID_STEP_M, 0],
  };

  // Tastatur-Bedienung des Plans, nur aktiv wenn das SVG fokussiert ist (Klick oder Tab hinein) —
  // dadurch keine Kollision mit Eingabefeldern anderswo auf der Seite (z.B. Konfigurationsname).
  // Pfeiltasten bewegen wahlweise ein ausgewähltes Stück (Nudge, blockiert bei Kollision statt
  // zu verschieben) oder — bei bewaffnetem Werkzeug — einen Tastatur-Cursor (dieselbe pointerPos,
  // die auch die Maus-Vorschau treibt), Enter/Leertaste platziert dort. R dreht, Entf/Rücktaste
  // entfernt, Esc bricht ab. 1–5 wählen die Plattengrößen in derselben Reihenfolge wie die
  // Segmented-Control, T/K bewaffnen Dreieckpodest/Dreieck-Keil. Zeichnen bleibt bewusst
  // maus-only (siehe Analyse zum Paletten-Ziehen) — sein Zug-Gestus lässt sich nicht sinnvoll in
  // diskrete Tastendrücke übersetzen.
  function handleCanvasKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'Escape') {
      arm(null);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPiece) {
      e.preventDefault();
      removeSelected();
      return;
    }
    if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (selectedPiece) {
        rotateSelected();
      } else if (armed?.kind === 'piece') {
        setArmedState((cur) => (cur?.kind === 'piece' ? { kind: 'piece', w: cur.d, d: cur.w } : cur));
      } else if (armed?.kind === 'triangle') {
        setArmedState((cur) => (cur?.kind === 'triangle' ? { kind: 'triangle', corner: nextTriangleCorner(cur.corner) } : cur));
      }
      return;
    }
    const delta = ARROW_DELTA[e.key];
    if (delta) {
      e.preventDefault();
      const [dx, dy] = delta;
      if (selectedPiece) {
        const nx = Math.max(0, round1(selectedPiece.x + dx));
        const ny = Math.max(0, round1(selectedPiece.y + dy));
        if (fitsAt(pieces, nx, ny, selectedPiece.w, selectedPiece.d, selectedPiece.id)) {
          onMovePiece(selectedPiece.id, nx, ny);
        }
      } else if (armed && armed.kind !== 'draw') {
        setPointerPos((cur) => {
          const base = cur ?? { x: 0, y: 0 };
          return { x: Math.max(0, round1(base.x + dx)), y: Math.max(0, round1(base.y + dy)) };
        });
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && armed && armed.kind !== 'draw' && pointerPos) {
      e.preventDefault();
      commitPayloadAtPoint(armed, pointerPos);
      arm(null);
      return;
    }
    if (/^[1-5]$/.test(e.key)) {
      const opt = CATALOG_OPTIONS[Number(e.key) - 1];
      if (opt) {
        e.preventDefault();
        const payload: ToolPayload = { kind: 'piece', w: opt.w, d: opt.d };
        const isArmed = armed != null && matchesOption(armed, opt);
        arm(isArmed ? null : payload);
      }
      return;
    }
    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      const payload: ToolPayload = { kind: 'triangle', corner: 'tl' };
      arm(armed?.kind === 'triangle' ? null : payload);
      return;
    }
    if (e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const payload: ToolPayload = { kind: 'wedge' };
      arm(armed?.kind === 'wedge' ? null : payload);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-muted)]">
        Ziehe ein Stück, den Dreieck-Keil oder Zeichnen direkt aus der Leiste unten auf den Plan — oder klicke es
        erst an und dann auf die gewünschte Stelle (bei Zeichnen: klicke und ziehe auf dem Plan). Ein vorhandenes
        Stück kannst du direkt ziehen, um es zu verschieben, oder anklicken, um es zu drehen oder zu entfernen. Nach
        einem Klick auf den Plan geht es auch per Tastatur (Kurzbefehle unten).
      </p>

      {armed && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-accent)]">
          <span>
            {armed.kind === 'draw'
              ? 'Jetzt im Plan unten klicken, gedrückt halten, über die gewünschte Breite oder Tiefe ziehen und dann loslassen.'
              : 'Jetzt im Plan unten auf die gewünschte Stelle klicken.'}
          </span>
          <button type="button" onClick={() => arm(null)} className="shrink-0 text-xs underline">
            Abbrechen
          </button>
        </div>
      )}
      {selectedPiece && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          <span className="text-[var(--color-text)]">
            Ausgewählt: {formatM(selectedPiece.w)}×{formatM(selectedPiece.d)} m
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {onSetFootHeightOverride && defaultHeightCm !== undefined && heightOptionsCm && heightOptionsCm.length > 0 && (
              <FootHeightStepper
                piece={selectedPiece}
                defaultHeightCm={defaultHeightCm}
                heightOptionsCm={heightOptionsCm}
                onChange={(h) => onSetFootHeightOverride(selectedPiece.id, h)}
              />
            )}
            <button
              type="button"
              onClick={rotateSelected}
              className="px-2 py-1 rounded text-xs border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
            >
              ⤾ Drehen
            </button>
            <button
              type="button"
              onClick={removeSelected}
              className="px-2 py-1 rounded text-xs border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
            >
              Entfernen
            </button>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="px-2 py-1 rounded text-xs text-[var(--color-text-muted)] underline"
            >
              Abwählen
            </button>
          </div>
        </div>
      )}
      {blockedMessage && (
        <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {blockedMessage}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-auto max-h-[420px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        role="img"
        aria-label="Bau-Editor — klicken und dann Tastatur nutzen (Pfeiltasten, Enter, R, Entf, Esc, 1–5, T, K; Kurzbefehle siehe unten)"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
      >
        <defs>
          <pattern id="pce-hatch" width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
            <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch)" strokeWidth={0.02} opacity={0.32} />
          </pattern>
          <pattern id="pce-hatch-warning" width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
            <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch-warning)" strokeWidth={0.022} opacity={0.42} />
          </pattern>
          <pattern id="pce-dotgrid" width={GRID_STEP_M} height={GRID_STEP_M} patternUnits="userSpaceOnUse">
            <circle cx={GRID_STEP_M / 2} cy={GRID_STEP_M / 2} r={0.012} fill="var(--color-grid-line)" />
          </pattern>
        </defs>

        <rect
          x={-PAD}
          y={-PAD}
          width={canvasWidthM + PAD * 2}
          height={canvasDepthM + PAD * 2}
          fill="url(#pce-dotgrid)"
          pointerEvents="none"
        />
        {Array.from({ length: Math.floor(canvasWidthM) + 1 }, (_, i) => (
          <line key={`vmaj-${i}`} x1={i} y1={0} x2={i} y2={canvasDepthM} stroke="var(--color-grid-line-major)" strokeWidth={0.01} pointerEvents="none" />
        ))}
        {Array.from({ length: Math.floor(canvasDepthM) + 1 }, (_, i) => (
          <line key={`hmaj-${i}`} x1={0} y1={i} x2={canvasWidthM} y2={i} stroke="var(--color-grid-line-major)" strokeWidth={0.01} pointerEvents="none" />
        ))}

        <line x1={0} y1={0} x2={canvasWidthM} y2={0} stroke="var(--color-panel-stroke)" strokeWidth={0.04} />
        <text
          x={canvasWidthM / 2}
          y={-0.18}
          fontSize={0.22}
          textAnchor="middle"
          fill="var(--color-text-muted)"
          fontFamily="var(--font-display)"
        >
          {frontEdgeLabel}
        </text>

        <rect
          x={0}
          y={0}
          width={canvasWidthM}
          height={canvasDepthM}
          fill="transparent"
          pointerEvents={armed && armed.kind !== 'draw' ? 'all' : 'none'}
          onMouseMove={(e) => {
            if (!armed || armed.kind === 'draw') return;
            setPointerPos(svgPointFromClient(e.clientX, e.clientY));
          }}
          onClick={(e) => {
            if (!armed || armed.kind === 'draw') return;
            commitPayloadAt(armed, e.clientX, e.clientY);
            arm(null);
          }}
          style={{ cursor: armed && armed.kind !== 'draw' ? 'copy' : 'default' }}
        />
        {!armed && selectedId && (
          <rect
            x={0}
            y={0}
            width={canvasWidthM}
            height={canvasDepthM}
            fill="transparent"
            onClick={() => setSelectedId(null)}
          />
        )}

        {referenceFootprint && (
          <>
            <rect
              x={0}
              y={0}
              width={referenceFootprint.widthM}
              height={referenceFootprint.depthM}
              fill="none"
              stroke="var(--color-accent)"
              strokeDasharray="0.1 0.1"
              strokeWidth={0.02}
              opacity={0.5}
              pointerEvents="none"
            />
            {referenceFootprint.label && (
              <text
                x={referenceFootprint.widthM / 2}
                y={Math.min(referenceFootprint.depthM, canvasDepthM) / 2}
                fontSize={0.2}
                textAnchor="middle"
                fill="var(--color-accent)"
                opacity={0.5}
                style={{ pointerEvents: 'none' }}
              >
                {referenceFootprint.label}
              </text>
            )}
          </>
        )}

        {pieces.map((p) => {
          const isDragTarget = drag?.id === p.id && drag.moved;
          // Bei p.corner !== undefined (Dreieck) NIE isSondermassPiece(p.w,p.d) aufrufen — (1,1)
          // ist auch die Bounding-Box des echten 1×1-Rechtecks, das würde fälschlich matchen.
          const sondermass = p.corner === undefined && isSondermassPiece(p.w, p.d);
          const interactive = !armed && !paletteDrag;
          return (
            <PieceShape
              key={p.id}
              piece={p}
              fill={sondermass ? 'url(#pce-hatch-warning)' : 'url(#pce-hatch)'}
              fillOpacity={isDragTarget ? 0.25 : 1}
              stroke={selectedId === p.id ? 'var(--color-accent)' : 'var(--color-panel-stroke)'}
              strokeWidth={selectedId === p.id ? 0.035 : 0.02}
              pointerEvents={interactive ? 'all' : 'none'}
              style={{ cursor: interactive ? 'grab' : 'default' }}
              onPointerDown={(e) => handlePiecePointerDown(e, p)}
              onPointerMove={(e) => handlePiecePointerMove(e, p)}
              onPointerUp={() => handlePiecePointerUp(p)}
            >
              <title>
                {formatM(p.w)}×{formatM(p.d)} m bei x={formatM(p.x)}, y={formatM(p.y)} m
              </title>
            </PieceShape>
          );
        })}

        {drag?.target &&
          (() => {
            const dragged = pieces.find((p) => p.id === drag.id);
            const w = dragged?.w ?? 0;
            const d = dragged?.d ?? 0;
            return (
              <>
                <PieceShape
                  piece={{ x: drag.target.x, y: drag.target.y, w, d, corner: dragged?.corner }}
                  fill="var(--color-accent)"
                  fillOpacity={0.35}
                  stroke="var(--color-accent)"
                  strokeWidth={0.03}
                  style={{ pointerEvents: 'none' }}
                />
                <DimensionLabel x={drag.target.x} y={drag.target.y} w={w} d={d} />
              </>
            );
          })()}

        {previewPieces?.map((p, idx) => (
          <PieceShape
            key={idx}
            piece={p}
            fill="var(--color-accent)"
            fillOpacity={0.35}
            stroke="var(--color-accent)"
            strokeWidth={0.03}
            style={{ pointerEvents: 'none' }}
          />
        ))}
        {previewPieces?.length === 1 && (
          <DimensionLabel x={previewPieces[0].x} y={previewPieces[0].y} w={previewPieces[0].w} d={previewPieces[0].d} />
        )}

        {armed?.kind === 'draw' && (
          <>
            <rect
              x={0}
              y={0}
              width={canvasWidthM}
              height={canvasDepthM}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: 'crosshair' }}
              onPointerDown={(e) => {
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // ignorieren — s.o.
                }
                const { x, y } = svgPointFromClient(e.clientX, e.clientY);
                setTracing({ start: { x, y }, current: { x, y } });
              }}
              onPointerMove={(e) => {
                if (!tracing) return;
                const { x, y } = svgPointFromClient(e.clientX, e.clientY);
                setTracing((t) => (t ? { ...t, current: { x, y } } : t));
              }}
              onPointerUp={() => {
                if (tracing) {
                  const filled = drawFillFor(tracing.start, tracing.current, pieceThicknessM);
                  if (fitsAllAt(pieces, filled)) {
                    onAddPieces(filled);
                  } else {
                    showBlockedMessage('Hier ist kein Platz — versuch es an einer anderen Stelle.');
                  }
                }
                setTracing(null);
                setArmedState(null);
              }}
            />
            {!tracing && (
              <text
                x={canvasWidthM / 2}
                y={canvasDepthM / 2}
                fontSize={0.22}
                textAnchor="middle"
                fill="var(--color-accent)"
                opacity={0.6}
                style={{ pointerEvents: 'none' }}
              >
                Klicken + ziehen (waagerecht, senkrecht oder schräg für einen Keil), um eine Fläche zu füllen
              </text>
            )}
            {tracing &&
              (() => {
                const drag = classifyDrag(tracing.start, tracing.current, pieceThicknessM);
                const label =
                  drag.mode === 'taper'
                    ? `Keil, oben ${formatM(drag.baseWidthM)} m, ${drag.rowCount} Reihen`
                    : `Gerade, ${formatM(Math.max(Math.abs(tracing.current.x - tracing.start.x), Math.abs(tracing.current.y - tracing.start.y)))} m`;
                return (
                  <text
                    x={tracing.current.x}
                    y={tracing.current.y - 0.25}
                    fontSize={0.18}
                    textAnchor="middle"
                    fill="var(--color-accent)"
                    fontFamily="var(--font-mono)"
                    style={{ pointerEvents: 'none' }}
                  >
                    {label}
                  </text>
                );
              })()}
          </>
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-3" style={{ fontFamily: 'var(--font-display)' }}>
        <div className="flex rounded-md border border-[var(--color-panel-stroke)] overflow-hidden">
          {CATALOG_OPTIONS.map((opt, idx) => {
            const payload: ToolPayload = { kind: 'piece', w: opt.w, d: opt.d };
            const isArmed = armed != null && matchesOption(armed, opt);
            // Nur die Breite zeigen reicht für die Hauptplatte (einzige 2-m-Option, eindeutig) —
            // bei Sondermaß-Stücken muss auch die Tiefe mit rein, sonst sähen die neue 0,5×2- und
            // die bestehende 0,5×1-Platte optisch identisch aus ("0,5 m" für beide).
            const label = opt.isSondermass ? `${formatM(opt.w)}×${formatM(opt.d)} m` : `${formatM(opt.w)} m`;
            return (
              <button
                key={`${opt.w}x${opt.d}`}
                type="button"
                onPointerDown={(e) => handlePaletteButtonPointerDown(e, payload)}
                onPointerMove={handlePaletteButtonPointerMove}
                onPointerUp={handlePaletteButtonPointerUp}
                onKeyDown={handlePaletteButtonKeyDown}
                onClick={() => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    return;
                  }
                  arm(isArmed ? null : payload);
                }}
                aria-pressed={isArmed}
                aria-label={`Stück ${label} ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`}
                className={`px-3 py-1.5 text-sm cursor-pointer select-none touch-none ${idx > 0 ? 'border-l border-[var(--color-panel-stroke)]' : ''} ${
                  isArmed
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-panel-fill)]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {armed?.kind === 'piece' && (
          <button
            type="button"
            onClick={() => setArmedState((cur) => (cur?.kind === 'piece' ? { kind: 'piece', w: cur.d, d: cur.w } : cur))}
            title="Vertauscht Breite und Tiefe des ausgewählten Stücks"
            aria-label="Ausgewähltes Stück drehen"
            className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-panel-stroke)] text-base cursor-pointer select-none bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
          >
            ⤾
          </button>
        )}
        {armed?.kind === 'triangle' && (
          <button
            type="button"
            onClick={() => setArmedState((cur) => (cur?.kind === 'triangle' ? { kind: 'triangle', corner: nextTriangleCorner(cur.corner) } : cur))}
            title="Dreht das Dreieckpodest zur nächsten Ecke"
            aria-label="Dreieckpodest drehen"
            className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-panel-stroke)] text-base cursor-pointer select-none bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
          >
            ⤾
          </button>
        )}

        <div className="flex items-center gap-1.5">
          {(() => {
            const payload: ToolPayload = { kind: 'triangle', corner: 'tl' };
            const isArmed = armed?.kind === 'triangle';
            return (
              <button
                type="button"
                onPointerDown={(e) => handlePaletteButtonPointerDown(e, payload)}
                onPointerMove={handlePaletteButtonPointerMove}
                onPointerUp={handlePaletteButtonPointerUp}
                onKeyDown={handlePaletteButtonKeyDown}
                onClick={() => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    return;
                  }
                  arm(isArmed ? null : payload);
                }}
                aria-pressed={isArmed}
                aria-label={`Dreieckpodest ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`}
                title="Dreieckpodest — echtes NivTec-Katalogstück, rechtwinkliges Dreieck mit 1×1 m Katheten (anders als der Dreieck-Keil, der eine Näherung aus mehreren Rechtecken ist)"
                className={`w-9 h-9 flex items-center justify-center rounded-md border text-base cursor-pointer select-none touch-none ${
                  isArmed
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-panel-stroke)] hover:border-[var(--color-accent)]'
                }`}
              >
                <span aria-hidden>◺</span>
              </button>
            );
          })()}
          {(() => {
            const payload: ToolPayload = { kind: 'wedge' };
            const isArmed = armed?.kind === 'wedge';
            return (
              <button
                type="button"
                onPointerDown={(e) => handlePaletteButtonPointerDown(e, payload)}
                onPointerMove={handlePaletteButtonPointerMove}
                onPointerUp={handlePaletteButtonPointerUp}
                onClick={() => {
                  if (suppressNextClickRef.current) {
                    suppressNextClickRef.current = false;
                    return;
                  }
                  arm(isArmed ? null : payload);
                }}
                aria-pressed={isArmed}
                aria-label={`Dreieck-Keil ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`}
                title="Dreieck-Keil — kein echtes NivTec-Bauteil, sondern 3 Reihen aus echten Systemplatten, die zu einer Spitze zulaufen"
                className={`w-9 h-9 flex items-center justify-center rounded-md border text-base cursor-pointer select-none touch-none ${
                  isArmed
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-panel-stroke)] hover:border-[var(--color-accent)]'
                }`}
              >
                <span aria-hidden>▲</span>
              </button>
            );
          })()}
          {(() => {
            const payload: ToolPayload = { kind: 'draw' };
            const isArmed = armed?.kind === 'draw';
            return (
              <button
                type="button"
                onClick={() => arm(isArmed ? null : payload)}
                aria-pressed={isArmed}
                aria-label={`Zeichnen ${isArmed ? 'aktiv' : 'aktivieren'}`}
                title="Zeichnen — klicken und waagerecht oder senkrecht über den Plan ziehen; die berührte Fläche wird automatisch mit echten Katalogstücken gefüllt"
                className={`w-9 h-9 flex items-center justify-center rounded-md border text-base cursor-pointer select-none ${
                  isArmed
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-panel-stroke)] hover:border-[var(--color-accent)]'
                }`}
              >
                <span aria-hidden>✏️</span>
              </button>
            );
          })()}
        </div>

        {armed?.kind === 'wedge' && (
          <div className="flex items-center gap-1 pl-2 ml-1 border-l border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">Breite:</span>
            <button
              type="button"
              onClick={() => setWedgeBaseWidthM((w) => Math.max(1, round1(w - 0.5)))}
              className="w-5 h-5 flex items-center justify-center rounded border border-[var(--color-border)] text-xs cursor-pointer hover:border-[var(--color-accent)]"
            >
              −
            </button>
            <span className="text-xs w-12 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
              {formatM(wedgeBaseWidthM)} m
            </span>
            <button
              type="button"
              onClick={() => setWedgeBaseWidthM((w) => Math.min(10, round1(w + 0.5)))}
              className="w-5 h-5 flex items-center justify-center rounded border border-[var(--color-border)] text-xs cursor-pointer hover:border-[var(--color-accent)]"
            >
              +
            </button>
            <span className="text-xs text-[var(--color-text-muted)] ml-2">Reihen:</span>
            <button
              type="button"
              onClick={() => setWedgeRowCount((r) => Math.max(2, r - 1))}
              className="w-5 h-5 flex items-center justify-center rounded border border-[var(--color-border)] text-xs cursor-pointer hover:border-[var(--color-accent)]"
            >
              −
            </button>
            <span className="text-xs w-4 text-center" style={{ fontFamily: 'var(--font-mono)' }}>
              {wedgeRowCount}
            </span>
            <button
              type="button"
              onClick={() => setWedgeRowCount((r) => Math.min(8, r + 1))}
              className="w-5 h-5 flex items-center justify-center rounded border border-[var(--color-border)] text-xs cursor-pointer hover:border-[var(--color-accent)]"
            >
              +
            </button>
          </div>
        )}
        {(armed?.kind === 'wedge' || armed?.kind === 'draw') && (
          <div className="flex items-center gap-1 pl-2 ml-1 border-l border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">Tiefe:</span>
            {([1, 2] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPieceThicknessM(t)}
                aria-pressed={pieceThicknessM === t}
                className={`px-2 py-1 rounded text-xs border cursor-pointer select-none ${
                  pieceThicknessM === t
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
                }`}
              >
                {t} m
              </button>
            ))}
          </div>
        )}
      </div>

      <details className="text-xs text-[var(--color-text-muted)]">
        <summary className="cursor-pointer select-none">Tastatur-Kurzbefehle</summary>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Klick</kbd> auf den Plan aktiviert die
            Tastatur
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">↑↓←→</kbd> Cursor/Stück bewegen
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Enter</kbd> platzieren
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">R</kbd> drehen — auch schon während du
            ein Stück aus der Leiste ziehst, vor dem Loslassen
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Entf</kbd> entfernen
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Esc</kbd> abbrechen/abwählen
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">1</kbd>–
            <kbd className="rounded border border-[var(--color-border)] px-1">5</kbd> Plattengröße
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">T</kbd> Dreieckpodest
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">K</kbd> Dreieck-Keil
          </li>
        </ul>
      </details>
    </div>
  );
}
