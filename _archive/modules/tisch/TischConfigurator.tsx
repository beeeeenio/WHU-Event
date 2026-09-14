import { useEffect, useMemo, useRef, useState } from 'react';
import { AufbauScene3D } from '../../components/shared/AufbauScene3D';
import { DimensionSlider } from '../../components/shared/DimensionSlider';
import { ExportButtons } from '../../components/shared/ExportButtons';
import { FloorPlanSVG } from '../../components/shared/FloorPlanSVG';
import { FootColorLegend } from '../../components/shared/FootColorLegend';
import { HeightSelector } from '../../components/shared/HeightSelector';
import { MaterialListTable } from '../../components/shared/MaterialListTable';
import { OrientationCards } from '../../components/shared/OrientationCards';
import { PieceCanvasEditor } from '../../components/shared/PieceCanvasEditor';
import { SavedConfigsPanel } from '../../components/shared/SavedConfigsPanel';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { View2D3DToggle, type ViewMode } from '../../components/shared/View2D3DToggle';
import {
  availableCatalogWidths,
  buildLayoutFromRows,
  currentRowDepthM,
  makePieceId,
  rowsFromLayout,
  suggestTriangleRows,
  type PieceRow,
} from '../../domain/customShape';
import { countFeet, footPositions, labeledFootPositions } from '../../domain/feet';
import { computeLayout } from '../../domain/layout';
import { buildMaterialList } from '../../domain/materialList';
import { mergeLShapeLayouts } from '../../domain/lshape';
import { primaryPanel } from '../../domain/panels';
import { STRUCTURE_RULES } from '../../domain/rules';
import { useAufbauConfig } from '../../hooks/useAufbauConfig';
import { useDerivedGeometry } from '../../hooks/useDerivedGeometry';

type Mode = 'gerade' | 'ecke';

const ROW_DEPTH_M = primaryPanel().d; // 1 m — Modulachse, volle Sondermaß-Palette

interface TischSavedState {
  mode: Mode;
  gerade: {
    widthM: number;
    depthM: number;
    heightCm: number;
    orientation: 'normal' | 'rotiert' | null;
    rows: PieceRow[];
  };
  ecke: { armALengthM: number; armBLengthM: number; heightCm: number };
}

