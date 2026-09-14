import { describe, expect, it } from 'vitest';
import { footTypeForHeight, isBracingRequired, isHorizontalBracingRequired, isRailingRequired } from '../rules';

describe('Regel-Engine Bühne', () => {
  it('Geländer erst ab 100 cm Pflicht', () => {
    expect(isRailingRequired('buehne', 80)).toBe(false);
    expect(isRailingRequired('buehne', 100)).toBe(true);
    expect(isRailingRequired('buehne', 140)).toBe(true);
  });

  it('Diagonalverstrebung erst ab 80 cm Pflicht (NivTec Edition 3.0, Teil I)', () => {
    expect(isBracingRequired('buehne', 60)).toBe(false);
    expect(isBracingRequired('buehne', 80)).toBe(true);
    expect(isBracingRequired('buehne', 200)).toBe(true);
  });

  it('Horizontalverstrebung erst über 140 cm nötig — NICHT immer verbaut (Aufbauregeln 2.1-2.3)', () => {
    expect(isHorizontalBracingRequired('buehne', 80)).toBe(false);
    expect(isHorizontalBracingRequired('buehne', 140)).toBe(false);
    expect(isHorizontalBracingRequired('buehne', 160)).toBe(true);
    expect(isHorizontalBracingRequired('buehne', 200)).toBe(true);
  });

  it('Fußtyp ist immer LV-Fuß (fest) über die gesamte Höhenserie 20–200 cm', () => {
    expect(footTypeForHeight('buehne', 20)).toBe('fest');
    expect(footTypeForHeight('buehne', 100)).toBe('fest');
    expect(footTypeForHeight('buehne', 200)).toBe('fest');
  });
});

describe('Regel-Engine Tisch', () => {
  it('Tische brauchen nie Geländer/Aussteifung', () => {
    expect(isRailingRequired('tisch', 90)).toBe(false);
    expect(isBracingRequired('tisch', 90)).toBe(false);
  });
});
