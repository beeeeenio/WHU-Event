import { useMemo, useRef, useState } from 'react';
import { AufbauScene3D } from '../../components/shared/AufbauScene3D';
import { ExportButtons } from '../../components/shared/ExportButtons';
import { FloorPlanSVG } from '../../components/shared/FloorPlanSVG';
import { FootColorLegend } from '../../components/shared/FootColorLegend';
import { HeightSelector } from '../../components/shared/HeightSelector';
import { MaterialListTable } from '../../components/shared/MaterialListTable';
import { PieceCanvasEditor } from '../../components/shared/PieceCanvasEditor';
import { PlacedPiecesChips } from '../../components/shared/PlacedPiecesChips';
import { SavedConfigsPanel } from '../../components/shared/SavedConfigsPanel';
import { StairsRampCalculator } from '../../components/shared/StairsRampCalculator';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { WarningBanner } from '../../components/shared/WarningBanner';
import { buildLayoutFromPieces, makePieceId, rotatePieceInPlace, type FilledPiece, type Piece2D } from '../../domain/customShape';
import { isRailingRequired, STRUCTURE_RULES } from '../../domain/rules';
import type { TriangleCorner } from '../../domain/types';
import { useDerivedGeometry } from '../../hooks/useDerivedGeometry';
import type { CiId } from '../../lib/ci';

interface KastenbuehneSavedState {
  heightCm: number;
  pieces: Piece2D[];
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

export function KastenbuehneConfigurator({ ci }: { ci: CiId }) {
  const [pieces, setPieces] = useState<Piece2D[]>([]);
  const [heightCm, setHeightCm] = useState(STRUCTURE_RULES.buehne.heightOptionsCm[0]);
  const [resultTab, setResultTab] = useState<ResultTab>('kennzahlen');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const layout = useMemo(() => buildLayoutFromPieces(pieces), [pieces]);

  // Kastenbühne ist regeltechnisch eine ganz normale Bühne (gleiche Höhenserie,
  // Verstrebungs-/Geländerschwellen) — nur der Bauweg dahin ist ein anderer.
  const { totalFeet, labeledFeet, materialList } = useDerivedGeometry(layout, 'buehne', heightCm, []);
  const railingRequired = isRailingRequired('buehne', heightCm);

  const hasContent = pieces.length > 0;

  function addPieces(newPieces: FilledPiece[]) {
    setPieces((prev) => [...prev, ...newPieces.map((p) => ({ ...p, id: makePieceId() }))]);
  }

  function removePiece(id: string) {
    setPieces((prev) => prev.filter((p) => p.id !== id));
  }

  function movePiece(id: string, x: number, y: number) {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }

  function rotatePiece(id: string) {
    setPieces((prev) => prev.map((p) => (p.id === id ? rotatePieceInPlace(p) : p)));
  }

  function applySavedState(data: KastenbuehneSavedState) {
    // Etwas strengere Prüfung als nur "ist eine Zahl" — beim Datei-Import (im Unterschied zum
    // bisherigen localStorage-Laden) kann die Datei von außerhalb des Tools kommen.
    if (STRUCTURE_RULES.buehne.heightOptionsCm.includes(data.heightCm)) setHeightCm(data.heightCm);
    setPieces(Array.isArray(data.pieces) ? data.pieces.filter(isValidPiece2D) : []);
  }

  const currentSavedState: KastenbuehneSavedState = { heightCm, pieces };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Kastenbühne</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Kein Regler, keine vorgefertigte Fläche — ziehe Stücke, den Dreieck-Keil oder das Freizeichnen-Werkzeug
          direkt auf einen leeren Plan. Alles entsteht ausschließlich durch das, was du selbst platzierst.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Aufbau per Drag & Drop</h2>
          {hasContent && (
            <button
              type="button"
              onClick={() => setPieces([])}
              className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
            >
              Zurücksetzen
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Höhe</span>
          <HeightSelector heightOptionsCm={STRUCTURE_RULES.buehne.heightOptionsCm} valueCm={heightCm} onChange={setHeightCm} />
          <span className="text-xs text-[var(--color-text-muted)]">
            Fußtyp: Alu-Lastenverteilerfuß (LV-Fuß), Höhenserie 20–200 cm
          </span>
        </div>
        <PieceCanvasEditor
          pieces={pieces}
          onAddPieces={addPieces}
          onRemovePiece={removePiece}
          onMovePiece={movePiece}
          onRotatePiece={rotatePiece}
          frontEdgeLabel="Vorderkante"
        />
        <PlacedPiecesChips pieces={pieces} onRemovePiece={removePiece} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Geländer</h2>
        {railingRequired && (
          <WarningBanner>Ab 100 cm Aufbauhöhe ist ein Geländer laut DGUV vorgeschrieben.</WarningBanner>
        )}
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
              canvasRef={canvasRef}
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
                { label: 'Baugröße', value: `${layout.widthM.toFixed(2)} × ${layout.depthM.toFixed(2)} m` },
                { label: 'Fläche', value: `${layout.areaM2.toFixed(2)} m²` },
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
        <SavedConfigsPanel namespace="kastenbuehne" currentData={currentSavedState} onLoad={applySavedState} />
      </section>
    </div>
  );
}
