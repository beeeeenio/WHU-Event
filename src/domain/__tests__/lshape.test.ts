import { describe, expect, it } from 'vitest';
import { computeLayout } from '../layout';
import { mergeLShapeLayouts } from '../lshape';
import { countFeet } from '../feet';

describe('mergeLShapeLayouts — Tischreihen um die Ecke (90°)', () => {
  it('teilt sich einen Fuß am inneren Eckpunkt beider Schenkel', () => {
    const armDepthM = 1;
    const armA = computeLayout(4, armDepthM).normal; // 2 Zellen à 2×1 m
    const armB = computeLayout(armDepthM, 2).rotiert; // 1 Zelle à 1×2 m, entlang der Tiefe

    const merged = mergeLShapeLayouts(armA, armB, 0, armDepthM);

    expect(merged.panels).toHaveLength(armA.panels.length + armB.panels.length);
    // Eckfuß bei (0, armDepthM) gehört zu beiden Schenkeln, wird aber nur 1x gezählt.
    const feetA = countFeet(armA.panels);
    const feetBTranslated = countFeet(armB.panels.map((p) => ({ ...p, y: p.y + armDepthM })));
    const totalMerged = countFeet(merged.panels);
    expect(totalMerged).toBe(feetA + feetBTranslated - 1);
  });
});
