import type { PanelInstance } from './types';
import { phantomCorner } from './triangle';

function roundMM(v: number): number {
  // Millimeter als Ganzzahl, um Fließkomma-Vergleichsfehler bei den Eckpunkten zu vermeiden
  return Math.round(v * 1000);
}

function keyFor(x: number, y: number): string {
  return `${roundMM(x)}:${roundMM(y)}`;
}

/** Ein Rechteck hat 4 Fuß-taugliche Ecken (unverändertes Verhalten). Ein Dreieckpodest
 *  (p.corner gesetzt) hat nur 3 echte Ecken — die eine "Phantom"-Ecke ohne Material bekommt
 *  hier keinen Fuß (kann aber trotzdem einen haben, wenn ein NACHBAR-Stück dort selbst eine
 *  echte Ecke hat — das ergibt sich automatisch, da jedes Panel seine eigenen Ecken beisteuert). */
function corners(p: PanelInstance): Array<{ x: number; y: number }> {
  const all = {
    tl: { x: p.x, y: p.y },
    tr: { x: p.x + p.w, y: p.y },
    bl: { x: p.x, y: p.y + p.d },
    br: { x: p.x + p.w, y: p.y + p.d },
  };
  if (p.corner === undefined) return [all.tl, all.tr, all.bl, all.br];
  const omit = phantomCorner(p.corner);
  return (['tl', 'tr', 'bl', 'br'] as const).filter((k) => k !== omit).map((k) => all[k]);
}

/**
 * Gesamtzahl benötigter Füße für ein Set platzierter Platten.
 *
 * Jede Platte braucht an jeder ihrer 4 Ecken einen Fuß, benachbarte Platten teilen
 * sich aber den Fuß an gemeinsamen Eckpunkten. Die Gesamtzahl ist daher die Anzahl
 * *eindeutiger* Eckpunkte über alle Platten hinweg — für ein reguläres Raster mit
 * `cols` Spalten × `rows` Reihen ergibt das (cols+1) × (rows+1), was exakt dem
 * "4-2-2-1-Prinzip" (Eckpodest 4, Randpodest 2, Innenpodest 1 zusätzlicher Fuß)
 * des NivTec-Referenzrechners entspricht — funktioniert aber auch für unregelmäßige
 * Sondermaß-Layouts, bei denen 4-2-2-1 als Faustregel nicht mehr direkt greift.
 */
export function countFeet(panels: PanelInstance[]): number {
  const points = new Set<string>();
  for (const p of panels) {
    for (const c of corners(p)) points.add(keyFor(c.x, c.y));
  }
  return points.size;
}

/** Eindeutige Fuß-Positionen im Grundriss (Meter-Koordinaten), z.B. zum Einzeichnen im Grundrissplan. */
export function footPositions(panels: PanelInstance[]): Array<{ x: number; y: number }> {
  const points = new Map<string, { x: number; y: number }>();
  for (const p of panels) {
    for (const c of corners(p)) points.set(keyFor(c.x, c.y), c);
  }
  return Array.from(points.values());
}

