import type { LayoutResult, PanelInstance } from './types';

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function translatePanels(panels: PanelInstance[], dx: number, dy: number): PanelInstance[] {
  return panels.map((p) => ({ ...p, x: round3(p.x + dx), y: round3(p.y + dy) }));
}

/**
 * Fügt zwei rechteckige Layouts zu einer L-Form zusammen: Layout `b` wird um
 * (offsetX, offsetY) verschoben und an `a` angehängt. Der gemeinsame Eckpunkt
 * zwischen beiden Schenkeln teilt sich automatisch einen Fuß (wie bei jedem
 * anderen benachbarten Plattenpaar) — dieselbe generische Eckpunkt-Zählung wie
 * im Hauptraster, keine Sonderfall-Logik nötig.
 */
export function mergeLShapeLayouts(a: LayoutResult, b: LayoutResult, offsetX: number, offsetY: number): LayoutResult {
  const panels = [...a.panels, ...translatePanels(b.panels, offsetX, offsetY)];
  const panelCountsBySize: Record<string, number> = { ...a.panelCountsBySize };
  for (const [key, count] of Object.entries(b.panelCountsBySize)) {
    panelCountsBySize[key] = (panelCountsBySize[key] ?? 0) + count;
  }
  const warnings = [a.sondermassWarning, b.sondermassWarning].filter((w): w is string => Boolean(w));

  return {
    orientation: a.orientation,
    widthM: Math.max(a.widthM, offsetX + b.widthM),
    depthM: Math.max(a.depthM, offsetY + b.depthM),
    areaM2: round3(a.areaM2 + b.areaM2),
    cols: a.cols,
    rows: a.rows + b.rows,
    panels,
    panelCountsBySize,
    hasSondermass: a.hasSondermass || b.hasSondermass,
    sondermassWarning: warnings.length > 0 ? warnings.join(' ') : undefined,
  };
}
