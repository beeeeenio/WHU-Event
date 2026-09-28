import { useMemo, useState } from 'react';
import { AufbauScene3D } from '../../components/shared/AufbauScene3D';
import { ExportButtons } from '../../components/shared/ExportButtons';
import { FloorPlanSVG } from '../../components/shared/FloorPlanSVG';
import { FootColorLegend } from '../../components/shared/FootColorLegend';
import { HeightSelector } from '../../components/shared/HeightSelector';
import { MaterialListTable } from '../../components/shared/MaterialListTable';
import { PieceCanvasEditor } from '../../components/shared/PieceCanvasEditor';
import { PlanFileBar } from '../../components/shared/PlanFileBar';
import { PlacedPiecesChips } from '../../components/shared/PlacedPiecesChips';
import { SavedConfigsPanel } from '../../components/shared/SavedConfigsPanel';
import { StairsRampCalculator } from '../../components/shared/StairsRampCalculator';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { buildLayoutFromPieces, normalizeToOrigin } from '../../domain/customShape';
import { STRUCTURE_RULES } from '../../domain/rules';
import { parseKastenbuehneFile } from '../../domain/savedState';
import { formatMeters } from '../../lib/format';
import { useDraftAutosave } from '../../hooks/useDraftAutosave';
import { useExportCanvas } from '../../hooks/useExportCanvas';
import { NO_RAILING_SIDES, useDerivedGeometry } from '../../hooks/useDerivedGeometry';
import { usePieceLayer } from '../../hooks/usePieceLayer';
import type { CiId } from '../../lib/ci';

type ResultTab = 'kennzahlen' | 'grundriss' | '3d' | 'material';

export function KastenbuehneConfigurator({ ci }: { ci: CiId }) {
  const [heightCm, setHeightCm] = useState(STRUCTURE_RULES.buehne.heightOptionsCm[0]);
  const [resultTab, setResultTab] = useState<ResultTab>('kennzahlen');
  const { onCanvasReady, getCanvas } = useExportCanvas(() => setResultTab('3d'));

  const layer = usePieceLayer();

  // Alles Abgeleitete (Kennzahlen, Grundriss, 3D, PPTX, Materialliste) sieht die Bühne an (0,0) —
  // wo sie auf der Zeichenfläche liegt ("Alles verschieben"), soll dort nichts verändern. Der
  // Editor selbst bekommt weiter die echten Positionen.
  const layout = useMemo(() => buildLayoutFromPieces(normalizeToOrigin(layer.pieces)), [layer.pieces]);

  // Kastenbühne ist regeltechnisch eine ganz normale Bühne (gleiche Höhenserie,
  // Verstrebungs-/Geländerschwellen) — nur der Bauweg dahin ist ein anderer.
  const { totalFeet, labeledFeet, materialList } = useDerivedGeometry(layout, 'buehne', heightCm, NO_RAILING_SIDES);

  const hasContent = layer.pieces.length > 0;

  function applySavedState(data: unknown): string | null {
    const result = parseKastenbuehneFile(data);
    if (!result.ok) {
      return result.error;
    }
    if (result.value.heightCm !== undefined) setHeightCm(result.value.heightCm);
    layer.replace(result.value.pieces);
    return null;
  }

  const currentSavedState = { heightCm, pieces: layer.pieces };
  const { restored, discard } = useDraftAutosave('kastenbuehne', currentSavedState, applySavedState);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Kastenbühne</h2>
          <PlanFileBar namespace="kastenbuehne" currentData={currentSavedState} onLoad={applySavedState} />
        </div>
        {restored && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-accent)]">
            <span>Letzter Stand automatisch wiederhergestellt.</span>
            <button
              type="button"
              onClick={() => {
                discard();
                layer.replace([]);
                setHeightCm(STRUCTURE_RULES.buehne.heightOptionsCm[0]);
              }}
              className="shrink-0 text-xs underline"
            >
              Verwerfen
            </button>
          </div>
        )}
        <p className="text-sm text-[var(--color-text-muted)]">
          Kein Regler, keine vorgefertigte Fläche — ziehe Stücke direkt auf einen leeren Plan. Alles entsteht
          ausschließlich durch das, was du selbst platzierst.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Aufbau per Drag & Drop</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Höhe</span>
          <HeightSelector heightOptionsCm={STRUCTURE_RULES.buehne.heightOptionsCm} valueCm={heightCm} onChange={setHeightCm} />
          <span className="text-xs text-[var(--color-text-muted)]">
            Fußtyp: Alu-Lastenverteilerfuß (LV-Fuß), Höhenserie 20–200 cm
          </span>
        </div>
        <PieceCanvasEditor
          {...layer.editorProps}
          frontEdgeLabel="Vorderkante"
        />
        <PlacedPiecesChips pieces={layer.pieces} onRemovePiece={layer.editorProps.onRemovePiece} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Geländer</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Bei frei zusammengestellten Formen nicht seitenweise konfigurierbar (Kontur nicht garantiert rechteckig).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Zugang</h2>
        <StairsRampCalculator heightCm={heightCm} />
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
              filenamePrefix="kastenbuehne"
              pptx={{
                sections: [{ layout, feet: labeledFeet, heightCm, label: 'Kastenbühne' }],
                title: 'Kastenbühne',
                ci,
              }}
            />
          </div>

          {resultTab === 'kennzahlen' && (
            <SummaryStats
              stats={[
                { label: 'Baugröße', value: `${formatMeters(layout.widthM)} × ${formatMeters(layout.depthM)} m` },
                { label: 'Fläche', value: `${formatMeters(layout.areaM2)} m²` },
                { label: 'Podeste', value: `${layout.panels.length}`, hint: 'Systempodeste' },
                { label: 'Füße gesamt', value: `${totalFeet}` },
              ]}
            />
          )}

          {(resultTab === 'grundriss' || resultTab === '3d') && <FootColorLegend heights={[heightCm]} />}
          {resultTab === 'grundriss' && <FloorPlanSVG layout={layout} feet={labeledFeet} heightCm={heightCm} />}
          {/* AufbauScene3D bleibt unabhängig vom aktiven Tab immer gemountet — der PNG-Export
              braucht die live WebGL-Canvas-Referenz, die beim Unmounten verloren ginge. */}
          <div className={resultTab === '3d' ? '' : 'hidden'}>
            <AufbauScene3D
              tiers={[{ layout, feet: labeledFeet, heightM: heightCm / 100 }]}
              onCanvasReady={onCanvasReady}
            />
          </div>

          {resultTab === 'material' && <MaterialListTable items={materialList} />}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Im Browser gespeichert</h2>
        <SavedConfigsPanel namespace="kastenbuehne" currentData={currentSavedState} onLoad={applySavedState} />
      </section>
    </div>
  );
}
