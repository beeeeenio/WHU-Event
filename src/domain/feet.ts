import type { PanelInstance } from './types';
import { phantomCorner } from './triangle';

function roundMM(v: number): number {
  // Millimeter als Ganzzahl, um Fließkomma-Vergleichsfehler bei den Eckpunkten zu vermeiden
  return Math.round(v * 1000);
}

function keyFor(x: number, y: number): string {
  return `${roundMM(x)}:${roundMM(y)}`;
}

type CornerRole = 'tl' | 'tr' | 'bl' | 'br';

interface RoledCorner {
  role: CornerRole;
  x: number;
  y: number;
}

interface CornerContribution extends RoledCorner {
  panelNr: number;
}

/** Ein Rechteck hat 4 Fuß-taugliche Ecken (unverändertes Verhalten). Ein Dreieckpodest
 *  (p.corner gesetzt) hat nur 3 echte Ecken — die eine "Phantom"-Ecke ohne Material bekommt
 *  hier keinen Fuß (kann aber trotzdem einen haben, wenn ein NACHBAR-Stück dort selbst eine
 *  echte Ecke hat — das ergibt sich automatisch, da jedes Panel seine eigenen Ecken beisteuert). */
function cornersWithRole(p: PanelInstance): RoledCorner[] {
  const all: Record<CornerRole, { x: number; y: number }> = {
    tl: { x: p.x, y: p.y },
    tr: { x: p.x + p.w, y: p.y },
    bl: { x: p.x, y: p.y + p.d },
    br: { x: p.x + p.w, y: p.y + p.d },
  };
  const roles: readonly CornerRole[] = ['tl', 'tr', 'bl', 'br'];
  if (p.corner === undefined) return roles.map((role) => ({ role, ...all[role] }));
  const omit = phantomCorner(p.corner);
  return roles.filter((role) => role !== omit).map((role) => ({ role, ...all[role] }));
}

/**
 * Rollen-Paare, die sich an einem Punkt NUR diagonal berühren (Ecke an Ecke), ohne irgendwo
 * eine gemeinsame Kante zu teilen — z.B. eine Platte oben-links und eine zweite unten-rechts
 * vom selben Punkt, mit leerem Raum in den anderen beiden Quadranten. Eine echte Nut-Feder-
 * Verbindung (das eigentliche NivTec-"4-2-2-1"-Prinzip beruht darauf, siehe Kommentar unten)
 * braucht eine gemeinsame Kante; ohne die ist an so einem Punkt strukturell KEIN gemeinsamer
 * Fuß möglich — jede Platte braucht dort ihren EIGENEN.
 *
 * Bug-Report (2026-09-15, PPTX-Export-Screenshot): eine freistehende, nur diagonal an eine
 * andere Platte angesetzte Tischplatte ("dieser Tisch... muss ja auch 4 Füße haben") verlor
 * eine ihrer 4 Ecken an die NUR diagonal berührende Nachbarplatte, weil die bisherige Logik
 * jeden geteilten Eckpunkt bedingungslos als EINEN gemeinsamen Fuß behandelte — unabhängig
 * davon, ob dort überhaupt eine gemeinsame Kante existiert.
 *
 * Bewusst NUR für zwei Rechtecke aktiv (siehe Anwendung unten): bei einem Dreieckpodest sind
 * die beiden Kanten an seinen NICHT-rechtwinkligen echten Ecken (tr/bl bei corner='tl') nicht
 * beide echte Bounding-Box-Kanten — eine davon ist die Hypotenuse. Die einfache "Rolle an
 * diesem Punkt"-Prüfung unten geht von zwei vollen Rechteck-Kanten aus; das für Dreiecke exakt
 * zu Ende zu denken ist ein eigenes, hier nicht angefragtes Problem — deshalb greift der
 * Diagonal-Split nur, wenn BEIDE beteiligten Stücke echte Rechtecke sind (bestehendes
 * Dreieck-Verhalten bleibt dadurch unangetastet, siehe bestehende Tests).
 */
const DIAGONAL_ROLE_PAIRS = new Set(['tl|br', 'br|tl', 'tr|bl', 'bl|tr']);

/**
 * Gruppiert alle Eck-Beiträge aller Platten so, dass jede Gruppe genau einen Fuß ergibt —
 * normalerweise eine Gruppe pro eindeutigem Punkt (alle Platten, die dort eine echte Ecke
 * haben, teilen sich einen Fuß), außer im Diagonal-Sonderfall oben: dort wird eine Gruppe aus
 * genau zwei nur-diagonal berührenden Rechtecken in zwei Ein-Platten-Gruppen am selben Punkt
 * aufgeteilt, damit jedes Rechteck seinen eigenen Fuß bekommt.
 */
