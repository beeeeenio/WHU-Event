import { describe, it, expect } from 'vitest';
import { applyChange, createHistory, redoHistory, undoHistory } from '../history';

describe('history', () => {
  it('creates a new history with initial value', () => {
    const h = createHistory(42);
    expect(h.present).toBe(42);
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
  });

  it('applies a change with a new txId, pushing present to past and clearing future', () => {
    const h = createHistory(1);
    const h2 = applyChange(h, 2, 1);
    expect(h2.present).toBe(2);
    expect(h2.past).toEqual([1]);
    expect(h2.future).toEqual([]);
    expect(h2.txId).toBe(1);
  });

  it('merges changes with the same txId by replacing only present', () => {
    const h = createHistory(1);
    const h2 = applyChange(h, 2, 1);
    const h3 = applyChange(h2, 3, 1); // same txId
    expect(h3.present).toBe(3);
    expect(h3.past).toEqual([1]); // past unchanged
    expect(h3.future).toEqual([]);
    expect(h3.txId).toBe(1);
  });

  it('returns h unchanged if next === present (same reference)', () => {
    const h = createHistory(1);
    const h2 = applyChange(h, 1, 100); // same value, different txId
    expect(h2).toBe(h); // exact same reference
  });

  it('respects the limit on past length', () => {
    const h = createHistory(0);
    let current = h;
    for (let i = 1; i <= 150; i++) {
      current = applyChange(current, i, i);
    }
    expect(current.past.length).toBe(100);
    expect(current.present).toBe(150);
  });

  it('undoes one step, moving present to future', () => {
    const h = createHistory(1);
    const h2 = applyChange(h, 2, 1);
    const h3 = applyChange(h2, 3, 2);
    const h4 = undoHistory(h3);
    expect(h4.present).toBe(2);
    expect(h4.past).toEqual([1]);
    expect(h4.future).toEqual([3]);
  });

  it('undo on empty past returns h unchanged', () => {
    const h = createHistory(1);
    const h2 = undoHistory(h);
    expect(h2).toBe(h);
  });

  it('redo undoes an undo', () => {
    const h = createHistory(1);
    const h2 = applyChange(h, 2, 1);
    const h3 = applyChange(h2, 3, 2);
    const h4 = undoHistory(h3);
    const h5 = redoHistory(h4);
    expect(h5.present).toBe(3);
    expect(h5.past).toEqual([2, 1]); // most recent at index 0
    expect(h5.future).toEqual([]);
  });

  it('redo on empty future returns h unchanged', () => {
    const h = createHistory(1);
    const h2 = redoHistory(h);
    expect(h2).toBe(h);
  });

  it('clears future when applying a new change after undo', () => {
    const h = createHistory(1);
    const h2 = applyChange(h, 2, 1);
    const h3 = applyChange(h2, 3, 2);
    const h4 = undoHistory(h3); // future = [3]
    const h5 = applyChange(h4, 4, 3); // new change with different txId
    expect(h5.future).toEqual([]);
    expect(h5.present).toBe(4);
  });

  it('resets txId on undo and redo', () => {
    const h = createHistory(1);
    const h2 = applyChange(h, 2, 1);
    expect(h2.txId).toBe(1);
    const h3 = undoHistory(h2);
    expect(h3.txId).toBeUndefined();
    const h4 = redoHistory(h3);
    expect(h4.txId).toBeUndefined();
  });
});
