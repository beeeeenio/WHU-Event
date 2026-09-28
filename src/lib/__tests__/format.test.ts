import { describe, it, expect } from 'vitest';
import { formatMeters } from '../format';

describe('formatMeters', () => {
  it('should format 2 with 2 digits as "2,00"', () => {
    expect(formatMeters(2)).toBe('2,00');
  });

  it('should format 1.5 with 1 digit as "1,5"', () => {
    expect(formatMeters(1.5, 1)).toBe('1,5');
  });

  it('should format 0 with 2 digits as "0,00"', () => {
    expect(formatMeters(0)).toBe('0,00');
  });
});
