import { useEffect, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { LabeledFootPosition } from '../../domain/feet';
import { footColorForHeight } from '../../domain/footColorScale';
import { trianglePoints } from '../../domain/triangle';
import type { LayoutResult, TriangleCorner } from '../../domain/types';

// Real 48,3 mm Rohr (r≈0,024) — leicht überzeichnet für Lesbarkeit aus Kameraabstand.
const FOOT_RADIUS_M = 0.032;
const FOOT_PLATE_RADIUS_M = 0.08;   // runde Fußplatte am Boden (orange = Positionsmarker)
const FOOT_PLATE_HEIGHT_M = 0.012;
const FOOT_NUT_RADIUS_M = 0.048;    // Stellmutter der Verstellspindel
const FOOT_NUT_HEIGHT_M = 0.03;
const FOOT_NUT_CENTER_ABOVE_PLATE_M = 0.07;
export const PANEL_THICKNESS_M = 0.08;
const MARKER_RADIUS_M = 0.09;
// Orange (CI-Signalfarbe) markiert IMMER klar erkennbar, wo ein Fuß sitzt — oben UND
// unten am Boden — unabhängig von der höhenkodierten Farbe des Fuß-Schafts dazwischen.
const MARKER_COLOR = '#f08100';

// Sichtbarer Alu-Strangpress-Rahmen rund um jede Platte (real ca. 4 cm).
const FRAME_WIDTH_M = 0.04;
// Belag liegt 5 mm tiefer als die Rahmen-Oberkante → Rahmen wirkt als erhabene Kante.
const INFILL_RECESS_M = 0.005;
// Gesamtfuge zwischen zwei Nachbarplatten (je 5 mm pro Seite) — wie bisher `p.w - 0.01`.
const PANEL_GAP_M = 0.01;
// Standard-Belagfarbe: schwarzer, matter Siebdruck-/Antirutschbelag.
const DEFAULT_INFILL_COLOR = '#1f1f1f';
const SONDERMASS_INFILL_COLOR = '#9a6b00';

// Einmal gebaute, geteilte Materialien (nicht pro Mesh neu erzeugen).
// Metalness bewusst ≤ 0.55: ohne Environment-Map wird hochmetallisches Material fast schwarz.
const FRAME_MATERIAL = new THREE.MeshStandardMaterial({ color: '#c3c7cc', metalness: 0.55, roughness: 0.4 });
const FOOT_HARDWARE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#8d9299', metalness: 0.5, roughness: 0.45 });

/** Versetzt ein konvexes Polygon (u,v) um `t` nach innen (Kanten parallel verschieben, Nachbarn schneiden). */
function insetPolygon(pts: Array<{ x: number; y: number }>, t: number): Array<{ x: number; y: number }> {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  const lines = pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    let nx = -dy;
    let ny = dx;
    if (nx * (cx - a.x) + ny * (cy - a.y) < 0) { nx = -nx; ny = -ny; }
    return { px: a.x + nx * t, py: a.y + ny * t, dx, dy };
  });
  return pts.map((_, i) => {
    const l1 = lines[(i - 1 + n) % n];
    const l2 = lines[i];
    const cross = l1.dx * l2.dy - l1.dy * l2.dx;
    const s = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / cross;
    return { x: l1.px + s * l1.dx, y: l1.py + s * l1.dy };
  });
}

/** Die (u,v)-Punkte je Ausrichtung — identisch zur bisherigen Dreieck-Konstruktion, mit Fugen-Inset. */
function triangleUV(corner: TriangleCorner): Array<{ x: number; y: number }> {
  const raw = trianglePoints({ x: 0, y: 0, w: 1, d: 1 }, corner).map((pt) => ({ x: pt.x, y: -pt.y }));
  return insetPolygon(raw, PANEL_GAP_M / 2);
}

function shapeFrom(pts: Array<{ x: number; y: number }>): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i === 0 ? s.moveTo(p.x, p.y) : s.lineTo(p.x, p.y)));
  s.closePath();
  return s;
}

