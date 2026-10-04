import { useEffect, useId, useRef, useState } from 'react';
import {
  findFreePosition,
  fitsAt,
  shiftPieces,
  type FilledPiece,
  type Piece2D,
} from '../../domain/customShape';
import { isCatalogRect, isSondermassPiece, TRIANGLE_PANEL_SIZE_M, QUARTER_CIRCLE_RADIUS_M, CATALOG_WIDTHS_M, CATALOG_DEPTHS_M } from '../../domain/panels';
import { nextTriangleCorner, quarterCirclePath, triangleHand, trianglePoints } from '../../domain/triangle';
import type { TriangleCorner } from '../../domain/types';
import { formatMeters } from '../../lib/format';

type ToolPayload = { kind: 'piece'; w: number; d: number } | { kind: 'triangle'; corner: TriangleCorner; w: number; d: number } | { kind: 'viertelkreis'; corner: TriangleCorner };

interface Props {
  pieces: Piece2D[];
  onAddPieces: (pieces: FilledPiece[]) => void;
  onRemovePiece: (id: string) => void;
  onMovePiece: (id: string, x: number, y: number) => void;
  onRotatePiece: (id: string) => void;
  onMirrorPiece?: (id: string) => void;
  /** Verschiebt alle Stücke dieses Plans gemeinsam waagerecht um dx Meter ("Alles verschieben").
   *  Wird nur aufgerufen, wenn dabei nichts links über x=0 hinausrutscht (siehe shiftPieces). */
  onShiftAll: (dx: number) => void;
  /** Rückgängig/Wiederholen für diesen Plan — optional, damit die Komponente ohne Verlauf nutzbar bleibt. */
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** Leert den ganzen Plan (ersetzt den bisherigen "Zurücksetzen"-Knopf im jeweiligen Modul). */
  onClear?: () => void;
  /** Beschriftung über der Kante, an der y=0 liegt (z.B. "Bühnenvorderkante"). */
  frontEdgeLabel?: string;
  /** Erzwingt eine Mindest-viewBox-Breite — z.B. damit zwei Ebenen (Tresen: Unterbau +
   *  Thekenplatte) dieselbe Skala teilen, statt unabhängig auf den eigenen Inhalt zu skalieren. */
  minCanvasWidthM?: number;
  /** Gestrichelter Referenz-Umriss einer anderen Fläche, an ihrer tatsächlichen Position (x,y) —
   *  NICHT pauschal an (0,0) verankert, sonst zeigt der Umriss eine Fläche, in der die echten
   *  Platten gar nicht liegen, sobald diese Ebene versetzt statt vorderkantenbündig gebaut wurde
   *  (siehe boundingBoxOf in customShape.ts). */
  referenceFootprint?: { x: number; y: number; widthM: number; depthM: number; label?: string };
}

const PAD = 0.6;
const MIN_CANVAS_WIDTH_M = 6;
const MIN_CANVAS_DEPTH_M = 4;
const BUFFER_M = 2;
const DRAG_THRESHOLD_PX = 4;
const GRID_STEP_M = 0.5;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

const PALETTE_WIDTHS = [...CATALOG_WIDTHS_M, 0.5] as const;
const PALETTE_DEPTHS = [...CATALOG_DEPTHS_M] as const;

