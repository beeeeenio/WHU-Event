import type { LayoutResult, PanelInstance } from './types';
import { countFeet } from './feet';
import { primaryPanel, sizeKey, sondermassSubstituteWidths } from './panels';

const EPS = 1e-6;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function buildLayout(widthM: number, depthM: number, orientation: 'normal' | 'rotiert'): LayoutResult {
  if (widthM <= 0 || depthM <= 0) {
    return {
      orientation,
      widthM,
      depthM,
      areaM2: 0,
      cols: 0,
      rows: 0,
      panels: [],
      panelCountsBySize: {},
      hasSondermass: false,
    };
  }

  const primary = primaryPanel();
  // "Normal" = lange Seite (2 m) entlang der Breite, "Rotiert" = lange Seite entlang der Tiefe.
  // Die lange Seite trägt das "Modulraster" (2 m, mit Sondermaß-Substitut bei Rest);
  // die kurze Seite (1 m) hat laut Anleitung KEINE Sondermaß-Anpassung.
  const colWidth = orientation === 'normal' ? primary.w : primary.d;
  const rowDepth = orientation === 'normal' ? primary.d : primary.w;
  const moduleAxisIsColumns = orientation === 'normal';

  const cols = Math.floor(widthM / colWidth + EPS);
  const colRemainder = round3(widthM - cols * colWidth);
  const rows = Math.floor(depthM / rowDepth + EPS);
  const rowRemainder = round3(depthM - rows * rowDepth);

  const panels: PanelInstance[] = [];
  const panelCountsBySize: Record<string, number> = {};
  const addPanel = (x: number, y: number, w: number, d: number, isSondermass: boolean) => {
    const key = sizeKey(w, d);
    panels.push({ x: round3(x), y: round3(y), w, d, sizeKey: key, isSondermass });
    panelCountsBySize[key] = (panelCountsBySize[key] ?? 0) + 1;
  };

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      addPanel(i * colWidth, j * rowDepth, colWidth, rowDepth, false);
    }
  }

  const warnings: string[] = [];
  const mainWidth = cols * colWidth;
  const mainDepth = rows * rowDepth;
  // Welche Substitutbreiten infrage kommen, hängt von der BAUTIEFE ab, die die Ersatzplatte
  // erhalten soll (gleiche Bautiefe wie die Achse, die sie NICHT verkürzt) — nicht von der
  // Orientierung allein. Die 1-m-Modulachse hat drei Substitute (1,5/1/0,5); die feste 2-m-Achse
  // hat genau eines (0,5) — das war vorher komplett unberücksichtigt (siehe 0,5×2-Katalogfix).
  const matchSubstitute = (remainder: number, depthM: number) =>
    sondermassSubstituteWidths(depthM).find((w) => Math.abs(w - remainder) < EPS);

  if (moduleAxisIsColumns) {
    // Modulachse = Breite (Spalten): Restbreite per Sondermaß-Platte gleicher Bautiefe (rowDepth) füllen.
    if (colRemainder > EPS) {
      const match = matchSubstitute(colRemainder, rowDepth);
      if (match !== undefined) {
        for (let j = 0; j < rows; j++) addPanel(mainWidth, j * rowDepth, colRemainder, rowDepth, true);
      } else {
        warnings.push(
          `Restbreite von ${colRemainder.toFixed(2)} m entspricht keiner NivTec-Sondermaß-Platte für ${rowDepth.toFixed(2)} m Bautiefe (verfügbar: ${sondermassSubstituteWidths(rowDepth).map((w) => w.toFixed(2)).join(', ') || 'keine'} m) – bitte Breite anpassen.`,
        );
      }
    }
    if (rowRemainder > EPS) {
      warnings.push(
        `Resttiefe von ${rowRemainder.toFixed(2)} m: die Tiefe muss laut NivTec-Anleitung ein Vielfaches von ${rowDepth.toFixed(2)} m sein (keine Sondermaß-Anpassung in der Tiefe) – bitte Tiefe anpassen.`,
      );
    }
  } else {
    // Modulachse = Tiefe (Reihen): Resttiefe per Sondermaß-Platte gleicher Bautiefe (colWidth) füllen.
    if (rowRemainder > EPS) {
      const match = matchSubstitute(rowRemainder, colWidth);
      if (match !== undefined) {
        for (let i = 0; i < cols; i++) addPanel(i * colWidth, mainDepth, colWidth, rowRemainder, true);
      } else {
        warnings.push(
          `Resttiefe von ${rowRemainder.toFixed(2)} m entspricht keiner NivTec-Sondermaß-Platte für ${colWidth.toFixed(2)} m Bautiefe (verfügbar: ${sondermassSubstituteWidths(colWidth).map((w) => w.toFixed(2)).join(', ') || 'keine'} m) – bitte Tiefe anpassen.`,
        );
      }
    }
    // Restbreite auf der festen 2-m-Achse: bisher IMMER nur Warnung (angenommen, es gäbe dafür
    // keine Sondermaß-Platte) — laut Benni gibt es aber die 0,5×2-Platte genau für diesen Fall.
    if (colRemainder > EPS) {
      const match = matchSubstitute(colRemainder, rowDepth);
      if (match !== undefined) {
        for (let j = 0; j < rows; j++) addPanel(mainWidth, j * rowDepth, colRemainder, rowDepth, true);
      } else {
        warnings.push(
          `Restbreite von ${colRemainder.toFixed(2)} m entspricht keiner NivTec-Sondermaß-Platte für ${rowDepth.toFixed(2)} m Bautiefe (verfügbar: ${sondermassSubstituteWidths(rowDepth).map((w) => w.toFixed(2)).join(', ') || 'keine'} m) – bitte Breite anpassen.`,
        );
      }
    }
  }

  return {
    orientation,
    widthM,
    depthM,
    areaM2: round3(widthM * depthM),
    cols,
    rows,
    panels,
    panelCountsBySize,
    hasSondermass: colRemainder > EPS || rowRemainder > EPS,
    sondermassWarning: warnings.length > 0 ? warnings.join(' ') : undefined,
  };
}

