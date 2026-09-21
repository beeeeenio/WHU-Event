import type { RefObject } from 'react';
import type { MaterialListItem } from '../../domain/types';
import type { CiId } from '../../lib/ci';
import { materialListToCsv } from '../../lib/csv';
import { downloadTextFile } from '../../lib/download';
import { exportCanvasAsPng } from '../../lib/canvasExport';
import { exportLayoutAsPptx, exportSectionsAsPptx, type PptxSection } from '../../lib/pptxExport';

export interface PptxExportData {
  sections: PptxSection[];
  title: string;
  /** Aktive Initiative — deren Logo landet oben rechts auf der exportierten Folie. */
  ci: CiId;
}

interface Props {
  materialList: MaterialListItem[];
  /** 3D-Canvas — der PNG-Export erfasst immer die 3D-Ansicht, unabhängig davon, welche Ansicht gerade sichtbar ist. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  filenamePrefix: string;
  /** Wenn gesetzt, wird zusätzlich ein PowerPoint-Export-Button angezeigt (editierbare Formen). */
  pptx?: PptxExportData;
}

export function ExportButtons({ materialList, canvasRef, filenamePrefix, pptx }: Props) {
  function handleCsvExport() {
    const csv = materialListToCsv(materialList);
    downloadTextFile(`${filenamePrefix}-materialliste.csv`, csv, 'text/csv;charset=utf-8', true);
  }

  async function handlePngExport() {
    if (!canvasRef.current) return;
    await exportCanvasAsPng(canvasRef.current, `${filenamePrefix}-3d.png`);
  }

  async function handlePptxExport() {
    if (!pptx) return;
    if (pptx.sections.length === 1) {
      const s = pptx.sections[0];
      await exportLayoutAsPptx(s.layout, s.feet, s.heightCm, `${filenamePrefix}-grundriss.pptx`, pptx.ci, pptx.title);
    } else {
      await exportSectionsAsPptx(pptx.sections, `${filenamePrefix}-grundriss.pptx`, pptx.ci, pptx.title);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleCsvExport}
        className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
      >
        CSV Export
      </button>
      <button
        type="button"
        onClick={handlePngExport}
        className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
      >
        PNG Export (3D)
      </button>
      {pptx && (
        <button
          type="button"
          onClick={handlePptxExport}
          className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
        >
          PPTX Export
        </button>
      )}
    </div>
  );
}