interface ShapeGeometry {
  x: number;
  y: number;
  w: number;
  d: number;
  corner?: TriangleCorner;
  shape?: string;
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
  if (piece.shape === 'viertelkreis') {
    return (
      <path d={quarterCirclePath(piece, piece.corner)} {...shared}>
        {children}
      </path>
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
 *  beim Ziehen/Platzieren-Vorschau. */
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
      {formatMeters(w, 2)}×{formatMeters(d, 2)} m
    </text>
  );
}

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  target: { x: number; y: number } | null;
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
  onMirrorPiece,
  onShiftAll,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClear,
  frontEdgeLabel = 'Vorderkante',
  minCanvasWidthM,
  referenceFootprint,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const [armed, setArmedState] = useState<ToolPayload | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Einzelauswahl (Drehen/Spiegeln/Pfeiltasten) gilt nur bei genau einem ausgewählten Stück;
  // mit Umschalt+Klick lassen sich mehrere auswählen, die dann gemeinsam gelöscht werden.
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  function setSelectedId(next: string | null | ((cur: string | null) => string | null)) {
    const value = typeof next === 'function' ? next(selectedId) : next;
    setSelectedIds(value === null ? [] : [value]);
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragState | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [paletteW, setPaletteW] = useState(2);
  const [paletteD, setPaletteD] = useState(1);
  // Ein Button hat natives Klick-Verhalten, das nach einem echten Ziehen trotzdem feuert
  // (Pointer-Events und das nachfolgende `click` sind getrennte, aufeinanderfolgende Dinge,
  // auch bei Pointer-Capture). Ein Ref statt State, damit der Wert synchron und ohne
  // Render-Verzögerung im direkt danach feuernden `onClick` verfügbar ist.
  const suppressNextClickRef = useRef(false);

  function arm(payload: ToolPayload | null) {
    setArmedState(payload);
    setSelectedId(null);
    setPointerPos(null);
  }

  function showBlockedMessage(text: string) {
    setBlockedMessage(text);
    setTimeout(() => setBlockedMessage((cur) => (cur === text ? null : cur)), 2500);
  }

  const contentWidthM = Math.max(
    pieces.reduce((m, p) => Math.max(m, p.x + p.w), 0),
    referenceFootprint ? referenceFootprint.x + referenceFootprint.widthM : 0,
  );
  const contentDepthM = Math.max(
    pieces.reduce((m, p) => Math.max(m, p.y + p.d), 0),
    referenceFootprint ? referenceFootprint.y + referenceFootprint.depthM : 0,
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

  // Bedient sowohl den Klick-Bewaffnen-Hover als auch das Ziehen aus der Palette (sobald der
  // Cursor über dem Canvas ist) — eine einzige Vorschau-Quelle für beide Wege.
  function previewForPayload(payload: ToolPayload | null): FilledPiece[] | null {
    if (!payload || !pointerPos) return null;
    if (payload.kind === 'piece') {
      const pos = findFreePosition(pieces, payload.w, payload.d, pointerPos.x - payload.w / 2, pointerPos.y - payload.d / 2);
      return [{ x: pos.x, y: pos.y, w: payload.w, d: payload.d }];
    }
    if (payload.kind === 'viertelkreis') {
      const r = QUARTER_CIRCLE_RADIUS_M;
      const pos = findFreePosition(pieces, r, r, pointerPos.x - r / 2, pointerPos.y - r / 2);
      return [{ x: pos.x, y: pos.y, w: r, d: r, corner: payload.corner, shape: 'viertelkreis' }];
    }
    const pos = findFreePosition(pieces, payload.w, payload.d, pointerPos.x - payload.w / 2, pointerPos.y - payload.d / 2);
    return [{ x: pos.x, y: pos.y, w: payload.w, d: payload.d, corner: payload.corner }];
  }

  // arm(null) beim Start eines Paletten-Ziehens sorgt dafür, dass armed/paletteDrag nie
  // gleichzeitig aktiv sind — das `??` ist defensiv, nicht tragend.
  const activePayload = armed ?? (paletteDrag?.overCanvas ? paletteDrag.payload : null);
  const previewPieces = previewForPayload(activePayload);

  // Reine Platzier-Funktion ohne Seiteneffekt auf armed/paletteDrag — das bleibt Sache der
  // Aufrufer (Klick-Platzieren-Pfad, Paletten-Ziehen UND Tastatur-Platzieren nutzen dieselbe
  // Logik, nur die Umrechnung von Bildschirm- zu Meter-Koordinaten unterscheidet sich).
  function commitPayloadAtPoint(payload: ToolPayload, pos: { x: number; y: number }) {
    if (payload.kind === 'piece') {
      const target = findFreePosition(pieces, payload.w, payload.d, pos.x - payload.w / 2, pos.y - payload.d / 2);
      onAddPieces([{ x: target.x, y: target.y, w: payload.w, d: payload.d }]);
    } else if (payload.kind === 'viertelkreis') {
      const r = QUARTER_CIRCLE_RADIUS_M;
      const target = findFreePosition(pieces, r, r, pos.x - r / 2, pos.y - r / 2);
      onAddPieces([{ x: target.x, y: target.y, w: r, d: r, corner: payload.corner, shape: 'viertelkreis' }]);
    } else {
      const target = findFreePosition(pieces, payload.w, payload.d, pos.x - payload.w / 2, pos.y - payload.d / 2);
      onAddPieces([{ x: target.x, y: target.y, w: payload.w, d: payload.d, corner: payload.corner }]);
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
  // daher reicht ein normaler onKeyDown hier.
  function rotatePaletteDrag() {
    setPaletteDrag((d) => {
      if (!d) return d;
      if (d.payload.kind === 'piece') return { ...d, payload: { kind: 'piece', w: d.payload.d, d: d.payload.w } };
      if (d.payload.kind === 'triangle') return { ...d, payload: { kind: 'triangle', corner: nextTriangleCorner(d.payload.corner), w: d.payload.d, d: d.payload.w } };
      if (d.payload.kind === 'viertelkreis') return { ...d, payload: { kind: 'viertelkreis', corner: nextTriangleCorner(d.payload.corner) } };
      return d;
    });
  }

  // Fensterweit statt nur am Button: Safari fokussiert Buttons beim Klick nicht, daher kam R dort
  // nie an. Zusätzlich dreht ein Rechtsklick/Mausrad das gezogene Stück sofort.
  const dragging = paletteDrag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      rotatePaletteDrag();
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      rotatePaletteDrag();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rotatePaletteDrag();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', onContext);
      window.removeEventListener('wheel', onWheel);
    };
  }, [dragging]);

  function handlePiecePointerDown(e: React.PointerEvent<SVGElement>, piece: Piece2D) {
    if (armed) return;
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedIds((cur) => (cur.includes(piece.id) ? cur.filter((id) => id !== piece.id) : [...cur, piece.id]));
      return;
    }
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
    // Ein quadratisches Dreieck (1×1) oder Viertelkreis behält beim Drehen exakt seine Bounding-Box
    // (nur die Ecke wechselt) — kann also nie neu kollidieren.
    // Ein nicht-quadratisches Dreieck (2×1) ändert seine Box beim Drehen und muss wie ein Rechteck
    // behandelt werden (Kollisions-Check, ggf. nachdrücken).
    const isSquare = Math.abs(selectedPiece.w - selectedPiece.d) < 1e-6;
    if (selectedPiece.corner !== undefined && isSquare) {
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
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => onRemovePiece(id));
    setSelectedIds([]);
  }