export interface LayoutComparison {
  normal: LayoutResult;
  rotiert: LayoutResult;
  recommended: 'normal' | 'rotiert';
}

/** Berechnet beide Ausrichtungen und empfiehlt die mit weniger Sondermaß / weniger Füßen. */
export function computeLayout(widthM: number, depthM: number): LayoutComparison {
  const normal = buildLayout(widthM, depthM, 'normal');
  const rotiert = buildLayout(widthM, depthM, 'rotiert');

  let recommended: 'normal' | 'rotiert';
  if (normal.panels.length === 0 && rotiert.panels.length > 0) {
    // Eine Ausrichtung baut gar nichts (z.B. Tiefe < 1 m im Normal-Modus, wo die
    // 1-m-Achse fix ist) — dann ist die andere Ausrichtung immer vorzuziehen.
    recommended = 'rotiert';
  } else if (rotiert.panels.length === 0 && normal.panels.length > 0) {
    recommended = 'normal';
  } else if (normal.hasSondermass !== rotiert.hasSondermass) {
    recommended = normal.hasSondermass ? 'rotiert' : 'normal';
  } else {
    // Bei gleicher Plattenzahl kann die Anzahl benötigter Füße je nach Seitenverhältnis
    // des Rasters trotzdem unterschiedlich sein (z.B. 4×6-Raster: 35 Füße vs. 8×3-Raster
    // derselben Fläche: 36 Füße) — das ist das eigentlich relevante Kriterium.
    const normalFeet = countFeet(normal.panels);
    const rotiertFeet = countFeet(rotiert.panels);
    recommended = normalFeet <= rotiertFeet ? 'normal' : 'rotiert';
  }

  return { normal, rotiert, recommended };
}
