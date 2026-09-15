import { describe, expect, it } from 'vitest';
import { countFeet, footPositions, labeledFootPositions } from '../feet';
import type { PanelInstance } from '../types';

function triangle(x: number, y: number, corner: PanelInstance['corner']): PanelInstance {
  return { x, y, w: 1, d: 1, sizeKey: 'dreieck-1x1', isSondermass: false, corner };
}

function rect(x: number, y: number, w: number, d: number): PanelInstance {
  return { x, y, w, d, sizeKey: `${w}x${d}`, isSondermass: false };
}

describe('countFeet — Dreieckpodest', () => {
  it('ein einzelnes Dreieck hat genau 3 Füße, nicht 4', () => {
    expect(countFeet([triangle(0, 0, 'tl')])).toBe(3);
  });

  it('jede der 4 Ausrichtungen liefert die 3 erwarteten Eckpunkte (Phantom-Ecke fehlt)', () => {
    expect(footPositions([triangle(0, 0, 'tl')]).sort(byXY)).toEqual(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }].sort(byXY),
    );
    expect(footPositions([triangle(0, 0, 'tr')]).sort(byXY)).toEqual(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }].sort(byXY),
    );
    expect(footPositions([triangle(0, 0, 'bl')]).sort(byXY)).toEqual(
      [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }].sort(byXY),
    );
    expect(footPositions([triangle(0, 0, 'br')]).sort(byXY)).toEqual(
      [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }].sort(byXY),
    );
  });

  it('Dreieck neben Rechteck mit geteilter echter Ecke: Dedup funktioniert weiter', () => {
    // Dreieck (0,0,corner=tl) hat eine echte Ecke bei (1,0). Rechteck bei (1,0) hat dort seine
    // tl-Ecke — derselbe Punkt, muss sich einen Fuß teilen statt 2 getrennte zu zählen.
    const panels = [triangle(0, 0, 'tl'), rect(1, 0, 1, 1)];
    // Unabhängig wären es 3 (Dreieck) + 4 (Rechteck) = 7 — der geteilte Punkt spart einen.
    expect(countFeet(panels)).toBe(6);
  });

  it('die Phantom-Ecke eines Dreiecks bekommt trotzdem einen Fuß, wenn ein NACHBAR dort eine echte Ecke hat', () => {
    // Dreieck (0,0,corner=tl): Phantom-Ecke bei (1,1) (keine eigene Ecke dort). Ein Rechteck bei
    // (1,1) hat dort seine tl-Ecke — der Fuß entsteht durch das Rechteck, nicht durch das Dreieck.
    const panels = [triangle(0, 0, 'tl'), rect(1, 1, 1, 1)];
    const positions = footPositions(panels);
    expect(positions.some((p) => p.x === 1 && p.y === 1)).toBe(true);
  });

  it('Regression: eine L-Ecke aus zwei Rechtecken zählt weiterhin exakt 7 Füße (Dreieck-Code ändert Rechtecke nicht)', () => {
    const panels = [rect(0, 0, 2, 1), rect(2, 0, 1, 2)];
    expect(countFeet(panels)).toBe(7);
  });
});

