/**
 * Einheitliche Farbkodierung der Füße nach Bauhöhe (cm) — über das gesamte Tool
 * hinweg gleich (2D-Grundriss, 3D-Ansicht, PowerPoint-Export). Aufsteigend von
 * hell (niedrig) zu dunkel (hoch), damit die Höhe auf einen Blick ablesbar ist.
 *
 * Nutzt die Slate-Blue/Navy-Blue-Familie der forumWHU-CI (Brand Style Guide,
 * Kapitel 3), NICHT Bright Orange — der Guide legt Orange als reine Signalfarbe
 * fest, die nie zur Flächen-/Serienfarbe für viele Elemente werden darf.
 */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

/**
 * CI-Referenzpunkte hell → dunkel (Slate-Blue-Familie). Bewusst NICHT bis Navy
 * Blue (#061638) — in der 3D-Ansicht sind sehr dunkle Füße vor dem ebenfalls
 * dunklen Schattenwurf kaum erkennbar ("Dunkelblau auf Schwarz"), deshalb endet
 * die Skala bei einem noch klar unterscheidbaren, mittleren Dunkelblau.
 */
const GRADIENT_STOPS = ['#c3d0ef', '#94a6dd', '#5b72b8', '#3d5499', '#2c3e6b'];

const HEIGHT_STEPS_CM = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200];

function colorForFraction(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (GRADIENT_STOPS.length - 1);
  const index = Math.min(GRADIENT_STOPS.length - 2, Math.floor(scaled));
  return lerpColor(GRADIENT_STOPS[index], GRADIENT_STOPS[index + 1], scaled - index);
}

const HEIGHT_COLOR_STOPS: Array<{ maxCm: number; color: string }> = HEIGHT_STEPS_CM.map((maxCm, i) => ({
  maxCm,
  color: colorForFraction(i / (HEIGHT_STEPS_CM.length - 1)),
}));

export function footColorForHeight(heightCm: number): string {
  const stop = HEIGHT_COLOR_STOPS.find((s) => heightCm <= s.maxCm);
  return (stop ?? HEIGHT_COLOR_STOPS[HEIGHT_COLOR_STOPS.length - 1]).color;
}

export function footColorLegend(): Array<{ heightCm: number; color: string }> {
  return HEIGHT_COLOR_STOPS.map((s) => ({ heightCm: s.maxCm, color: s.color }));
}
