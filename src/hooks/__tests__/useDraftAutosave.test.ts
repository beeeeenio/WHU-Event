import { describe, expect, it } from 'vitest';
import { draftStorageKey } from '../useDraftAutosave';

describe('draftStorageKey', () => {
  it('baut den localStorage-Schlüssel aus dem Namensraum', () => {
    expect(draftStorageKey('kastenbuehne')).toBe('nivtec:draft:kastenbuehne');
    expect(draftStorageKey('tresen')).toBe('nivtec:draft:tresen');
  });
});
