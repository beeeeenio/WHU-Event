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

  // Zwei Durchgänge statt einer einfachen Pro-Punkt-Regel, sonst verhungert IMMER irgendwer:
  //
  // Durchgang 1 (Form-Präferenz): an jeder geteilten Ecke gewinnt das Stück mit weniger Ecken
  // (Dreieck=3 vor Rechteck=4), sonst die kleinste Podest-Nummer. Löst den Ursprungsfall (ein
  // Dreieck zeigte optisch gar keinen Fuß), kann aber selbst wieder ein Rechteck leer ausgehen
  // lassen, wenn es an ALLEN Ecken von Dreiecken umgeben ist (z.B. die Mitte-Platte eines Achtecks
  // aus 1 Mitte + 4 Rand + 4 Eck-Dreiecken — dort gewinnt an jeder ihrer 4 Ecken ein anderes
  // Dreieck, die Mitte bekommt nach Durchgang 1 keinen einzigen).
  //
  // Durchgang 2 (Fairness-Korrektur): jedes Stück, das nach Durchgang 1 KEINEN eigenen Fuß hat,
  // holt sich EINE seiner eigenen Ecken vom aktuellen Eigentümer zurück — aber nur, wenn der sich
  // das leisten kann (noch mehr als 1 Punkt besitzt), damit dabei nicht einfach ein anderes Stück
  // neu verhungert.
  //
  // Recherche (2026-09-14) in den offiziellen NivTec-Aufbauanleitungen/Katalogen bestätigt: das
  // "4-2-2-1"-Prinzip für reine Rechteck-Raster ist offiziell (genau die oben implementierte
  // Logik über eindeutige Eckpunkte), ein Dreieckpodest hat laut Katalog tatsächlich nur 3
  // Fußaufnahmen (bestätigt phantomCorner) — aber für gemischte Dreieck/Rechteck-Ecken wie hier
  // gibt es KEINE veröffentlichte Regel; NivTec verweist Sonderformen explizit an die eigene
  // Konstruktionsabteilung. Dieser Zwei-Durchgang-Algorithmus ist also eine begründete eigene
  // Näherung, kein Verstoß gegen eine bekannte Regel.
  const cornerCount = (podestNr: number) => (panels[podestNr - 1].corner !== undefined ? 3 : 4);
  function shapeOwner(podeste: number[]): number {
    return podeste.reduce((best, n) => {
      const diff = cornerCount(n) - cornerCount(best);
      if (diff < 0) return n;
      if (diff > 0) return best;
      return n < best ? n : best;
    });
  }

  const ownerByKey = new Map<string, number>();
  const keysByOwner = new Map<number, string[]>();
  for (const p of points) {
    const key = keyFor(p.x, p.y);
    const owner = shapeOwner(podesteByPoint.get(key) ?? []);
    ownerByKey.set(key, owner);
    if (!keysByOwner.has(owner)) keysByOwner.set(owner, []);
    keysByOwner.get(owner)!.push(key);
  }

  for (let podestNr = 1; podestNr <= panels.length; podestNr++) {
    if ((keysByOwner.get(podestNr)?.length ?? 0) > 0) continue; // hat schon mindestens einen Fuß
    const piece = panels[podestNr - 1];
    if (piece.w <= 0 || piece.d <= 0) continue;
    for (const c of corners(piece)) {
      const key = keyFor(c.x, c.y);
      const currentOwner = ownerByKey.get(key)!;
      const currentOwnerKeys = keysByOwner.get(currentOwner)!;
      if (currentOwnerKeys.length <= 1) continue; // Eigentümer hätte danach selbst nichts mehr
      currentOwnerKeys.splice(currentOwnerKeys.indexOf(key), 1);
      ownerByKey.set(key, podestNr);
      if (!keysByOwner.has(podestNr)) keysByOwner.set(podestNr, []);
      keysByOwner.get(podestNr)!.push(key);
      break;
    }
  }

  return points.map((p) => {
    const podeste = podesteByPoint.get(keyFor(p.x, p.y)) ?? [];
    const ownerPodest = ownerByKey.get(keyFor(p.x, p.y))!;
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
