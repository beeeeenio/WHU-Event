import { useMemo, useRef, useState } from 'react';
import { AufbauScene3D, PANEL_THICKNESS_M } from '../../components/shared/AufbauScene3D';
import { ExportButtons } from '../../components/shared/ExportButtons';
import { FloorPlanSVG } from '../../components/shared/FloorPlanSVG';
import { FootColorLegend } from '../../components/shared/FootColorLegend';
import { HeightSelector } from '../../components/shared/HeightSelector';
import { MaterialListTable } from '../../components/shared/MaterialListTable';
import { PieceCanvasEditor } from '../../components/shared/PieceCanvasEditor';
import { PlacedPiecesChips } from '../../components/shared/PlacedPiecesChips';
import { SavedConfigsPanel } from '../../components/shared/SavedConfigsPanel';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { WarningBanner } from '../../components/shared/WarningBanner';
import {
  buildLayoutFromPieces,
  fillHorizontalSpan,
  makePieceId,
  rotatePieceInPlace,
  type FilledPiece,
  type Piece2D,
} from '../../domain/customShape';
import { buildMaterialList, mergeMaterialLists } from '../../domain/materialList';
import { isBracingRequired, STRUCTURE_RULES } from '../../domain/rules';
import type { TriangleCorner } from '../../domain/types';
import { useDerivedGeometry } from '../../hooks/useDerivedGeometry';
import type { CiId } from '../../lib/ci';

const SPINDEL_HEIGHT_OPTIONS_CM = [10, 20, 30, 40];

// Kein Schnellstart-Regler: jede Ebene wächst ausschließlich mit dem, was tatsächlich
// gebaut wurde — Mindestbreite, damit ein leerer Plan nicht winzig wirkt, plus Puffer. Beide
// Werte fließen NUR in die gemeinsame Skala zwischen Unterbau und Thekenplatte ein (siehe
// sharedCanvasWidthM unten) — der Editor selbst bestimmt seine tatsächliche Standardgröße.
const MIN_CANVAS_WIDTH_M = 6;
const CANVAS_BUFFER_M = 2;

interface TresenSavedState {
  baseHeightCm: number;
  spindelHeightCm: number;
  basePieces: Piece2D[];
  topPieces: Piece2D[];
}

const VALID_CORNERS: readonly TriangleCorner[] = ['tl', 'tr', 'bl', 'br'];

function isValidPiece2D(p: unknown): p is Piece2D {
  const v = p as Piece2D | null | undefined;
  return (
    typeof v?.id === 'string' &&
    typeof v?.x === 'number' &&
    typeof v?.y === 'number' &&
    typeof v?.w === 'number' &&
    typeof v?.d === 'number' &&
    (v?.corner === undefined || VALID_CORNERS.includes(v.corner))
  );
}

type ResultTab = 'kennzahlen' | 'grundriss' | '3d' | 'material';