function groupCornersIntoFeet(panels: PanelInstance[]): CornerContribution[][] {
  const byKey = new Map<string, CornerContribution[]>();
  panels.forEach((p, i) => {
    for (const c of cornersWithRole(p)) {
      const key = keyFor(c.x, c.y);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push({ ...c, panelNr: i + 1 });
    }
  });

  const groups: CornerContribution[][] = [];
  for (const contributions of byKey.values()) {
    const [a, b] = contributions;
    const bothRectangles =
      contributions.length === 2 && panels[a.panelNr - 1].corner === undefined && panels[b.panelNr - 1].corner === undefined;
    if (bothRectangles && DIAGONAL_ROLE_PAIRS.has(`${a.role}|${b.role}`)) {
      groups.push([a], [b]);
    } else {
      groups.push(contributions);
    }
  }
  return groups;
}

/**
 * Gesamtzahl benötigter Füße für ein Set platzierter Platten.
 *
 * Jede Platte braucht an jeder ihrer 4 Ecken einen Fuß, benachbarte Platten teilen
 * sich aber den Fuß an gemeinsamen Eckpunkten — sofern sie sich dort eine echte Kante teilen
 * (Nut-Feder-Verbindung); zwei Platten, die sich nur diagonal an einer Ecke berühren, brauchen
 * dort je ihren eigenen Fuß (siehe groupCornersIntoFeet). Für ein reguläres Raster mit `cols`
 * Spalten × `rows` Reihen ergibt das (cols+1) × (rows+1), was exakt dem "4-2-2-1-Prinzip"
 * (Eckpodest 4, Randpodest 2, Innenpodest 1 zusätzlicher Fuß) des NivTec-Referenzrechners
 * entspricht — funktioniert aber auch für unregelmäßige Sondermaß-Layouts, bei denen 4-2-2-1
 * als Faustregel nicht mehr direkt greift.
 */
export function countFeet(panels: PanelInstance[]): number {
  return groupCornersIntoFeet(panels).length;
}

/** Eindeutige Fuß-Positionen im Grundriss (Meter-Koordinaten), z.B. zum Einzeichnen im Grundrissplan. */
export function footPositions(panels: PanelInstance[]): Array<{ x: number; y: number }> {
  return groupCornersIntoFeet(panels).map((g) => ({ x: g[0].x, y: g[0].y }));
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
  const groups = groupCornersIntoFeet(panels);
  const groupPoints = groups.map((g) => ({ x: g[0].x, y: g[0].y }));
  const xs = Array.from(new Set(groupPoints.map((p) => roundMM(p.x)))).sort((a, b) => a - b);
  const ys = Array.from(new Set(groupPoints.map((p) => roundMM(p.y)))).sort((a, b) => a - b);
  const xIndex = new Map(xs.map((v, i) => [v, i]));
  const yIndex = new Map(ys.map((v, i) => [v, i]));

  // Zwei Durchgänge statt einer einfachen Pro-Gruppe-Regel, sonst verhungert IMMER irgendwer:
  //
  // Durchgang 1 (Form-Präferenz): an jeder Gruppe gewinnt das Stück mit weniger Ecken
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

  const ownerByGroup: number[] = groups.map((g) => shapeOwner(g.map((c) => c.panelNr)));
  const groupIndicesByOwner = new Map<number, number[]>();
  groups.forEach((_, gi) => {
    const owner = ownerByGroup[gi];
    if (!groupIndicesByOwner.has(owner)) groupIndicesByOwner.set(owner, []);
    groupIndicesByOwner.get(owner)!.push(gi);
  });

  // Für Durchgang 2: zu welcher Gruppe (Index in `groups`) gehört eine gegebene eigene Ecke
  // (panelNr, x, y) einer Platte gelandet? Im Diagonal-Sonderfall kann das eine eigene
  // Ein-Platten-Gruppe sein statt der mit den Nachbarn geteilten.
  const groupIndexByContribution = new Map<string, number>();
  groups.forEach((g, gi) => {
    for (const c of g) groupIndexByContribution.set(`${c.panelNr}:${keyFor(c.x, c.y)}`, gi);
  });

  for (let podestNr = 1; podestNr <= panels.length; podestNr++) {
    if ((groupIndicesByOwner.get(podestNr)?.length ?? 0) > 0) continue; // hat schon mindestens einen Fuß
    const piece = panels[podestNr - 1];
    if (piece.w <= 0 || piece.d <= 0) continue;
    for (const c of cornersWithRole(piece)) {
      const gi = groupIndexByContribution.get(`${podestNr}:${keyFor(c.x, c.y)}`)!;
      const currentOwner = ownerByGroup[gi];
      const currentOwnerGroups = groupIndicesByOwner.get(currentOwner)!;
      if (currentOwnerGroups.length <= 1) continue; // Eigentümer hätte danach selbst nichts mehr
      currentOwnerGroups.splice(currentOwnerGroups.indexOf(gi), 1);
      ownerByGroup[gi] = podestNr;
      if (!groupIndicesByOwner.has(podestNr)) groupIndicesByOwner.set(podestNr, []);
      groupIndicesByOwner.get(podestNr)!.push(gi);
      break;
    }
  }

  return groups.map((g, gi) => {
    const p = groupPoints[gi];
    const ownerPodest = ownerByGroup[gi];
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
      podeste: g.map((c) => c.panelNr),
      ownerPodest,
    };
  });
}
