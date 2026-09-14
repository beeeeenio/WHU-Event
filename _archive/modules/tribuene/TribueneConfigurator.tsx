import { useMemo, useRef, useState } from 'react';
import { AufbauScene3D } from '../../components/shared/AufbauScene3D';
import { DimensionSlider } from '../../components/shared/DimensionSlider';
import { ExportButtons } from '../../components/shared/ExportButtons';
import { FootColorLegend } from '../../components/shared/FootColorLegend';
import { MaterialListTable } from '../../components/shared/MaterialListTable';
import { PieceCanvasEditor } from '../../components/shared/PieceCanvasEditor';
import { SavedConfigsPanel } from '../../components/shared/SavedConfigsPanel';
import { StairsRampCalculator } from '../../components/shared/StairsRampCalculator';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { View2D3DToggle, type ViewMode } from '../../components/shared/View2D3DToggle';
import { WarningBanner } from '../../components/shared/WarningBanner';
import {
  availableCatalogWidths,
  buildLayoutFromRows,
  makePieceId,
  rowsFromLayout,
  type PieceRow,
} from '../../domain/customShape';
import { countFeet, labeledFootPositions } from '../../domain/feet';
import { computeLayout } from '../../domain/layout';
import { buildMaterialList, mergeMaterialLists } from '../../domain/materialList';
import { isRailingRequired } from '../../domain/rules';
import type { LayoutResult } from '../../domain/types';
import { TribuneElevationSVG } from './TribuneElevationSVG';

const STEP_HEIGHT_OPTIONS_CM = [20, 40];
const ROW_DEPTH_OPTIONS_M = [1, 2];

interface TribueneSavedState {
  widthM: number;
  rowDepthM: number;
  rowCount: number;
  stepHeightCm: number;
  rowOverrides: Record<number, PieceRow[]>;
}

function isValidPieceRow(row: unknown): row is PieceRow {
  const r = row as PieceRow | null | undefined;
  return Array.isArray(r?.pieces) && typeof r?.depthM === 'number';
}

