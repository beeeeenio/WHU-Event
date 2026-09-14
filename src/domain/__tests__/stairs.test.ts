import { describe, expect, it } from 'vitest';
import { computeRamp, computeStairs } from '../stairs';

describe('Treppen & Rampen', () => {
  it('100 cm Höhe ergibt 5 Stufen à 20 cm', () => {
    expect(computeStairs(100).stepCount).toBe(5);
  });

  it('60 cm Höhe mit 1:12-Neigung ergibt 7,2 m Rampenlänge', () => {
    expect(computeRamp(60).lengthM).toBeCloseTo(7.2, 5);
  });
});