describe('labeledFootPositions — Dreieckpodest', () => {
  it('liefert für ein einzelnes Dreieck 3 beschriftete Füße, alle mit sich selbst als Eigentümer', () => {
    const labeled = labeledFootPositions([triangle(0, 0, 'tl')], 100);
    expect(labeled).toHaveLength(3);
    expect(labeled.every((f) => f.ownerPodest === 1)).toBe(true);
  });

  // Bug-Report (2026-09-14): in einer größeren Bühne zeigten Dreiecke optisch überhaupt keine
  // Füße. Ursache: der Fuß-"Eigentümer" (welche Platte den Fuß in ihrem Grundriss zeichnet) wurde
  // per kleinster Podest-Nummer gewählt — ein NACH seinen rechteckigen Nachbarn platziertes
  // Dreieck (höhere Nummer) verlor dadurch systematisch ALLE 3 Ecken an die Nachbarn. Jetzt wird
  // bevorzugt das Stück mit den wenigsten Ecken (Dreieck=3 vor Rechteck=4) als Eigentümer gewählt.
  it('ein NACH seinen rechteckigen Nachbarn platziertes Dreieck bleibt trotzdem Eigentümer aller 3 eigenen Füße', () => {
    const rectA = rect(-1, -1, 1, 1); // teilt (0,0) mit der Dreieck-Ecke
    const rectB = rect(1, 0, 1, 1); // teilt (1,0)
    const rectC = rect(0, 1, 1, 1); // teilt (0,1)
    const tri = triangle(0, 0, 'tl'); // echte Ecken: (0,0), (1,0), (0,1)
    const panels = [rectA, rectB, rectC, tri]; // Dreieck absichtlich zuletzt (höchste Podest-Nr. 4)

    const labeled = labeledFootPositions(panels, 100);
    const triangleOwnedCount = labeled.filter((f) => f.podeste.includes(4) && f.ownerPodest === 4).length;
    expect(triangleOwnedCount).toBeGreaterThanOrEqual(2);
    expect(triangleOwnedCount).toBe(3);
  });

  // Bug-Report (2026-09-14, Folge-Screenshot): die reine "wenigste Ecken gewinnt"-Regel oben löste
  // den Dreieck-Fall, kippte das Problem aber aufs Rechteck um: ein Achteck aus 1 Mitte- + 4 Rand-
  // Rechtecken + 4 Eck-Dreiecken ließ die Mitte-Platte (und tendenziell die Rand-Platten) JEDE
  // eigene Ecke an die Dreiecke verlieren — dieselbe "sieht komplett fußlos aus"-Situation, nur
  // für Rechtecke statt Dreiecke. Jetzt geht "hat noch gar keinen eigenen Fuß" vor Ecken-Anzahl.
  it('ein von 4 Dreiecken umrahmtes Mitte-Rechteck (Achteck) behält trotzdem mindestens einen eigenen Fuß', () => {
    const center = rect(1, 1, 1, 1);
    const top = rect(1, 0, 1, 1);
    const bottom = rect(1, 2, 1, 1);
    const left = rect(0, 1, 1, 1);
    const right = rect(2, 1, 1, 1);
    const tl = triangle(0, 0, 'br');
    const tr = triangle(2, 0, 'bl');
    const bl = triangle(0, 2, 'tr');
    const br = triangle(2, 2, 'tl');
    const panels = [center, top, bottom, left, right, tl, tr, bl, br];

    const labeled = labeledFootPositions(panels, 100);
    for (let podestNr = 1; podestNr <= panels.length; podestNr++) {
      const ownedCount = labeled.filter((f) => f.ownerPodest === podestNr).length;
      expect(ownedCount).toBeGreaterThanOrEqual(1);
    }
  });

  // Bug-Report (2026-09-15, PPTX-Export-Screenshot): eine freistehende Platte, die eine andere
  // nur DIAGONAL an einer Ecke berührt (kein gemeinsamer Kantenabschnitt, z.B. weil sie den
  // Aufbau nach unten-rechts fortsetzt), verlor eine ihrer 4 Ecken an die Nachbarplatte — obwohl
  // die beiden dort keine Nut-Feder-Verbindung teilen und daher gar keinen Fuß teilen können.
  it('zwei Rechtecke, die sich nur diagonal an einer Ecke berühren, teilen sich dort KEINEN Fuß', () => {
    const a = rect(0, 0, 2, 1); // Ecke unten-rechts bei (2,1)
    const b = rect(2, 1, 2, 1); // Ecke oben-links bei (2,1) — nur dieser eine Punkt berührt sich
    const labeled = labeledFootPositions([a, b], 100);
    expect(countFeet([a, b])).toBe(8); // 4 + 4, kein geteilter Punkt
    const sharedPointFeet = labeled.filter((f) => f.x === 2 && f.y === 1);
    expect(sharedPointFeet).toHaveLength(2); // zwei eigenständige Füße am selben Punkt
    expect(sharedPointFeet.map((f) => f.ownerPodest).sort()).toEqual([1, 2]); // je einer pro Platte
    expect(sharedPointFeet.every((f) => f.podeste.length === 1)).toBe(true); // keiner "teilt" sich strukturell
  });

  it('Regression: ein rechtwinklig (nicht nur diagonal) angebautes Rechteck teilt sich den Eckpunkt weiterhin normal', () => {
    const a = rect(0, 0, 2, 1);
    const b = rect(2, 0, 2, 1); // volle gemeinsame Kante bei x=2
    expect(countFeet([a, b])).toBe(6); // 4+4 minus 2 geteilte Punkte, nicht 8
  });
});

function byXY(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.x - b.x || a.y - b.y;
}