  const canShiftLeft = pieces.length > 0 && shiftPieces(pieces, -GRID_STEP_M) !== null;

  function shiftAll(dx: number) {
    if (pieces.length === 0) return;
    if (dx < 0 && !canShiftLeft) {
      showBlockedMessage('Weiter nach links geht nicht — die Fläche liegt schon am linken Rand.');
      return;
    }
    onShiftAll(dx);
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
  // Segmented-Control, T bewaffnet das Dreieckpodest.
  function handleCanvasKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'Escape') {
      arm(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) onRedo?.();
      else onUndo?.();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      onRedo?.();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
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
        setArmedState((cur) => (cur?.kind === 'triangle' ? { kind: 'triangle', corner: nextTriangleCorner(cur.corner), w: cur.d, d: cur.w } : cur));
      } else if (armed?.kind === 'viertelkreis') {
        setArmedState((cur) => (cur?.kind === 'viertelkreis' ? { kind: 'viertelkreis', corner: nextTriangleCorner(cur.corner) } : cur));
      }
      return;
    }
    // Umschalt+←/→ verschiebt immer die ganze Fläche, auch wenn gerade ein Stück ausgewählt ist —
    // ohne Umschalt bleibt es beim bisherigen Nudge des Einzelstücks bzw. Tastatur-Cursors.
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      shiftAll(e.key === 'ArrowLeft' ? -GRID_STEP_M : GRID_STEP_M);
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
      } else if (armed) {
        setPointerPos((cur) => {
          const base = cur ?? { x: 0, y: 0 };
          return { x: Math.max(0, round1(base.x + dx)), y: Math.max(0, round1(base.y + dy)) };
        });
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && armed && pointerPos) {
      e.preventDefault();
      commitPayloadAtPoint(armed, pointerPos);
      arm(null);
      return;
    }
    if (/^[1-4]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      const widths = [...PALETTE_WIDTHS];
      if (idx < widths.length) {
        e.preventDefault();
        const newW = widths[idx];
        let newD = paletteD;
        if (!isCatalogRect(newW, newD)) {
          const validDepths = PALETTE_DEPTHS.filter((d) => isCatalogRect(newW, d));
          newD = validDepths[0] ?? 0.39;
        }
        setPaletteW(newW);
        setPaletteD(newD);
        const isArmed = armed?.kind === 'piece' && armed.w === newW && armed.d === newD;
        const payload: ToolPayload = { kind: 'piece', w: newW, d: newD };
        arm(isArmed ? null : payload);
      }
      return;
    }
    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      const payload: ToolPayload = { kind: 'triangle', corner: 'tl', w: TRIANGLE_PANEL_SIZE_M, d: TRIANGLE_PANEL_SIZE_M };
      arm(armed?.kind === 'triangle' && armed.w === TRIANGLE_PANEL_SIZE_M && armed.d === TRIANGLE_PANEL_SIZE_M ? null : payload);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-muted)]">
        Ziehe ein Stück direkt aus der Leiste unten auf den Plan — oder klicke es erst an und dann
        auf die gewünschte Stelle. Ein vorhandenes Stück kannst du direkt ziehen, um es zu verschieben, oder
        anklicken, um es zu drehen oder zu entfernen. Nach einem Klick auf den Plan geht es auch per Tastatur
        (Kurzbefehle unten).
      </p>

      {armed && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-accent)]">
          <span>Jetzt im Plan unten auf die gewünschte Stelle klicken.</span>
          <button type="button" onClick={() => arm(null)} className="shrink-0 text-xs underline">
            Abbrechen
          </button>
        </div>
      )}
      {selectedIds.length > 1 && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          <span className="text-[var(--color-text)]">{selectedIds.length} Stücke ausgewählt (Umschalt+Klick wählt weitere an/ab)</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={removeSelected}
              className="px-2 py-1 rounded text-xs border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
            >
              Alle entfernen
            </button>
            <button type="button" onClick={() => setSelectedIds([])} className="px-2 py-1 rounded text-xs text-[var(--color-text-muted)] underline">
              Abwählen
            </button>
          </div>
        </div>
      )}
      {selectedPiece && (
        <div role="status" className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
          <span className="text-[var(--color-text)]">
            Ausgewählt: {formatMeters(selectedPiece.w, 2)}×{formatMeters(selectedPiece.d, 2)} m
            {selectedPiece.corner !== undefined && selectedPiece.w !== selectedPiece.d && ` (${triangleHand(selectedPiece.corner, selectedPiece.w, selectedPiece.d)})`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={rotateSelected}
              className="px-2 py-1 rounded text-xs border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
            >
              ⤾ Drehen
            </button>
            {selectedPiece.corner !== undefined && selectedPiece.w !== selectedPiece.d && onMirrorPiece && (
              <button
                type="button"
                onClick={() => onMirrorPiece(selectedPiece.id)}
                className="px-2 py-1 rounded text-xs border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
              >
                ⇋ Spiegeln
              </button>
            )}
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
        <div role="status" className="rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-danger)]">
          {blockedMessage}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-auto max-h-[420px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        role="img"
        aria-label="Bau-Editor — klicken und dann Tastatur nutzen (Pfeiltasten, Enter, R, Entf, Esc, 1–5, T; Kurzbefehle siehe unten)"
        tabIndex={0}
        onKeyDown={handleCanvasKeyDown}
      >
        <defs>
          <pattern id={`pce-hatch-${uid}`} width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
            <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch)" strokeWidth={0.02} opacity={0.32} />
          </pattern>
          <pattern id={`pce-hatch-warning-${uid}`} width={0.14} height={0.14} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width={0.14} height={0.14} fill="var(--color-panel-fill)" />
            <line x1={0} y1={0} x2={0} y2={0.14} stroke="var(--color-panel-hatch-warning)" strokeWidth={0.022} opacity={0.42} />
          </pattern>
          <pattern id={`pce-dotgrid-${uid}`} width={GRID_STEP_M} height={GRID_STEP_M} patternUnits="userSpaceOnUse">
            <circle cx={GRID_STEP_M / 2} cy={GRID_STEP_M / 2} r={0.012} fill="var(--color-grid-line)" />
          </pattern>
        </defs>

        <rect
          x={-PAD}
          y={-PAD}
          width={canvasWidthM + PAD * 2}
          height={canvasDepthM + PAD * 2}
          fill={`url(#pce-dotgrid-${uid})`}
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
          pointerEvents={armed ? 'all' : 'none'}
          onMouseMove={(e) => {
            if (!armed) return;
            setPointerPos(svgPointFromClient(e.clientX, e.clientY));
          }}
          onClick={(e) => {
            if (!armed) return;
            commitPayloadAt(armed, e.clientX, e.clientY);
            arm(null);
          }}
          style={{ cursor: armed ? 'copy' : 'default' }}
        />
        {!armed && selectedIds.length > 0 && (
          <rect
            x={0}
            y={0}
            width={canvasWidthM}
            height={canvasDepthM}
            fill="transparent"
            onClick={() => setSelectedIds([])}
          />
        )}

        {referenceFootprint && (
          <>
            <rect
              x={referenceFootprint.x}
              y={referenceFootprint.y}
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
                x={referenceFootprint.x + referenceFootprint.widthM / 2}
                y={
                  referenceFootprint.y +
                  Math.min(referenceFootprint.depthM, Math.max(0, canvasDepthM - referenceFootprint.y)) / 2
                }
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
              piece={{ ...p, shape: p.shape }}
              fill={sondermass ? `url(#pce-hatch-warning-${uid})` : `url(#pce-hatch-${uid})`}
              fillOpacity={isDragTarget ? 0.25 : 1}
              stroke={selectedIds.includes(p.id) ? 'var(--color-accent)' : 'var(--color-panel-stroke)'}
              strokeWidth={selectedIds.includes(p.id) ? 0.035 : 0.02}
              pointerEvents={interactive ? 'all' : 'none'}
              style={{ cursor: interactive ? 'grab' : 'default' }}
              onPointerDown={(e) => handlePiecePointerDown(e, p)}
              onPointerMove={(e) => handlePiecePointerMove(e, p)}
              onPointerUp={() => handlePiecePointerUp(p)}
            >
              <title>
                {formatMeters(p.w, 2)}×{formatMeters(p.d, 2)} m bei x={formatMeters(p.x, 2)}, y={formatMeters(p.y, 2)} m
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
                  piece={{ x: drag.target.x, y: drag.target.y, w, d, corner: dragged?.corner, shape: dragged?.shape }}
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

      </svg>

      <div className="flex flex-wrap items-center gap-3" style={{ fontFamily: 'var(--font-display)' }}>
        {/* Breite-Leiste */}
        <div className="flex rounded-md border border-[var(--color-panel-stroke)] overflow-hidden">
          {PALETTE_WIDTHS.map((w, idx) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                let newD = paletteD;
                if (!isCatalogRect(w, newD)) {
                  const validDepths = PALETTE_DEPTHS.filter((d) => isCatalogRect(w, d));
                  newD = validDepths[0] ?? 0.39;
                }
                setPaletteW(w);
                setPaletteD(newD);
                const newPayload: ToolPayload = { kind: 'piece', w, d: newD };
                arm(paletteW === w && paletteD === newD && armed?.kind === 'piece' ? null : newPayload);
              }}
              aria-pressed={paletteW === w}
              className={`px-3 py-1.5 text-sm cursor-pointer select-none touch-none ${idx > 0 ? 'border-l border-[var(--color-panel-stroke)]' : ''} ${
                paletteW === w
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-panel-fill)]'
              }`}
            >
              {formatMeters(w, 1)} m
            </button>
          ))}
        </div>

        {/* Tiefe-Leiste */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-[var(--color-text-muted)]">Tiefe:</span>
          <div className="flex rounded-md border border-[var(--color-panel-stroke)] overflow-hidden" title="Echte NivTec-Standardtiefen 100/75/50/39 cm">
            {PALETTE_DEPTHS.map((d, idx) => {
              const isDisabled = !isCatalogRect(paletteW, d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    setPaletteD(d);
                    const newPayload: ToolPayload = { kind: 'piece', w: paletteW, d };
                    arm(paletteD === d && armed?.kind === 'piece' ? null : newPayload);
                  }}
                  aria-pressed={paletteD === d}
                  className={`px-3 py-1.5 text-sm cursor-pointer select-none touch-none disabled:opacity-40 disabled:cursor-not-allowed ${idx > 0 ? 'border-l border-[var(--color-panel-stroke)]' : ''} ${
                    paletteD === d
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-panel-fill)]'
                  }`}
                >
                  {formatMeters(d, 2)} m
                </button>
              );
            })}
          </div>
        </div>

        {/* Platzier-Button */}
        {(() => {
          const payload: ToolPayload = { kind: 'piece', w: paletteW, d: paletteD };
          const isArmed = armed?.kind === 'piece' && armed.w === paletteW && armed.d === paletteD;
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
              aria-label={`Stück ${formatMeters(paletteW, 1)}×${formatMeters(paletteD, 2)} m ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`}
              className={`px-3 py-1.5 text-sm rounded-md cursor-pointer select-none touch-none border ${
                isArmed
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                  : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-panel-stroke)] hover:bg-[var(--color-panel-fill)]'
              }`}
            >
              {formatMeters(paletteW, 1)}×{formatMeters(paletteD, 2)} m
            </button>
          );
        })()}

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
            onClick={() => setArmedState((cur) => (cur?.kind === 'triangle' ? { kind: 'triangle', corner: nextTriangleCorner(cur.corner), w: cur.d, d: cur.w } : cur))}
            title="Dreht das Dreieckpodest zur nächsten Ecke"
            aria-label="Dreieckpodest drehen"
            className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-panel-stroke)] text-base cursor-pointer select-none bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
          >
            ⤾
          </button>
        )}
        {armed?.kind === 'viertelkreis' && (
          <button
            type="button"
            onClick={() => setArmedState((cur) => (cur?.kind === 'viertelkreis' ? { kind: 'viertelkreis', corner: nextTriangleCorner(cur.corner) } : cur))}
            title="Dreht den Viertelkreis zur nächsten Ecke"
            aria-label="Viertelkreis drehen"
            className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-panel-stroke)] text-base cursor-pointer select-none bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
          >
            ⤾
          </button>
        )}

        <div className="flex items-center gap-1.5">
          {(() => {
            const payload: ToolPayload = { kind: 'triangle', corner: 'tl', w: TRIANGLE_PANEL_SIZE_M, d: TRIANGLE_PANEL_SIZE_M };
            const isArmed = armed?.kind === 'triangle' && armed.w === TRIANGLE_PANEL_SIZE_M && armed.d === TRIANGLE_PANEL_SIZE_M;
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
                aria-label={`Dreieckpodest 1×1 m ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`}
                title="Dreieckpodest 1×1 m — echtes NivTec-Katalogstück, rechtwinkliges Dreieck mit 1×1 m Katheten"
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
            const payload: ToolPayload = { kind: 'triangle', corner: 'tl', w: 2, d: 1 };
            const isArmed = armed?.kind === 'triangle' && armed.w === 2 && armed.d === 1;
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
                aria-label={`Dreieckpodest 2×1 m ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`}
                title={`Dreieckpodest 2×1 m — 2×1-Katheten-Variante (aktuell: ${isArmed ? triangleHand(payload.corner, payload.w, payload.d) : '–'})`}
                className={`w-9 h-9 flex items-center justify-center rounded-md border text-base cursor-pointer select-none touch-none ${
                  isArmed
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-panel-stroke)] hover:border-[var(--color-accent)]'
                }`}
              >
                <span aria-hidden>◺ 2</span>
              </button>
            );
          })()}
          {(() => {
            const payload: ToolPayload = { kind: 'viertelkreis', corner: 'tl' };
            const isArmed = armed?.kind === 'viertelkreis';
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
                aria-label={`Viertelkreis R 100 cm ${isArmed ? 'ausgewählt' : 'auswählen'}, oder direkt auf den Plan ziehen`}
                title="Viertelkreis R 100 cm — gekrümmtes Podest-Element"
                className={`w-9 h-9 flex items-center justify-center rounded-md border text-base cursor-pointer select-none touch-none ${
                  isArmed
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-panel-stroke)] hover:border-[var(--color-accent)]'
                }`}
              >
                <span aria-hidden>◔</span>
              </button>
            );
          })()}
        </div>

        {(onUndo || pieces.length > 0) && (
          <div className="flex items-center gap-1.5 ml-auto" role="group" aria-label="Verlauf">
            {onUndo && (
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Rückgängig (Strg/Cmd+Z)"
                aria-label="Rückgängig"
                className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-panel-stroke)] text-base cursor-pointer select-none bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--color-panel-stroke)]"
              >
                ↶
              </button>
            )}
            {onRedo && (
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Wiederholen (Strg/Cmd+Umschalt+Z)"
                aria-label="Wiederholen"
                className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-panel-stroke)] text-base cursor-pointer select-none bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--color-panel-stroke)]"
              >
                ↷
              </button>
            )}
            {onClear && pieces.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                title="Leert den ganzen Plan"
                className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
              >
                Zurücksetzen
              </button>
            )}
          </div>
        )}

        {pieces.length > 0 && (
          <div className="flex items-center gap-1.5" role="group" aria-label="Ganze Fläche verschieben">
            <span className="text-xs text-[var(--color-text-muted)]">Alles verschieben</span>
            <button
              type="button"
              onClick={() => shiftAll(-GRID_STEP_M)}
              disabled={!canShiftLeft}
              title={
                canShiftLeft
                  ? 'Alle Stücke gemeinsam 0,5 m nach links (Umschalt+←)'
                  : 'Die Fläche liegt schon am linken Rand'
              }
              aria-label="Alle Stücke 0,5 m nach links verschieben"
              className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-panel-stroke)] text-base cursor-pointer select-none bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--color-panel-stroke)]"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => shiftAll(GRID_STEP_M)}
              title="Alle Stücke gemeinsam 0,5 m nach rechts (Umschalt+→)"
              aria-label="Alle Stücke 0,5 m nach rechts verschieben"
              className="w-9 h-9 flex items-center justify-center rounded-md border border-[var(--color-panel-stroke)] text-base cursor-pointer select-none bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
            >
              →
            </button>
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
            <kbd className="rounded border border-[var(--color-border)] px-1">Umschalt</kbd>+
            <kbd className="rounded border border-[var(--color-border)] px-1">←→</kbd> ganze Fläche verschieben
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
            <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Z</kbd> Rückgängig
          </li>
          <li>
            <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Umschalt+Z</kbd> oder
            <kbd className="rounded border border-[var(--color-border)] px-1">Strg/Cmd+Y</kbd> Wiederholen
          </li>
        </ul>
      </details>
    </div>
  );
}