export function TischConfigurator() {
  const [mode, setMode] = useState<Mode>('gerade');
  const [view, setView] = useState<ViewMode>('2d');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gerade = useAufbauConfig({ structureType: 'tisch', initialWidthM: 2, initialDepthM: 1 });
  const [geradeRows, setGeradeRows] = useState<PieceRow[]>(() => rowsFromLayout(gerade.layout));
  const [geradeHasManualEdits, setGeradeHasManualEdits] = useState(false);

  // Gleiches Muster wie bei der Bühne: solange nichts von Hand bearbeitet wurde, folgt die
  // Fläche live Breite/Tiefe/Ausrichtung; danach überschreiben Regler nichts mehr automatisch.
  useEffect(() => {
    if (!geradeHasManualEdits) setGeradeRows(rowsFromLayout(gerade.layout));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gerade.layout, geradeHasManualEdits]);

  const geradeEffectiveLayout = useMemo(() => buildLayoutFromRows(geradeRows), [geradeRows]);
  const {
    totalFeet: geradeTotalFeet,
    feet: geradeFeet,
    labeledFeet: geradeLabeledFeet,
    materialList: geradeMaterialList,
  } = useDerivedGeometry(geradeEffectiveLayout, 'tisch', gerade.heightCm, []); // Tisch: nie Geländer

  // Nicht blind 1 m annehmen: je nach Breite/Tiefe kann die Schnellstart-Fläche auch mit 2 m
  // (rotiert) oder einer Sondermaß-Tiefe tiefen Reihen empfohlen werden.
  const geradeRowDepthM = currentRowDepthM(geradeRows, gerade.layout, ROW_DEPTH_M);

  function geradeAddPieces(slots: { rowIndex: number; x: number; w: number }[]) {
    setGeradeRows((prev) => {
      const next = [...prev];
      for (const slot of slots) {
        while (next.length <= slot.rowIndex) next.push({ depthM: geradeRowDepthM, pieces: [] });
        const row = next[slot.rowIndex];
        next[slot.rowIndex] = { ...row, pieces: [...row.pieces, { id: makePieceId(), x: slot.x, w: slot.w }] };
      }
      return next;
    });
    setGeradeHasManualEdits(true);
  }

  function geradeRemovePiece(rowIndex: number, pieceId: string) {
    setGeradeRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, pieces: row.pieces.filter((p) => p.id !== pieceId) } : row)),
    );
    setGeradeHasManualEdits(true);
  }

  function geradeSuggestTriangle() {
    const rowCount = Math.min(6, Math.max(2, Math.round(gerade.widthM / geradeRowDepthM / 2)));
    setGeradeRows((prev) => [...prev, ...suggestTriangleRows(gerade.widthM, rowCount, geradeRowDepthM)]);
    setGeradeHasManualEdits(true);
  }

  function geradeRegenerateBasisflaeche() {
    setGeradeRows(rowsFromLayout(gerade.layout));
    setGeradeHasManualEdits(false);
  }

  const [armALengthM, setArmALengthM] = useState(3);
  const [armBLengthM, setArmBLengthM] = useState(2);
  const [eckeHeightCm, setEckeHeightCm] = useState(STRUCTURE_RULES.tisch.heightOptionsCm[0]);
  const armDepthM = primaryPanel().d;

  const eckeLayout = useMemo(() => {
    const armA = computeLayout(armALengthM, armDepthM).normal;
    const armB = computeLayout(armDepthM, armBLengthM).rotiert;
    return mergeLShapeLayouts(armA, armB, 0, armDepthM);
  }, [armALengthM, armBLengthM, armDepthM]);

  const eckeFeet = useMemo(() => footPositions(eckeLayout.panels), [eckeLayout]);
  const eckeLabeledFeet = useMemo(() => labeledFootPositions(eckeLayout.panels), [eckeLayout]);
  const eckeTotalFeet = useMemo(() => countFeet(eckeLayout.panels), [eckeLayout]);
  const eckeMaterialList = useMemo(
    () => buildMaterialList({ structureType: 'tisch', layout: eckeLayout, heightCm: eckeHeightCm, activeRailingSides: [] }),
    [eckeLayout, eckeHeightCm],
  );

  function applySavedState(data: TischSavedState) {
    setMode(data.mode);
    gerade.setWidthM(data.gerade.widthM);
    gerade.setDepthM(data.gerade.depthM);
    gerade.setHeightCm(data.gerade.heightCm);
    gerade.setOrientation(data.gerade.orientation);
    const restoredRows = Array.isArray(data.gerade.rows)
      ? data.gerade.rows.filter(
          (row): row is PieceRow => Array.isArray(row?.pieces) && typeof row?.depthM === 'number',
        )
      : [];
    setGeradeRows(restoredRows);
    setGeradeHasManualEdits(true);
    setArmALengthM(data.ecke.armALengthM);
    setArmBLengthM(data.ecke.armBLengthM);
    setEckeHeightCm(data.ecke.heightCm);
  }

  const currentSavedState: TischSavedState = {
    mode,
    gerade: {
      widthM: gerade.widthM,
      depthM: gerade.depthM,
      heightCm: gerade.heightCm,
      orientation: gerade.orientation,
      rows: geradeRows,
    },
    ecke: { armALengthM, armBLengthM, heightCm: eckeHeightCm },
  };

  const active =
    mode === 'gerade'
      ? {
          layout: geradeEffectiveLayout,
          feet: geradeFeet,
          labeledFeet: geradeLabeledFeet,
          totalFeet: geradeTotalFeet,
          heightCm: gerade.heightCm,
          materialList: geradeMaterialList,
          sizeLabel: `${geradeEffectiveLayout.widthM.toFixed(2)} × ${geradeEffectiveLayout.depthM.toFixed(2)} m`,
        }
      : {
          layout: eckeLayout,
          feet: eckeFeet,
          labeledFeet: eckeLabeledFeet,
          totalFeet: eckeTotalFeet,
          heightCm: eckeHeightCm,
          materialList: eckeMaterialList,
          sizeLabel: `L-Form ${armALengthM.toFixed(2)} × ${armBLengthM.toFixed(2)} m (Schenkel)`,
        };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Aufbauform</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('gerade')}
            className={`px-3 py-1.5 rounded-md text-sm border ${mode === 'gerade' ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'}`}
          >
            Gerade
          </button>
          <button
            type="button"
            onClick={() => setMode('ecke')}
            className={`px-3 py-1.5 rounded-md text-sm border ${mode === 'ecke' ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'}`}
          >
            Um die Ecke (90°)
          </button>
        </div>
      </section>

      {mode === 'gerade' ? (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Basisfläche (Schnellstart)</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Breite/Tiefe erzeugen eine optimal gefüllte Rechteckfläche. Alles, was über ein einfaches Rechteck
              hinausgeht, baust du weiter unten direkt per Drag & Drop.
            </p>
            <DimensionSlider label="Breite" valueM={gerade.widthM} min={0.5} max={12} step={0.5} onChange={gerade.setWidthM} />
            <DimensionSlider label="Tiefe" valueM={gerade.depthM} min={0.5} max={4} step={0.5} onChange={gerade.setDepthM} />
            {geradeHasManualEdits && (
              <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                <p className="text-xs text-[var(--color-text-muted)] flex-1">
                  Änderungen an Breite/Tiefe wirken sich nicht automatisch aus, solange unten manuell bearbeitet
                  wurde.
                </p>
                <button
                  type="button"
                  onClick={geradeRegenerateBasisflaeche}
                  className="shrink-0 px-3 py-1.5 rounded-md text-sm border border-[var(--color-accent)] text-[var(--color-accent)]"
                >
                  Basisfläche neu erzeugen
                </button>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Plattenausrichtung</h2>
            <OrientationCards comparison={gerade.layoutComparison} selected={gerade.orientation} onSelect={gerade.setOrientation} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Tischform per Drag & Drop</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Ziehe Stücke aus der Liste unten auf den Plan, um deinen Tisch über die Basisfläche hinaus frei zu
              formen — z.B. für eine ungewöhnliche Grundform. Positionen liegen auf einem 0,5-m-Raster.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={geradeSuggestTriangle}
                className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-accent)] text-[var(--color-accent)]"
              >
                Dreieck über volle Breite anfügen
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeradeRows([]);
                  setGeradeHasManualEdits(true);
                }}
                className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
              >
                Zurücksetzen
              </button>
            </div>
            <PieceCanvasEditor
              canvasWidthM={gerade.widthM}
              rowDepthM={geradeRowDepthM}
              rows={geradeRows}
              availableWidths={availableCatalogWidths(geradeRowDepthM)}
              onAddPieces={geradeAddPieces}
              onRemovePiece={geradeRemovePiece}
              frontEdgeLabel="Tischvorderkante"
            />
            {geradeRows.some((row) => row.pieces.length > 0) && (
              <ul className="space-y-1.5">
                {geradeRows.flatMap((row, ri) =>
                  row.pieces.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
                    >
                      <span className="text-[var(--color-text)]">
                        Reihe {ri + 1}: {p.w.toFixed(1).replace('.', ',')} m bei x={p.x.toFixed(1).replace('.', ',')} m
                      </span>
                      <button
                        type="button"
                        onClick={() => geradeRemovePiece(ri, p.id)}
                        className="px-2 py-0.5 rounded text-xs border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                      >
                        Entfernen
                      </button>
                    </li>
                  )),
                )}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Tischhöhe</h2>
            <HeightSelector heightOptionsCm={gerade.rules.heightOptionsCm} valueCm={gerade.heightCm} onChange={gerade.setHeightCm} />
            <p className="text-sm text-[var(--color-text-muted)]">74 cm = Sitztisch, 90 cm = Stehtisch.</p>
          </section>
        </>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Schenkellängen (90°-Ecke)</h2>
            <DimensionSlider label="Schenkel A (entlang Wand 1)" valueM={armALengthM} min={1} max={12} step={0.5} onChange={setArmALengthM} />
            <DimensionSlider label="Schenkel B (entlang Wand 2)" valueM={armBLengthM} min={1} max={12} step={0.5} onChange={setArmBLengthM} />
            <p className="text-xs text-[var(--color-text-muted)]">
              Tischtiefe fix bei {armDepthM.toFixed(2)} m (eine Reihe Systempodeste). Schenkel A verläuft entlang der
              Breite, Schenkel B schließt im 90°-Winkel an und verläuft in die Tiefe — der gemeinsame Eckfuß wird
              automatisch geteilt.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Tischhöhe</h2>
            <HeightSelector heightOptionsCm={STRUCTURE_RULES.tisch.heightOptionsCm} valueCm={eckeHeightCm} onChange={setEckeHeightCm} />
          </section>
        </>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Kennzahlen</h2>
        <SummaryStats
          stats={[
            { label: 'Tischgröße', value: active.sizeLabel },
            { label: 'Fläche', value: `${active.layout.areaM2.toFixed(2)} m²` },
            { label: 'Tischplatten', value: `${active.layout.panels.length}` },
            { label: 'Füße gesamt', value: `${active.totalFeet}` },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{view === '2d' ? 'Grundrissplan' : '3D-Ansicht'}</h2>
          <View2D3DToggle view={view} onChange={setView} />
        </div>
        <FootColorLegend heights={[active.heightCm]} />
        <div className="relative">
          {view === '2d' && (
            <FloorPlanSVG layout={active.layout} feet={active.labeledFeet} heightCm={active.heightCm} />
          )}
          <div className={view === '3d' ? '' : 'invisible absolute inset-0 pointer-events-none'}>
            <AufbauScene3D
              tiers={[{ layout: active.layout, feet: active.labeledFeet, heightM: active.heightCm / 100 }]}
              onCanvasReady={(c) => {
                canvasRef.current = c;
              }}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Detaillierte Materialliste</h2>
          <ExportButtons
            materialList={active.materialList}
            canvasRef={canvasRef}
            filenamePrefix="tisch"
            pptx={{
              sections: [{ layout: active.layout, feet: active.labeledFeet, heightCm: active.heightCm, label: 'Tisch' }],
              title: 'Tisch',
            }}
          />
        </div>
        <MaterialListTable items={active.materialList} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Gespeicherte Konfigurationen</h2>
        <SavedConfigsPanel namespace="tisch" currentData={currentSavedState} onLoad={applySavedState} />
      </section>
    </div>
  );
}