export function TribueneConfigurator() {
  const [widthM, setWidthM] = useState(6);
  const [rowDepthM, setRowDepthM] = useState(ROW_DEPTH_OPTIONS_M[0]);
  const [rowCount, setRowCount] = useState(4);
  const [stepHeightCm, setStepHeightCm] = useState(STEP_HEIGHT_OPTIONS_CM[0]);
  const [view, setView] = useState<ViewMode>('2d');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Standard-Schnellweg: alle Reihen identisch, aus Breite/Reihentiefe erzeugt (wie bisher).
  const layoutComparison = useMemo(() => computeLayout(widthM, rowDepthM), [widthM, rowDepthM]);
  const layout = layoutComparison[layoutComparison.recommended];

  // Opt-in: einzelne Reihen individuell per Drag & Drop anpassen, statt alle identisch zu lassen —
  // die Seitenansicht (Höhenprofil) bleibt unverändert die Standardansicht, das hier ist zusätzlich.
  const [customizeRows, setCustomizeRows] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [rowOverrides, setRowOverrides] = useState<Record<number, PieceRow[]>>({});

  const rows = useMemo(
    () => Array.from({ length: rowCount }, (_, i) => ({ index: i, heightCm: (i + 1) * stepHeightCm })),
    [rowCount, stepHeightCm],
  );

  const perRowLayouts = useMemo<LayoutResult[]>(
    () => rows.map((row) => (rowOverrides[row.index] ? buildLayoutFromRows(rowOverrides[row.index]) : layout)),
    [rows, rowOverrides, layout],
  );
  const perRowFeet = useMemo(() => perRowLayouts.map((l) => labeledFootPositions(l.panels)), [perRowLayouts]);
  const perRowFeetCounts = useMemo(() => perRowLayouts.map((l) => countFeet(l.panels)), [perRowLayouts]);

  const totalPodeste = perRowLayouts.reduce((sum, l) => sum + l.panels.length, 0);
  const totalFeetAll = perRowFeetCounts.reduce((sum, c) => sum + c, 0);

  const totalHeightCm = rowCount * stepHeightCm;
  const railingRequired = isRailingRequired('tribuene', totalHeightCm);

  // Gemerkt statt bei jedem Aufruf neu erzeugt: rowsFromLayout vergibt frische IDs pro Aufruf —
  // ohne Memoisierung würden ein angeklicktes Stück (aus dem Render) und die Basis, gegen die der
  // Handler filtert, nie dieselbe ID tragen, und "Entfernen" würde stillschweigend nichts tun.
  const defaultRowsForLayout = useMemo(() => rowsFromLayout(layout), [layout]);
  const selectedRows = rowOverrides[selectedRowIndex] ?? defaultRowsForLayout;

  function applySavedState(data: TribueneSavedState) {
    setWidthM(data.widthM);
    setRowDepthM(data.rowDepthM);
    setRowCount(data.rowCount);
    setStepHeightCm(data.stepHeightCm);
    const restored: Record<number, PieceRow[]> = {};
    if (data.rowOverrides && typeof data.rowOverrides === 'object') {
      for (const [key, value] of Object.entries(data.rowOverrides)) {
        if (Array.isArray(value) && value.every(isValidPieceRow)) restored[Number(key)] = value;
      }
    }
    setRowOverrides(restored);
    setCustomizeRows(Object.keys(restored).length > 0);
  }

  const currentSavedState: TribueneSavedState = { widthM, rowDepthM, rowCount, stepHeightCm, rowOverrides };

  const materialList = useMemo(() => {
    const lists = rows.map((row, i) =>
      buildMaterialList({
        structureType: 'tribuene',
        layout: perRowLayouts[i],
        heightCm: row.heightCm,
        activeRailingSides: railingRequired && row.index === rows.length - 1 ? ['hinten'] : [],
      }),
    );
    return mergeMaterialLists(lists);
  }, [rows, perRowLayouts, railingRequired]);

  function selectedRowAddPieces(slots: { rowIndex: number; x: number; w: number }[]) {
    setRowOverrides((prev) => {
      const base = prev[selectedRowIndex] ?? defaultRowsForLayout;
      const next = [...base];
      for (const slot of slots) {
        while (next.length <= slot.rowIndex) next.push({ depthM: rowDepthM, pieces: [] });
        const row = next[slot.rowIndex];
        next[slot.rowIndex] = { ...row, pieces: [...row.pieces, { id: makePieceId(), x: slot.x, w: slot.w }] };
      }
      return { ...prev, [selectedRowIndex]: next };
    });
  }

  function selectedRowRemovePiece(rowIndex: number, pieceId: string) {
    setRowOverrides((prev) => {
      const base = prev[selectedRowIndex] ?? defaultRowsForLayout;
      const next = base.map((row, i) =>
        i === rowIndex ? { ...row, pieces: row.pieces.filter((p) => p.id !== pieceId) } : row,
      );
      return { ...prev, [selectedRowIndex]: next };
    });
  }

  function resetSelectedRowOverride() {
    setRowOverrides((prev) => {
      const next = { ...prev };
      delete next[selectedRowIndex];
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Tribünenmaße</h2>
        <DimensionSlider label="Breite" valueM={widthM} min={2} max={20} step={0.5} onChange={setWidthM} />
        <div>
          <span className="text-sm font-medium text-[var(--color-text)] block mb-2">Reihentiefe</span>
          <div className="flex gap-2">
            {ROW_DEPTH_OPTIONS_M.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRowDepthM(d)}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  rowDepthM === d
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
                }`}
              >
                {d.toFixed(2)} m
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm font-medium text-[var(--color-text)]">Anzahl Reihen</span>
            <span className="text-sm text-[var(--color-text-muted)] tabular-nums">{rowCount}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={rowCount}
            onChange={(e) => setRowCount(Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>
        <div>
          <span className="text-sm font-medium text-[var(--color-text)] block mb-2">Stufenhöhe je Reihe</span>
          <div className="flex flex-wrap gap-2">
            {STEP_HEIGHT_OPTIONS_CM.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setStepHeightCm(h)}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  stepHeightCm === h
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
                }`}
              >
                {h} cm
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Vereinfachte Annahme: jede Reihe steht auf eigenen Füßen. In der Praxis können benachbarte Reihen sich
          teilweise Unterbauten teilen — hier bewusst nicht modelliert, um die Zahlen nachvollziehbar zu halten.
        </p>
      </section>

      {railingRequired && (
        <WarningBanner>
          Ab 100 cm Gesamthöhe ist ein Geländer an der hinteren Reihe laut DGUV vorgeschrieben.
        </WarningBanner>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Reihen einzeln anpassen (optional)</h2>
          <button
            type="button"
            onClick={() => setCustomizeRows((v) => !v)}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              customizeRows
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
            }`}
          >
            {customizeRows ? 'Aktiv' : 'Aktivieren'}
          </button>
        </div>
        {customizeRows && (
          <>
            <p className="text-xs text-[var(--color-text-muted)]">
              Standardmäßig sind alle Reihen identisch (Breite/Reihentiefe oben). Hier kannst du einzelne Reihen
              per Drag & Drop abweichend formen — z.B. eine schmalere Reihe oder eine Lücke. Reihen ohne eigene
              Anpassung bleiben beim Standard.
            </p>
            <div className="flex flex-wrap gap-2">
              {rows.map((row) => (
                <button
                  key={row.index}
                  type="button"
                  onClick={() => setSelectedRowIndex(row.index)}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    selectedRowIndex === row.index
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] border-[var(--color-accent)]'
                      : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'
                  }`}
                >
                  Reihe {row.index + 1}
                  {rowOverrides[row.index] ? ' •' : ''}
                </button>
              ))}
            </div>
            {rowOverrides[selectedRowIndex] && (
              <button
                type="button"
                onClick={resetSelectedRowOverride}
                className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
              >
                Reihe {selectedRowIndex + 1}: auf Standard zurücksetzen
              </button>
            )}
            <PieceCanvasEditor
              canvasWidthM={widthM}
              rowDepthM={rowDepthM}
              rows={selectedRows}
              availableWidths={availableCatalogWidths(rowDepthM)}
              onAddPieces={selectedRowAddPieces}
              onRemovePiece={selectedRowRemovePiece}
              frontEdgeLabel={`Reihe ${selectedRowIndex + 1} — Vorderkante`}
            />
            {selectedRows.some((row) => row.pieces.length > 0) && (
              <ul className="space-y-1.5">
                {selectedRows.flatMap((row, ri) =>
                  row.pieces.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
                    >
                      <span className="text-[var(--color-text)]">
                        Teilreihe {ri + 1}: {p.w.toFixed(1).replace('.', ',')} m bei x={p.x.toFixed(1).replace('.', ',')} m
                      </span>
                      <button
                        type="button"
                        onClick={() => selectedRowRemovePiece(ri, p.id)}
                        className="px-2 py-0.5 rounded text-xs border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                      >
                        Entfernen
                      </button>
                    </li>
                  )),
                )}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Zugang</h2>
        <StairsRampCalculator heightCm={totalHeightCm} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Kennzahlen</h2>
        <SummaryStats
          stats={[
            { label: 'Reihen', value: `${rowCount}`, hint: `${stepHeightCm} cm Stufenhöhe` },
            { label: 'Gesamthöhe', value: `${totalHeightCm} cm` },
            { label: 'Podeste gesamt', value: `${totalPodeste}` },
            { label: 'Füße gesamt', value: `${totalFeetAll}` },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">{view === '2d' ? 'Seitenansicht' : '3D-Ansicht'}</h2>
          <View2D3DToggle view={view} onChange={setView} />
        </div>
        <FootColorLegend heights={rows.map((row) => row.heightCm)} />
        <div className="relative">
          {view === '2d' && <TribuneElevationSVG rows={rows} rowDepthM={rowDepthM} />}
          <div className={view === '3d' ? '' : 'invisible absolute inset-0 pointer-events-none'}>
            <AufbauScene3D
              tiers={rows.map((row, i) => ({
                layout: perRowLayouts[i],
                feet: perRowFeet[i],
                heightM: row.heightCm / 100,
                offsetZ: row.index * rowDepthM,
              }))}
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
            materialList={materialList}
            canvasRef={canvasRef}
            filenamePrefix="tribuene"
            pptx={{
              sections: rows.map((row, i) => ({
                layout: perRowLayouts[i],
                feet: perRowFeet[i],
                heightCm: row.heightCm,
                label: `Reihe ${row.index + 1}`,
              })),
              title: 'Tribüne',
            }}
          />
        </div>
        <MaterialListTable items={materialList} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Gespeicherte Konfigurationen</h2>
        <SavedConfigsPanel namespace="tribuene" currentData={currentSavedState} onLoad={applySavedState} />
      </section>
    </div>
  );
}