export function TresenConfigurator({ ci }: { ci: CiId }) {
  const [baseHeightCm, setBaseHeightCm] = useState(STRUCTURE_RULES.tresen.heightOptionsCm[0]);
  const [spindelHeightCm, setSpindelHeightCm] = useState(SPINDEL_HEIGHT_OPTIONS_CM[1]);
  const [resultTab, setResultTab] = useState<ResultTab>('kennzahlen');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [basePieces, setBasePieces] = useState<Piece2D[]>([]);
  const [topPieces, setTopPieces] = useState<Piece2D[]>([]);

  const baseLayout = useMemo(() => buildLayoutFromPieces(basePieces), [basePieces]);
  const topLayout = useMemo(() => buildLayoutFromPieces(topPieces), [topPieces]);

  // Gemeinsame Skala: ohne das würde jeder Canvas unabhängig auf seinen eigenen Inhalt
  // skalieren — eine tatsächlich schmalere Thekenplatte sähe dann trotzdem gleich breit wie
  // der Unterbau aus. Beide Editoren bekommen dieselbe Mindestbreite, damit 1 m in beiden
  // gleich viele Pixel sind.
  const baseCanvasWidthM = Math.max(MIN_CANVAS_WIDTH_M, baseLayout.widthM + CANVAS_BUFFER_M);
  const topCanvasWidthM = Math.max(MIN_CANVAS_WIDTH_M, topLayout.widthM + CANVAS_BUFFER_M);
  const sharedCanvasWidthM = Math.max(baseCanvasWidthM, topCanvasWidthM);

  const {
    totalFeet: baseTotalFeet,
    labeledFeet: baseLabeledFeet,
    materialList: baseMaterialList,
  } = useDerivedGeometry(baseLayout, 'tresen', baseHeightCm, []);
  const { totalFeet: topTotalFeet, labeledFeet: topLabeledFeet } = useDerivedGeometry(
    topLayout,
    'tresen',
    spindelHeightCm,
    [],
  );

  // Thekenplatte: eigenes Materialliste-Listing mit Spindelfuß-Label statt LV-Fuß, ohne Aussteifung.
  const topMaterialList = useMemo(
    () =>
      buildMaterialList({
        structureType: 'tresen',
        layout: topLayout,
        heightCm: spindelHeightCm,
        activeRailingSides: [],
        footLabel: `Alu-Verstellspindelfuß (VS-Fuß), Ausgleich ${spindelHeightCm} cm`,
        includeBracing: false,
      }),
    [topLayout, spindelHeightCm],
  );

  const bracingRequired = isBracingRequired('tresen', baseHeightCm);
  const totalHeightCm = Math.round(baseHeightCm + PANEL_THICKNESS_M * 100 + spindelHeightCm + PANEL_THICKNESS_M * 100);

  const materialList = useMemo(
    () => mergeMaterialLists([baseMaterialList, topMaterialList]),
    [baseMaterialList, topMaterialList],
  );

  const hasContent = basePieces.length > 0 || topPieces.length > 0;

  function baseAddPieces(newPieces: FilledPiece[]) {
    setBasePieces((prev) => [...prev, ...newPieces.map((p) => ({ ...p, id: makePieceId() }))]);
  }
  function baseRemovePiece(id: string) {
    setBasePieces((prev) => prev.filter((p) => p.id !== id));
  }
  function baseMovePiece(id: string, x: number, y: number) {
    setBasePieces((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }
  function baseRotatePiece(id: string) {
    setBasePieces((prev) => prev.map((p) => (p.id === id ? rotatePieceInPlace(p) : p)));
  }

  function topAddPieces(newPieces: FilledPiece[]) {
    setTopPieces((prev) => [...prev, ...newPieces.map((p) => ({ ...p, id: makePieceId() }))]);
  }
  function topRemovePiece(id: string) {
    setTopPieces((prev) => prev.filter((p) => p.id !== id));
  }
  function topMovePiece(id: string, x: number, y: number) {
    setTopPieces((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }
  function topRotatePiece(id: string) {
    setTopPieces((prev) => prev.map((p) => (p.id === id ? rotatePieceInPlace(p) : p)));
  }

  // Setzt die Thekenplatte auf dieselbe Breite wie der aktuelle Unterbau, bei halber Tiefe —
  // ersetzt den bisherigen Inhalt der Ebene komplett (kein Zusammenführen), da das eine bewusste
  // Neuerzeugung ist, kein Hinzufügen. Zieltiefe wird aufs 0,5-m-Raster gerundet (Minimum 0,5 m).
  //
  // Randnotiz zum früheren "kann die Thekenplatte nicht drehen"-Bug: Sondermaß-Platten dürfen laut
  // Bennis eigener Praxiserfahrung (siehe Korrektur in panels.ts) genau wie die Hauptplatte gedreht
  // verbaut werden — der eigentliche Fehler lag NICHT in der 0,5-m-Rundung hier (die war schon
  // immer korrekt), sondern darin, dass die so entstehenden, teils gedrehten Sondermaß-Stücke von
  // isSondermassPiece/catalogSizeKey nicht erkannt wurden (nur eine feste (w,d)-Reihenfolge
  // geprüft) — dort behoben, nicht hier.
  function setThekeToHalfDepth() {
    if (baseLayout.widthM <= 0 || baseLayout.depthM <= 0) return;
    const targetDepthM = Math.max(0.5, Math.round(baseLayout.depthM / 2 / 0.5) * 0.5);
    const filled = fillHorizontalSpan(baseLayout.widthM, targetDepthM, 0, 0);
    setTopPieces(filled.map((p) => ({ ...p, id: makePieceId() })));
  }

  function applySavedState(data: TresenSavedState) {
    setBaseHeightCm(data.baseHeightCm);
    setSpindelHeightCm(data.spindelHeightCm);
    setBasePieces(Array.isArray(data.basePieces) ? data.basePieces.filter(isValidPiece2D) : []);
    setTopPieces(Array.isArray(data.topPieces) ? data.topPieces.filter(isValidPiece2D) : []);
  }

  const currentSavedState: TresenSavedState = { baseHeightCm, spindelHeightCm, basePieces, topPieces };

  // Beide Ebenen bilden vorne (y=0, siehe Vorderkanten-Beschriftung in PieceCanvasEditor) eine
  // bündige Kante — links-/vorderkantenbündig, kein Versatz zwischen den Ebenen.
  const offsetZ = 0;
  const topBaseY = baseHeightCm / 100 + PANEL_THICKNESS_M;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Aufbau</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Zweistöckige Konstruktion: unten ein normales Systempodest auf LV-Füßen, darauf Verstellspindelfüße,
          darauf eine zweite Podestplatte als Thekenabschluss. Kein Regler, keine vorgefertigte Fläche — beide
          Ebenen sind eigene, leere Pläne: ziehe Stücke, den Dreieck-Keil oder das Freizeichnen-Werkzeug direkt
          drauf.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Unterbau per Drag & Drop</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Höhe</span>
          <HeightSelector heightOptionsCm={STRUCTURE_RULES.tresen.heightOptionsCm} valueCm={baseHeightCm} onChange={setBaseHeightCm} />
        </div>
        {bracingRequired && <WarningBanner>Ab 80 cm Unterbauhöhe ist eine Diagonalverstrebung erforderlich.</WarningBanner>}
        <PieceCanvasEditor
          pieces={basePieces}
          onAddPieces={baseAddPieces}
          onRemovePiece={baseRemovePiece}
          onMovePiece={baseMovePiece}
          onRotatePiece={baseRotatePiece}
          frontEdgeLabel="Unterbau-Vorderkante"
          minCanvasWidthM={sharedCanvasWidthM}
          referenceFootprint={
            topLayout.widthM > 0 ? { widthM: topLayout.widthM, depthM: topLayout.depthM, label: 'Thekenplatte' } : undefined
          }
        />
        <PlacedPiecesChips pieces={basePieces} onRemovePiece={baseRemovePiece} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Thekenplatte per Drag & Drop</h2>
        <div className="space-y-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Spindelfuß-Ausgleich</span>
            {SPINDEL_HEIGHT_OPTIONS_CM.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setSpindelHeightCm(h)}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  spindelHeightCm === h
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
                }`}
              >
                {h} cm
              </button>
            ))}
            <button
              type="button"
              onClick={setThekeToHalfDepth}
              disabled={baseLayout.widthM <= 0}
              title="Ersetzt die Thekenplatte durch eine vorne bündige Fläche in Unterbau-Breite, bei halber Unterbau-Tiefe"
              className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-accent)] text-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
            >
              Breite übernehmen, Tiefe halbieren
            </button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Praxis-Tipp: Die Thekenplatte ist meist genauso <strong>breit</strong> wie der Unterbau, aber nur halb so
            <strong> tief</strong> — beide Vorderkanten liegen auf einer Linie. Der gestrichelte Umriss im Plan unten
            zeigt den aktuellen Unterbau zum Vergleich.
          </p>
        </div>
        <PieceCanvasEditor
          pieces={topPieces}
          onAddPieces={topAddPieces}
          onRemovePiece={topRemovePiece}
          onMovePiece={topMovePiece}
          onRotatePiece={topRotatePiece}
          frontEdgeLabel="Thekenplatten-Vorderkante"
          minCanvasWidthM={sharedCanvasWidthM}
          referenceFootprint={
            baseLayout.widthM > 0 ? { widthM: baseLayout.widthM, depthM: baseLayout.depthM, label: 'Unterbau' } : undefined
          }
        />
        <PlacedPiecesChips pieces={topPieces} onRemovePiece={topRemovePiece} />
      </section>

      {hasContent && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex rounded-md border border-[var(--color-panel-stroke)] overflow-hidden">
              {(
                [
                  ['kennzahlen', 'Kennzahlen'],
                  ['grundriss', 'Grundrissplan'],
                  ['3d', '3D-Ansicht'],
                  ['material', 'Materialliste'],
                ] as const
              ).map(([tab, label], idx) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setResultTab(tab)}
                  className={`px-3 py-1.5 text-sm ${idx > 0 ? 'border-l border-[var(--color-panel-stroke)]' : ''} ${
                    resultTab === tab
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-panel-fill)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ExportButtons
              materialList={materialList}
              canvasRef={canvasRef}
              filenamePrefix="tresen"
              pptx={{
                sections: [
                  { layout: baseLayout, feet: baseLabeledFeet, heightCm: baseHeightCm, label: 'Unterbau' },
                  { layout: topLayout, feet: topLabeledFeet, heightCm: spindelHeightCm, label: 'Thekenplatte (oben)' },
                ],
                title: 'Tresen',
                ci,
              }}
            />
          </div>

          {resultTab === 'kennzahlen' && (
            <SummaryStats
              stats={[
                { label: 'Unterbaugröße', value: `${baseLayout.widthM.toFixed(2)} × ${baseLayout.depthM.toFixed(2)} m` },
                { label: 'Gesamthöhe (ca.)', value: `${totalHeightCm} cm` },
                { label: 'Podeste gesamt', value: `${baseLayout.panels.length + topLayout.panels.length}` },
                { label: 'Füße gesamt', value: `${baseTotalFeet + topTotalFeet}` },
              ]}
            />
          )}

          {(resultTab === 'grundriss' || resultTab === '3d') && <FootColorLegend heights={[baseHeightCm, spindelHeightCm]} />}

          {resultTab === 'grundriss' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Unterbau</p>
                <FloorPlanSVG
                  layout={baseLayout}
                  feet={baseLabeledFeet}
                  heightCm={baseHeightCm}
                  minWidthM={Math.max(baseLayout.widthM, topLayout.widthM)}
                />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Thekenplatte (oben)</p>
                <FloorPlanSVG
                  layout={topLayout}
                  feet={topLabeledFeet}
                  heightCm={spindelHeightCm}
                  minWidthM={Math.max(baseLayout.widthM, topLayout.widthM)}
                />
              </div>
            </div>
          )}

          {/* AufbauScene3D bleibt unabhängig vom aktiven Tab immer gemountet — der PNG-Export
              braucht die live WebGL-Canvas-Referenz, die beim Unmounten verloren ginge. */}
          <div className={resultTab === '3d' ? '' : 'hidden'}>
            <AufbauScene3D
              tiers={[
                { layout: baseLayout, feet: baseLabeledFeet, heightM: baseHeightCm / 100, panelColor: '#2c3e6b' },
                {
                  layout: topLayout,
                  feet: topLabeledFeet,
                  heightM: spindelHeightCm / 100,
                  baseY: topBaseY,
                  offsetZ,
                  panelColor: '#c08a00',
                },
              ]}
              onCanvasReady={(c) => {
                canvasRef.current = c;
              }}
            />
          </div>

          {resultTab === 'material' && <MaterialListTable items={materialList} />}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Gespeicherte Konfigurationen</h2>
        <SavedConfigsPanel namespace="tresen" currentData={currentSavedState} onLoad={applySavedState} />
      </section>
    </div>
  );
}
