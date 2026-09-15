import { useEffect, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { LabeledFootPosition } from '../../domain/feet';
import { footColorForHeight } from '../../domain/footColorScale';
import { trianglePoints } from '../../domain/triangle';
import type { LayoutResult, TriangleCorner } from '../../domain/types';

/**
 * Eine THREE.Shape je Dreieck-Ausrichtung, einmal gebaut und gecacht (nur 4 mögliche Formen
 * existieren überhaupt, unabhängig von Position). Lokale Punkte sind (u,v) = (relative x, -
 * relative Tiefe) — die Rotation [-π/2,0,0] weiter unten bildet (x,y,z)→(x,z,-y) ab, d.h. ein
 * Punkt (u,v,0) landet bei Welt-(u,0,-v); mit v=-relative_z landet er korrekt bei Welt-(x,0,z),
 * genau wie die Box-Geometrie der Rechteck-Podeste (kein Vorzeichenfehler, siehe Herleitung im
 * Plan). Lokal-Z (die Extrusionsrichtung) bildet dabei direkt auf Welt-Y (nach oben) ab.
 */
const TRIANGLE_SHAPES: Record<TriangleCorner, THREE.Shape> = (() => {
  const corners: TriangleCorner[] = ['tl', 'tr', 'bl', 'br'];
  const shapes = {} as Record<TriangleCorner, THREE.Shape>;
  for (const corner of corners) {
    const pts = trianglePoints({ x: 0, y: 0, w: 1, d: 1 }, corner);
    const shape = new THREE.Shape();
    pts.forEach((pt, i) => {
      const u = pt.x;
      const v = -pt.y;
      if (i === 0) shape.moveTo(u, v);
      else shape.lineTo(u, v);
    });
    shape.closePath();
    shapes[corner] = shape;
  }
  return shapes;
})();

// Bewusst NICHT die reale Rohrstärke (48,3mm) — in dieser Größe sind Füße im 3D-Modell
// aus normalem Kameraabstand kaum erkennbar. Für Lesbarkeit deutlich dicker gezeichnet.
const FOOT_RADIUS_M = 0.055;
export const PANEL_THICKNESS_M = 0.08;
const MARKER_RADIUS_M = 0.09;
// Orange (CI-Signalfarbe) markiert IMMER klar erkennbar, wo ein Fuß sitzt — oben UND
// unten am Boden — unabhängig von der höhenkodierten Farbe des Fuß-Schafts dazwischen.
const MARKER_COLOR = '#f08100';

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
          className={`px-3 py-1.5 rounded-md text-sm border ${!topView ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'}`}
        >
          Perspektive
        </button>
        <button
          type="button"
          onClick={() => setTopView(true)}
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
          <ambientLight intensity={0.9} />
          <directionalLight position={[5, 10, 5]} intensity={0.9} />
          <directionalLight position={[-5, 6, -5]} intensity={0.35} />

          <mesh position={[centerX, -0.01, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[maxX + 2, maxZ + 2]} />
            <meshStandardMaterial color="#f4eee0" />
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
                    <mesh key={i} position={[p.x + offsetX + p.w / 2, deckY + PANEL_THICKNESS_M / 2, p.y + offsetZ + p.d / 2]}>
                      <boxGeometry args={[p.w - 0.01, PANEL_THICKNESS_M, p.d - 0.01]} />
                      <meshStandardMaterial
                        color={p.isSondermass ? '#9a6b00' : (tier.panelColor ?? '#2c3e6b')}
                      />
                    </mesh>
                  ) : (
                    <mesh key={i} position={[p.x + offsetX, deckY, p.y + offsetZ]} rotation={[-Math.PI / 2, 0, 0]}>
                      <extrudeGeometry args={[TRIANGLE_SHAPES[p.corner], { depth: PANEL_THICKNESS_M, bevelEnabled: false }]} />
                      <meshStandardMaterial color={tier.panelColor ?? '#2c3e6b'} />
                    </mesh>
                  ),
                )}

                {tier.feet.map((f, i) => {
                  const color = tier.footColor ?? footColorForHeight(tier.heightM * 100);
                  return (
                    <mesh key={i} position={[f.renderX + offsetX, baseY + tier.heightM / 2, f.renderY + offsetZ]}>
                      <cylinderGeometry args={[FOOT_RADIUS_M, FOOT_RADIUS_M, tier.heightM, 16]} />
                      {/* Leichtes Eigenleuchten, damit der Fuß-Schaft auch im Schattenwurf erkennbar bleibt. */}
                      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
                    </mesh>
                  );
                })}

                {/* Orange Markierungspunkte oben (Deckplatte) UND unten (Boden) — so ist jede
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
                {tier.feet.map((f, i) => (
                  <mesh
                    key={`marker-bottom-${i}`}
                    position={[f.renderX + offsetX, baseY + 0.008, f.renderY + offsetZ]}
                  >
                    <cylinderGeometry args={[FOOT_RADIUS_M * 1.6, FOOT_RADIUS_M * 1.6, 0.016, 20]} />
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
