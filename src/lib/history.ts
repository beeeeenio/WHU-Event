/** Undo/redo history for any immutable value type. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  txId?: number;
}

/**
 * Creates a new history with the initial value.
 */
export function createHistory<T>(initial: T): History<T> {
  return {
    past: [],
    present: initial,
    future: [],
  };
}

/**
 * Applies a change to the history. If `next === h.present` (same reference), returns h unchanged.
 * If txId === h.txId, replaces only `present` (merges with previous edit). Otherwise, pushes the
 * old `present` onto `past`, clears `future`, sets `present` to `next`, and sets `txId` to the new one.
 */
export function applyChange<T>(h: History<T>, next: T, txId: number, limit = 100): History<T> {
  // No-op if the next state is the same reference
  if (next === h.present) {
    return h;
  }

  // Same transaction ID: merge by replacing only present, keep past/future/txId as-is
  if (txId === h.txId) {
    return { ...h, present: next };
  }

  // New transaction: push old present onto past, clear future
  const newPast = [h.present, ...h.past].slice(0, limit);
  return {
    past: newPast,
    present: next,
    future: [],
    txId,
  };
}

/**
 * Undoes one step. If past is empty, returns h unchanged. Otherwise, takes the most recent
 * past entry (at index 0) into `present`, pushes the old `present` onto the front of `future`, and resets txId.
 */
export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) {
    return h;
  }

  const newPast = h.past.slice(1);
  const newPresent = h.past[0];
  const newFuture = [h.present, ...h.future];

  return {
    past: newPast,
    present: newPresent,
    future: newFuture,
    txId: undefined,
  };
}

/**
 * Redoes one step. Mirror of undo using future.
 */
export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) {
    return h;
  }

  const newFuture = h.future.slice(1);
  const newPresent = h.future[0];
  const newPast = [h.present, ...h.past];

  return {
    past: newPast,
    present: newPresent,
    future: newFuture,
    txId: undefined,
  };
}