/** Rahmen = Außenkontur mit Loch (Innenkontur); Belag = Innenkontur. Je 4 Ausrichtungen, einmal gecacht. */
const TRIANGLE_FRAME_SHAPES = {} as Record<TriangleCorner, THREE.Shape>;
const TRIANGLE_INFILL_SHAPES = {} as Record<TriangleCorner, THREE.Shape>;
for (const corner of ['tl', 'tr', 'bl', 'br'] as TriangleCorner[]) {
  const outer = triangleUV(corner);
  const inner = insetPolygon(outer, FRAME_WIDTH_M);
  const frame = shapeFrom(outer);
  const hole = new THREE.Path();
  inner.forEach((p, i) => (i === 0 ? hole.moveTo(p.x, p.y) : hole.lineTo(p.x, p.y)));
  hole.closePath();
  frame.holes.push(hole);
  TRIANGLE_FRAME_SHAPES[corner] = frame;
  TRIANGLE_INFILL_SHAPES[corner] = shapeFrom(inner);
}

/** Ein Fuß: runde Bodenplatte (orange Marker) + Stellmutter (Metall) + höhenfarbiges Rohr bis unter die Platte. */
function Foot({ x, z, baseY, heightM, color }: { x: number; z: number; baseY: number; heightM: number; color: string }) {
  const tubeBottom = baseY + FOOT_PLATE_HEIGHT_M;
  const tubeLen = Math.max(heightM - FOOT_PLATE_HEIGHT_M, 0.001);
  const showNut = heightM > FOOT_NUT_CENTER_ABOVE_PLATE_M + FOOT_NUT_HEIGHT_M;
  return (
    <group>
      <mesh position={[x, baseY + FOOT_PLATE_HEIGHT_M / 2, z]}>
        <cylinderGeometry args={[FOOT_PLATE_RADIUS_M, FOOT_PLATE_RADIUS_M, FOOT_PLATE_HEIGHT_M, 24]} />
        <meshStandardMaterial color={MARKER_COLOR} emissive={MARKER_COLOR} emissiveIntensity={0.35} roughness={0.6} metalness={0.2} />
      </mesh>
      {showNut && (
        <mesh position={[x, tubeBottom + FOOT_NUT_CENTER_ABOVE_PLATE_M, z]} material={FOOT_HARDWARE_MATERIAL}>
          <cylinderGeometry args={[FOOT_NUT_RADIUS_M, FOOT_NUT_RADIUS_M, FOOT_NUT_HEIGHT_M, 6]} />
        </mesh>
      )}
      <mesh position={[x, tubeBottom + tubeLen / 2, z]}>
        <cylinderGeometry args={[FOOT_RADIUS_M, FOOT_RADIUS_M, tubeLen, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.45} metalness={0.3} />
      </mesh>
    </group>
  );
}

/** Eine Rechteck-Platte: 4 Alu-Rahmenprofile + vertiefter Belag in der Mitte. */
function RectPanel({ cx, cz, deckY, w, d, infillColor }: {
  cx: number; cz: number; deckY: number; w: number; d: number; infillColor: string;
}) {
  const ow = w - PANEL_GAP_M; // Außenmaß inkl. Fuge
  const od = d - PANEL_GAP_M;
  const F = FRAME_WIDTH_M;
  const T = PANEL_THICKNESS_M;
  const yMid = deckY + T / 2;
  const infillH = T - INFILL_RECESS_M;
  return (
    <group>
      {/* vorne / hinten (entlang X, volle Breite) */}
      <mesh position={[cx, yMid, cz - od / 2 + F / 2]} material={FRAME_MATERIAL}>
        <boxGeometry args={[ow, T, F]} />
      </mesh>
      <mesh position={[cx, yMid, cz + od / 2 - F / 2]} material={FRAME_MATERIAL}>
        <boxGeometry args={[ow, T, F]} />
      </mesh>
      {/* links / rechts (entlang Z, zwischen den Längsprofilen) */}
      <mesh position={[cx - ow / 2 + F / 2, yMid, cz]} material={FRAME_MATERIAL}>
        <boxGeometry args={[F, T, od - 2 * F]} />
      </mesh>
      <mesh position={[cx + ow / 2 - F / 2, yMid, cz]} material={FRAME_MATERIAL}>
        <boxGeometry args={[F, T, od - 2 * F]} />
      </mesh>
      {/* Belag */}
      <mesh position={[cx, deckY + infillH / 2, cz]}>
        <boxGeometry args={[ow - 2 * F, infillH, od - 2 * F]} />
        <meshStandardMaterial color={infillColor} roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}

export interface SceneTier {
  layout: LayoutResult;
  /** Füße mit renderX/renderY — wird sichtbar in die Eigentümer-Platte gezeichnet statt exakt auf die Plattengrenze. */
  feet: LabeledFootPosition[];
  /** Höhe dieser Ebene: wie lang die Füße dieser Ebene sind. */
  heightM: number;
  /** Boden-Offset in Metern, auf dem diese Ebene aufsetzt (Standard 0 = Boden). */
  baseY?: number;
  offsetX?: number;
  offsetZ?: number;
  panelColor?: string;
  footColor?: string;
  label?: string;
}

interface Props {
  tiers: SceneTier[];
  /** Ruft das <canvas>-Element auf, sobald WebGL bereit ist — für den PNG-Export der 3D-Ansicht. */
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

/**
 * `<Canvas camera={{position}}>` und `<OrbitControls target={...}>` setzen die Kamera NUR beim
 * ersten Aufbau — sobald OrbitControls übernommen hat, ändert ein späterer Prop-Wechsel (z.B.
 * "Draufsicht" anklicken) nichts mehr an der tatsächlich angezeigten Kamera. Diese unsichtbare
 * Rig-Komponente läuft INNERHALB von <Canvas> (nur dort ist useThree() nutzbar) und setzt
 * Kameraposition + Controls-Ziel bei jeder Änderung (oder Klick auf "Zurücksetzen") aktiv neu.
 */
function CameraRig({
  cameraX,
  cameraY,
  cameraZ,
  targetX,
  targetY,
  targetZ,
  resetToken,
  controlsRef,
}: {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  resetToken: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(cameraX, cameraY, cameraZ);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.set(targetX, targetY, targetZ);
      controls.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraX, cameraY, cameraZ, targetX, targetY, targetZ, resetToken]);
  return null;
}

export function AufbauScene3D({ tiers, onCanvasReady }: Props) {
  const [topView, setTopView] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const validTiers = tiers.filter((t) => t.layout.widthM > 0 && t.layout.depthM > 0);
  if (validTiers.length === 0) return null;

  const maxX = Math.max(...validTiers.map((t) => (t.offsetX ?? 0) + t.layout.widthM));
  const maxZ = Math.max(...validTiers.map((t) => (t.offsetZ ?? 0) + t.layout.depthM));
  const maxTopY = Math.max(...validTiers.map((t) => (t.baseY ?? 0) + t.heightM));
  const centerX = maxX / 2;
  const centerZ = maxZ / 2;
  const camDistance = Math.max(maxX, maxZ, 2) * 1.4;

  const cameraPosition: [number, number, number] = topView
    ? [centerX, maxTopY + camDistance * 1.6, centerZ + 0.01]
    : [centerX + camDistance * 0.6, maxTopY + camDistance * 0.7, centerZ + camDistance];
  const targetPosition: [number, number, number] = [centerX, maxTopY / 2, centerZ];

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setTopView(false)}
          aria-pressed={!topView}
          className={`px-3 py-1.5 rounded-md text-sm border ${!topView ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'}`}
        >
          Perspektive
        </button>
        <button
          type="button"
          onClick={() => setTopView(true)}
          aria-pressed={topView}
          className={`px-3 py-1.5 rounded-md text-sm border ${topView ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'}`}
        >
          Draufsicht
        </button>
        <button
          type="button"
          onClick={() => setResetToken((t) => t + 1)}
          title="Kamera wieder auf die aktuelle Ansicht (Perspektive/Draufsicht) zurücksetzen — hilft, wenn man sich verzoomt/verdreht hat"
          className="px-3 py-1.5 rounded-md text-sm border bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]"
        >
          ↺ Zurücksetzen
        </button>
      </div>
      <div className="w-full h-[420px] rounded-lg overflow-hidden border border-[var(--color-border)]">
        <Canvas
          camera={{ position: cameraPosition, fov: 40 }}
          gl={{ preserveDrawingBuffer: true }}
          onCreated={(state) => onCanvasReady?.(state.gl.domElement)}
        >
          <hemisphereLight args={['#ffffff', '#d9d2c3', 0.6]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[5, 10, 5]} intensity={1.4} />
          <directionalLight position={[-5, 6, -5]} intensity={0.5} />

          <mesh position={[centerX, -0.01, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[maxX + 2, maxZ + 2]} />
            <meshStandardMaterial color="#f4eee0" roughness={1} metalness={0} />
          </mesh>

          {validTiers.map((tier, tierIndex) => {
            const offsetX = tier.offsetX ?? 0;
            const offsetZ = tier.offsetZ ?? 0;
            const baseY = tier.baseY ?? 0;
            const deckY = baseY + tier.heightM;
            return (
              <group key={tierIndex}>
                {tier.layout.panels.map((p, i) =>
                  p.corner === undefined ? (
                    <RectPanel
                      key={i}
                      cx={p.x + offsetX + p.w / 2}
                      cz={p.y + offsetZ + p.d / 2}
                      deckY={deckY}
                      w={p.w}
                      d={p.d}
                      infillColor={p.isSondermass ? SONDERMASS_INFILL_COLOR : (tier.panelColor ?? DEFAULT_INFILL_COLOR)}
                    />
                  ) : (
                    <group key={i} position={[p.x + offsetX, deckY, p.y + offsetZ]} rotation={[-Math.PI / 2, 0, 0]}>
                      <mesh material={FRAME_MATERIAL}>
                        <extrudeGeometry args={[TRIANGLE_FRAME_SHAPES[p.corner], { depth: PANEL_THICKNESS_M, bevelEnabled: false }]} />
                      </mesh>
                      <mesh>
                        <extrudeGeometry args={[TRIANGLE_INFILL_SHAPES[p.corner], { depth: PANEL_THICKNESS_M - INFILL_RECESS_M, bevelEnabled: false }]} />
                        <meshStandardMaterial color={tier.panelColor ?? DEFAULT_INFILL_COLOR} roughness={0.9} metalness={0} />
                      </mesh>
                    </group>
                  ),
                )}

                {tier.feet.map((f, i) => (
                  <Foot
                    key={i}
                    x={f.renderX + offsetX}
                    z={f.renderY + offsetZ}
                    baseY={baseY}
                    heightM={tier.heightM}
                    color={tier.footColor ?? footColorForHeight(tier.heightM * 100)}
                  />
                ))}

                {/* Orange Markierungspunkte oben (Deckplatte) — so ist jede
                    Fußposition aus jedem Blickwinkel (Perspektive wie Draufsicht) eindeutig
                    erkennbar, unabhängig von der höhenkodierten Schaftfarbe. */}
                {tier.feet.map((f, i) => (
                  <mesh
                    key={`marker-top-${i}`}
                    position={[f.renderX + offsetX, deckY + PANEL_THICKNESS_M + 0.005, f.renderY + offsetZ]}
                    rotation={[-Math.PI / 2, 0, 0]}
                  >
                    <circleGeometry args={[MARKER_RADIUS_M, 20]} />
                    <meshStandardMaterial color={MARKER_COLOR} emissive={MARKER_COLOR} emissiveIntensity={0.5} />
                  </mesh>
                ))}
              </group>
            );
          })}

          <OrbitControls
            ref={controlsRef}
            target={targetPosition}
            minDistance={0.5}
            maxDistance={camDistance * 6}
          />
          <CameraRig
            cameraX={cameraPosition[0]}
            cameraY={cameraPosition[1]}
            cameraZ={cameraPosition[2]}
            targetX={targetPosition[0]}
            targetY={targetPosition[1]}
            targetZ={targetPosition[2]}
            resetToken={resetToken}
            controlsRef={controlsRef}
          />
        </Canvas>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Orange Punkte markieren jede Fußposition oben und unten — der Schaft dazwischen ist nach Fußhöhe eingefärbt
        (siehe Legende). Verzoomt/verdreht? "↺ Zurücksetzen" bringt die Kamera zurück.
      </p>
    </div>
  );
}