function toAxisLetters(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Wie weit ein Fuß-Symbol beim Zeichnen von der exakten Eckposition in die "Eigentümer"-Platte hinein versetzt wird. */
const RENDER_INSET_M = 0.16;

export interface LabeledFootPosition {
  /** Exakte geometrische Eckposition (Meter) — für Domain-Logik/3D. */
  x: number;
  y: number;
  /** Position zum Einzeichnen: leicht Richtung Zentrum der Eigentümer-Platte versetzt, damit der Fuß sichtbar EINER Platte zugeordnet ist statt auf der Grenze zwischen Platten zu liegen. */
  renderX: number;
  renderY: number;
  /** Positionsbezeichnung im Achsen/Reihen-Schema der NivTec-Anleitung, z.B. "A1", "C4". */
  label: string;
  /** Nummern (1-basiert) aller Podeste, die sich diesen Fuß strukturell teilen. */
  podeste: number[];
  /** Die eine Platte (kleinste Nummer der Beteiligten), in die der Fuß gezeichnet wird. */
  ownerPodest: number;
}

/**
 * Fortlaufende Podest-Nummern (1, 2, 3, ...) in Platzierungsreihenfolge — macht die
 * Zuordnung "welcher Fuß gehört zu welchem Podest" im Grundriss eindeutig benennbar.
 */
export function panelNumbers(panels: PanelInstance[]): Map<PanelInstance, number> {
  const map = new Map<PanelInstance, number>();
  panels.forEach((p, i) => map.set(p, i + 1));
  return map;
}

/**
 * Fuß-Positionen mit Achsen/Reihen-Bezeichnung (wie in der NivTec-Anleitung: Achsen
 * A, B, C... entlang der Breite, Reihen 1, 2, 3... entlang der Tiefe) UND den Nummern
 * der Podeste, die sich diesen Fuß teilen — beantwortet direkt "an welchem Podest
 * hängt dieser Fuß".
 */
export function labeledFootPositions(panels: PanelInstance[]): LabeledFootPosition[] {
  const points = footPositions(panels);
  const xs = Array.from(new Set(points.map((p) => roundMM(p.x)))).sort((a, b) => a - b);
  const ys = Array.from(new Set(points.map((p) => roundMM(p.y)))).sort((a, b) => a - b);
  const xIndex = new Map(xs.map((v, i) => [v, i]));
  const yIndex = new Map(ys.map((v, i) => [v, i]));

  const podesteByPoint = new Map<string, number[]>();
  panels.forEach((p, panelIndex) => {
    for (const c of corners(p)) {
      const key = keyFor(c.x, c.y);
      if (!podesteByPoint.has(key)) podesteByPoint.set(key, []);
      podesteByPoint.get(key)!.push(panelIndex + 1);
    }
  });

  return points.map((p) => {
    const podeste = podesteByPoint.get(keyFor(p.x, p.y)) ?? [];
    // Bevorzugt als visuellen "Besitzer" dieses Fußes das Stück mit den WENIGSTEN Ecken (aktuell
    // nur Dreieck [3] vs. Rechteck [4] relevant), nicht einfach die kleinste Podest-Nummer.
    // Bug-Report: ein nach seinen rechteckigen Nachbarn platziertes Dreieck verlor bei reiner
    // Nummern-Auswahl systematisch ALLE 3 Ecken an die Nachbarn — der Fuß erschien optisch nie
    // im Dreieck selbst, obwohl er strukturell dazugehört (in Material-/Gesamtzahl war er immer
    // korrekt gezählt, siehe countFeet/footPositions oben, nur die RENDER-Zuordnung war falsch).
    // Ein Dreieck hat nur 3 mögliche Fuß-Ecken und profitiert von der Bevorzugung entsprechend
    // mehr als ein Rechteck, das i.d.R. weitere, nicht geteilte Ecken für eigene Füße hat.
    const cornerCount = (podestNr: number) => (panels[podestNr - 1].corner !== undefined ? 3 : 4);
    const ownerPodest = podeste.reduce((best, n) => {
      const diff = cornerCount(n) - cornerCount(best);
      if (diff < 0) return n;
      if (diff > 0) return best;
      return n < best ? n : best;
    });
    const owner = panels[ownerPodest - 1];
    const centerX = owner.x + owner.w / 2;
    const centerY = owner.y + owner.d / 2;
    const dx = centerX - p.x;
    const dy = centerY - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const inset = Math.min(RENDER_INSET_M, dist * 0.4);
    return {
      x: p.x,
      y: p.y,
      renderX: p.x + (dx / dist) * inset,
      renderY: p.y + (dy / dist) * inset,
      label: `${toAxisLetters(xIndex.get(roundMM(p.x))!)}${yIndex.get(roundMM(p.y))! + 1}`,
      podeste,
      ownerPodest,
    };
  });
}
