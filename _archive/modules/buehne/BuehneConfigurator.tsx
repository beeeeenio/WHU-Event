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
import { StairsRampCalculator } from '../../components/shared/StairsRampCalculator';
import { SummaryStats } from '../../components/shared/SummaryStats';
import { View2D3DToggle, type ViewMode } from '../../components/shared/View2D3DToggle';
import { WarningBanner } from '../../components/shared/WarningBanner';
import {
  availableCatalogWidths,
  buildLayoutFromRows,
  currentRowDepthM,
  makePieceId,
  rowsFromLayout,
  suggestTriangleRows,
  type PieceRow,
} from '../../domain/customShape';
import { primaryPanel } from '../../domain/panels';
import type { RailingSide } from '../../domain/types';
import { useAufbauConfig } from '../../hooks/useAufbauConfig';
import { useDerivedGeometry } from '../../hooks/useDerivedGeometry';

const ROW_DEPTH_M = primaryPanel().d; // 1 m — Modulachse, volle Sondermaß-Palette

interface BuehneSavedState {
  widthM: number;
  depthM: number;
  heightCm: number;
  orientation: 'normal' | 'rotiert' | null;
  activeRailingSides: RailingSide[];
  rows: PieceRow[];
}

export function BuehneConfigurator() {
  const cfg = useAufbauConfig({ structureType: 'buehne', initialWidthM: 8, initialDepthM: 6 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<ViewMode>('2d');
  const [rows, setRows] = useState<PieceRow[]>(() => rowsFromLayout(cfg.layout));
  const [hasManualEdits, setHasManualEdits] = useState(false);

  // Solange nichts von Hand bearbeitet wurde, ist die Basisfläche live an Breite/Tiefe/Ausrichtung
  // gekoppelt (fühlt sich an wie ein normaler Schnellstart-Regler). Sobald manuell bearbeitet
  // wurde, überschreiben Regler-Änderungen die Arbeit nicht mehr automatisch — dafür gibt es den
  // expliziten "Basisfläche neu erzeugen"-Knopf weiter unten.
  useEffect(() => {
    if (!hasManualEdits) setRows(rowsFromLayout(cfg.layout));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.layout, hasManualEdits]);

  const effectiveLayout = useMemo(() => buildLayoutFromRows(rows), [rows]);
  const {
    totalFeet: effectiveTotalFeet,
    labeledFeet: effectiveFeet,
    materialList: effectiveMaterialList,
  } = useDerivedGeometry(effectiveLayout, 'buehne', cfg.heightCm, hasManualEdits ? [] : cfg.activeRailingSides);

  // Nicht blind 1 m annehmen: je nach Breite/Tiefe kann die Schnellstart-Fläche auch mit 2 m
  // (rotiert) oder einer Sondermaß-Tiefe (z.B. 0,5/1,5 m) tiefen Reihen empfohlen werden.
  const rowDepthM = currentRowDepthM(rows, cfg.layout, ROW_DEPTH_M);

  function regenerateBasisflaeche() {
    setRows(rowsFromLayout(cfg.layout));
    setHasManualEdits(false);
  }

  function addPieces(slots: { rowIndex: number; x: number; w: number }[]) {
    setRows((prev) => {
      const next = [...prev];
      for (const slot of slots) {
        while (next.length <= slot.rowIndex) next.push({ depthM: rowDepthM, pieces: [] });
        const row = next[slot.rowIndex];
        next[slot.rowIndex] = { ...row, pieces: [...row.pieces, { id: makePieceId(), x: slot.x, w: slot.w }] };
      }
      return next;
    });
    setHasManualEdits(true);
  }

  function removePiece(rowIndex: number, pieceId: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === rowIndex ? { ...row, pieces: row.pieces.filter((p) => p.id !== pieceId) } : row)),
    );
    setHasManualEdits(true);
  }

  function suggestTriangle() {
    const rowCount = Math.min(6, Math.max(2, Math.round(cfg.widthM / rowDepthM / 2)));
    setRows((prev) => [...prev, ...suggestTriangleRows(cfg.widthM, rowCount, rowDepthM)]);
    setHasManualEdits(true);
  }

  function applySavedState(data: BuehneSavedState) {
    cfg.setWidthM(data.widthM);
    cfg.setDepthM(data.depthM);
    cfg.setHeightCm(data.heightCm);
    cfg.setOrientation(data.orientation);
    const restoredRows = Array.isArray(data.rows)
      ? data.rows.filter((row): row is PieceRow => Array.isArray(row?.pieces) && typeof row?.depthM === 'number')
      : [];
    setRows(restoredRows);
    setHasManualEdits(true);
    const toEnable = data.activeRailingSides.filter((s) => !cfg.activeRailingSides.includes(s));
    const toDisable = cfg.activeRailingSides.filter((s) => !data.activeRailingSides.includes(s));
    [...toEnable, ...toDisable].forEach(cfg.toggleRailingSide);
  }

  const currentSavedState: BuehneSavedState = {
    widthM: cfg.widthM,
    depthM: cfg.depthM,
    heightCm: cfg.heightCm,
    orientation: cfg.orientation,
    activeRailingSides: cfg.activeRailingSides,
    rows,
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Basisfläche (Schnellstart)</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Breite/Tiefe erzeugen eine optimal gefüllte Rechteckfläche (inkl. Sondermaß-Optimierung und
          Ausrichtungs-Empfehlung). Alles, was über ein einfaches Rechteck hinausgeht, baust du weiter unten direkt
          per Drag & Drop — das ist der eigentliche, freie Weg, deine Bühne zu formen.
        </p>
        <DimensionSlider label="Breite" valueM={cfg.widthM} min={1} max={20} step={0.5} onChange={cfg.setWidthM} />
        <DimensionSlider label="Tiefe" valueM={cfg.depthM} min={1} max={20} step={0.5} onChange={cfg.setDepthM} />
        {hasManualEdits && (
          <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <p className="text-xs text-[var(--color-text-muted)] flex-1">
              Änderungen an Breite/Tiefe wirken sich nicht automatisch aus, solange unten manuell bearbeitet wurde —
              so geht keine Arbeit versehentlich verloren.
            </p>
            <button
              type="button"
              onClick={regenerateBasisflaeche}
              className="shrink-0 px-3 py-1.5 rounded-md text-sm border border-[var(--color-accent)] text-[var(--color-accent)]"
            >
              Basisfläche neu erzeugen
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Podest-Ausrichtung</h2>
        <OrientationCards comparison={cfg.layoutComparison} selected={cfg.orientation} onSelect={cfg.setOrientation} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Bühnenform per Drag & Drop</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Ziehe Stücke aus der Liste unten auf den Plan, um deine Bühne über die Basisfläche hinaus frei zu formen —
          Stück für Stück, genau da, wo du sie haben willst. Der Dreieck-Keil ist dabei kein echtes NivTec-Bauteil
          (echte Dreiecksplatten gibt es im System nicht, auch die Anleitung baut Diagonalen aus Rechtecken nach) —
          er ist ein vorgefertigter Satz aus normalen Systemplatten, der wie ein Dreieck zuläuft. Das Freizeichnen-
          Werkzeug funktioniert genauso: über den Plan ziehen, jede berührte Reihe wird automatisch mit echten
          Katalogstücken gefüllt. Positionen liegen auf einem 0,5-m-Raster: wo eine Kante genau auf einer
          bestehenden Nahtstelle landet, teilt sich der Fuß dort automatisch. 2D ist dabei immer die volle Wahrheit
          — die 3D-Ansicht und alle Exporte werden direkt daraus erzeugt. Sobald manuell bearbeitet wurde, ist die
          Geländer-Seitenauswahl deaktiviert, da die Kontur nicht mehr garantiert rechteckig ist.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={suggestTriangle}
            className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-accent)] text-[var(--color-accent)]"
          >
            Dreieck über volle Breite anfügen
          </button>
          <button
            type="button"
            onClick={() => {
              setRows([]);
              setHasManualEdits(true);
            }}
            className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
          >
            Zurücksetzen
          </button>
        </div>
        <PieceCanvasEditor
          canvasWidthM={cfg.widthM}
          rowDepthM={rowDepthM}
          rows={rows}
          availableWidths={availableCatalogWidths(rowDepthM)}
          onAddPieces={addPieces}
          onRemovePiece={removePiece}
          frontEdgeLabel="Bühnenvorderkante"
        />
        {rows.some((row) => row.pieces.length > 0) && (
          <ul className="space-y-1.5">
            {rows.flatMap((row, ri) =>
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
                    onClick={() => removePiece(ri, p.id)}
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
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Fußtyp & Höhe</h2>
        <HeightSelector heightOptionsCm={cfg.rules.heightOptionsCm} valueCm={cfg.heightCm} onChange={cfg.setHeightCm} />
        <p className="text-sm text-[var(--color-text-muted)]">
          Fußtyp: Alu-Lastenverteilerfuß (LV-Fuß) — fest, deckt die gesamte Höhenserie 20–200 cm ab.
        </p>
        {cfg.bracingRequired && (
          <WarningBanner>Ab 80 cm Aufbauhöhe ist eine Diagonalverstrebung erforderlich.</WarningBanner>
        )}
        {cfg.horizontalBracingRequired && (
          <WarningBanner>Über 140 cm Aufbauhöhe ist zusätzlich eine Horizontalverstrebung erforderlich.</WarningBanner>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Geländer</h2>
        {cfg.railingRequired && (
          <WarningBanner>Ab 100 cm Aufbauhöhe ist ein Geländer laut DGUV vorgeschrieben.</WarningBanner>
        )}
        <p className="text-sm text-[var(--color-text-muted)]">
          {hasManualEdits
            ? 'Nach manueller Bearbeitung nicht verfügbar (Kontur nicht mehr garantiert rechteckig).'
            : 'Seiten im Grundriss antippen, um Geländer ein-/auszuschalten.'}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Zugang</h2>
        <StairsRampCalculator heightCm={cfg.heightCm} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Kennzahlen</h2>
        <SummaryStats
          stats={[
            { label: 'Bühnengröße', value: `${effectiveLayout.widthM.toFixed(2)} × ${effectiveLayout.depthM.toFixed(2)} m` },
            { label: 'Fläche', value: `${effectiveLayout.areaM2.toFixed(2)} m²` },
            { label: 'Podeste', value: `${effectiveLayout.panels.length}`, hint: 'Systempodeste' },
            { label: 'Füße gesamt', value: `${effectiveTotalFeet}` },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {view === '2d' ? 'Grundrissplan' : '3D-Ansicht'}
          </h2>
          <View2D3DToggle view={view} onChange={setView} />
        </div>
        <FootColorLegend heights={[cfg.heightCm]} />
        <div className="relative">
          {view === '2d' && (
            <FloorPlanSVG
              layout={effectiveLayout}
              feet={effectiveFeet}
              heightCm={cfg.heightCm}
              railingSides={hasManualEdits ? [] : cfg.activeRailingSides}
              railingConfigurable={!hasManualEdits && cfg.rules.railingConfigurable}
              onToggleRailingSide={cfg.toggleRailingSide}
            />
          )}
          <div className={view === '3d' ? '' : 'invisible absolute inset-0 pointer-events-none'}>
            <AufbauScene3D
              tiers={[{ layout: effectiveLayout, feet: effectiveFeet, heightM: cfg.heightCm / 100 }]}
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
            materialList={effectiveMaterialList}
            canvasRef={canvasRef}
            filenamePrefix="buehne"
            pptx={{
              sections: [{ layout: effectiveLayout, feet: effectiveFeet, heightCm: cfg.heightCm, label: 'Bühne' }],
              title: 'Bühnenpodest',
            }}
          />
        </div>
        <MaterialListTable items={effectiveMaterialList} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Gespeicherte Konfigurationen</h2>
        <SavedConfigsPanel namespace="buehne" currentData={currentSavedState} onLoad={applySavedState} />
      </section>
    </div>
  );
}
