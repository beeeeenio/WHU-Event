import { useMemo, useState } from 'react';
import { AufbauScene3D, PANEL_THICKNESS_M } from '../../components/shared/AufbauScene3D';
import { ExportButtons } from '../../components/shared/ExportButtons';
import { FloorPlanSVG } from '../../components/shared/FloorPlanSVG';
import { FootColorLegend } from '../../components/shared/FootColorLegend';
import { HeightSelector } from '../../components/shared/HeightSelector';
import { MaterialListTable } from '../../components/shared/MaterialListTable';
import { PieceCanvasEditor } from '../../components/shared/PieceCanvasEditor';
import { PlanFileBar } from '../../components/shared/PlanFileBar';
import { PlacedPiecesChips } from '../../components/shared/PlacedPiecesChips';
import { SavedConfigsPanel } from '../../components/shared/SavedConfigsPanel';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { WarningBanner } from '../../components/shared/WarningBanner';
import { boundingBoxOf, buildLayoutFromPieces, fillHorizontalSpan, makePieceId } from '../../domain/customShape';
import { buildMaterialList, mergeMaterialLists } from '../../domain/materialList';
import { isBracingRequired, STRUCTURE_RULES } from '../../domain/rules';
import { SPINDEL_HEIGHT_OPTIONS_CM } from '../../domain/tresen';
import { CATALOG_DEPTHS_M } from '../../domain/panels';
import { parseTresenFile } from '../../domain/savedState';
import { formatMeters } from '../../lib/format';
import { useDraftAutosave } from '../../hooks/useDraftAutosave';
import { useExportCanvas } from '../../hooks/useExportCanvas';
import { NO_RAILING_SIDES, useDerivedGeometry } from '../../hooks/useDerivedGeometry';
import { usePieceLayer } from '../../hooks/usePieceLayer';
import type { CiId } from '../../lib/ci';

// Kein Schnellstart-Regler: jede Ebene wächst ausschließlich mit dem, was tatsächlich
// gebaut wurde — Mindestbreite, damit ein leerer Plan nicht winzig wirkt, plus Puffer. Beide
// Werte fließen NUR in die gemeinsame Skala zwischen Unterbau und Thekenplatte ein (siehe
// sharedCanvasWidthM unten) — der Editor selbst bestimmt seine tatsächliche Standardgröße.
const MIN_CANVAS_WIDTH_M = 6;
const CANVAS_BUFFER_M = 2;


type ResultTab = 'kennzahlen' | 'grundriss' | '3d' | 'material';

export function TresenConfigurator({ ci }: { ci: CiId }) {
  const [baseHeightCm, setBaseHeightCm] = useState(STRUCTURE_RULES.tresen.heightOptionsCm[0]);
  const [spindelHeightCm, setSpindelHeightCm] = useState(SPINDEL_HEIGHT_OPTIONS_CM[1]);
  const [resultTab, setResultTab] = useState<ResultTab>('kennzahlen');
  const { onCanvasReady, getCanvas } = useExportCanvas(() => setResultTab('3d'));

  const base = usePieceLayer();
  const top = usePieceLayer();

  const baseLayout = useMemo(() => buildLayoutFromPieces(base.pieces), [base.pieces]);
  const topLayout = useMemo(() => buildLayoutFromPieces(top.pieces), [top.pieces]);

  // Enges Begrenzungsrechteck statt layout.widthM/depthM (die immer vom Ursprung aus messen) —
  // sonst zeigt der Referenz-Umriss der jeweils anderen Ebene eine Fläche, in der die echten
  // Platten gar nicht liegen, sobald diese nicht vorderkantenbündig gebaut wurde.
  const baseBoundingBox = useMemo(() => boundingBoxOf(baseLayout.panels), [baseLayout]);
  const topBoundingBox = useMemo(() => boundingBoxOf(topLayout.panels), [topLayout]);

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
  } = useDerivedGeometry(baseLayout, 'tresen', baseHeightCm, NO_RAILING_SIDES);
  const { totalFeet: topTotalFeet, labeledFeet: topLabeledFeet } = useDerivedGeometry(
    topLayout,
    'tresen',
    spindelHeightCm,
    NO_RAILING_SIDES,
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

  const hasContent = base.pieces.length > 0 || top.pieces.length > 0;

  // Setzt die Thekenplatte auf dieselbe Breite wie der aktuelle Unterbau, bei halber Tiefe —
  // ersetzt den bisherigen Inhalt der Ebene komplett (kein Zusammenführen), da das eine bewusste
  // Neuerzeugung ist, kein Hinzufügen. Zieltiefe wird aus CATALOG_DEPTHS_M ausgewählt: die größte
  // verfügbare Tiefe ≤ halbe Unterbau-Tiefe.
  //
  // Randnotiz zum früheren "kann die Thekenplatte nicht drehen"-Bug: Sondermaß-Platten dürfen laut
  // Bennis eigener Praxiserfahrung (siehe Korrektur in panels.ts) genau wie die Hauptplatte gedreht
  // verbaut werden — der eigentliche Fehler lag NICHT in der Rundung hier, sondern darin, dass die
  // so entstehenden, teils gedrehten Sondermaß-Stücke von isSondermassPiece/catalogSizeKey nicht
  // erkannt wurden (nur eine feste (w,d)-Reihenfolge geprüft) — dort behoben, nicht hier.
  function setThekeToHalfDepth() {
    // Echte Lage und Größe des Unterbaus (nicht vom Ursprung aus gemessen) — sonst landet die
    // Thekenplatte nach "Alles verschieben" des Unterbaus zu breit und am falschen Fleck.
    if (!baseBoundingBox) return;
    const EPS = 1e-6;
    const targetHalfDepth = baseBoundingBox.depthM / 2;
    const sortedDepths = [...CATALOG_DEPTHS_M].sort((a, b) => b - a);
    const targetDepthM = sortedDepths.find((d) => d <= targetHalfDepth + EPS) ?? 0.39;
    const filled = fillHorizontalSpan(baseBoundingBox.widthM, targetDepthM, baseBoundingBox.x, baseBoundingBox.y);
    top.replace(filled.map((p) => ({ ...p, id: makePieceId() })));
  }

  function applySavedState(data: unknown): string | null {
    const result = parseTresenFile(data);
    if (!result.ok) {
      return result.error;
    }
    if (result.value.baseHeightCm !== undefined) setBaseHeightCm(result.value.baseHeightCm);
    if (result.value.spindelHeightCm !== undefined) setSpindelHeightCm(result.value.spindelHeightCm);
    base.replace(result.value.basePieces);
    top.replace(result.value.topPieces);
    return null;
  }

  const currentSavedState = { baseHeightCm, spindelHeightCm, basePieces: base.pieces, topPieces: top.pieces };
  const { restored, discard } = useDraftAutosave('tresen', currentSavedState, applySavedState);

  // Beide Ebenen bilden vorne (y=0, siehe Vorderkanten-Beschriftung in PieceCanvasEditor) eine
  // bündige Kante — links-/vorderkantenbündig, kein Versatz zwischen den Ebenen.
  const offsetZ = 0;
  const topBaseY = baseHeightCm / 100 + PANEL_THICKNESS_M;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Aufbau</h2>
          <PlanFileBar namespace="tresen" currentData={currentSavedState} onLoad={applySavedState} />
        </div>
        {restored && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-accent)]">
            <span>Letzter Stand automatisch wiederhergestellt.</span>
            <button
              type="button"
              onClick={() => {
                discard();
                base.replace([]);
                top.replace([]);
                setBaseHeightCm(STRUCTURE_RULES.tresen.heightOptionsCm[0]);
                setSpindelHeightCm(SPINDEL_HEIGHT_OPTIONS_CM[1]);
              }}
              className="shrink-0 text-xs underline"
            >
              Verwerfen
            </button>
          </div>
        )}
        <p className="text-sm text-[var(--color-text-muted)]">
          Zweistöckige Konstruktion: unten ein normales Systempodest auf LV-Füßen, darauf Verstellspindelfüße,
          darauf eine zweite Podestplatte als Thekenabschluss. Kein Regler, keine vorgefertigte Fläche — beide
          Ebenen sind eigene, leere Pläne: ziehe Stücke direkt drauf.
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
          {...base.editorProps}
          frontEdgeLabel="Unterbau-Vorderkante"
          minCanvasWidthM={sharedCanvasWidthM}
          referenceFootprint={topBoundingBox ? { ...topBoundingBox, label: 'Thekenplatte' } : undefined}
        />
        <PlacedPiecesChips pieces={base.pieces} onRemovePiece={base.editorProps.onRemovePiece} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Thekenplatte per Drag & Drop</h2>
        <div className="space-y-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Spindelfuß-Ausgleich</span>
            {SPINDEL_HEIGHT_OPTIONS_CM.map((h) => {
              const active = spindelHeightCm === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setSpindelHeightCm(h)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    active
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
                  }`}
                >
                  {h} cm
                </button>
              );
            })}
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
          {...top.editorProps}
          frontEdgeLabel="Thekenplatten-Vorderkante"
          minCanvasWidthM={sharedCanvasWidthM}
          referenceFootprint={baseBoundingBox ? { ...baseBoundingBox, label: 'Unterbau' } : undefined}
        />
        <PlacedPiecesChips pieces={top.pieces} onRemovePiece={top.editorProps.onRemovePiece} />
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
              getCanvas={getCanvas}
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
                {
                  label: 'Unterbaugröße',
                  value: `${formatMeters(baseBoundingBox?.widthM ?? 0)} × ${formatMeters(baseBoundingBox?.depthM ?? 0)} m`,
                },
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
              onCanvasReady={onCanvasReady}
            />
          </div>

          {resultTab === 'material' && <MaterialListTable items={materialList} />}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Im Browser gespeichert</h2>
        <SavedConfigsPanel namespace="tresen" currentData={currentSavedState} onLoad={applySavedState} />
      </section>
    </div>
  );
}
