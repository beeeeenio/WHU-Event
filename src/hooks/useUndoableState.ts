import { useCallback, useRef, useState } from 'react';
import { applyChange, createHistory, redoHistory, undoHistory, type History } from '../lib/history';

export function useUndoableState<T>(initial: T) {
  const [history, setHistory] = useState<History<T>>(() => createHistory(initial));
  const tx = useRef({ id: 0, open: false });

  const set = useCallback((updater: T | ((prev: T) => T)) => {
    if (!tx.current.open) {
      tx.current.id += 1;
      tx.current.open = true;
      queueMicrotask(() => {
        tx.current.open = false;
      });
    }
    const txId = tx.current.id;
    setHistory((h) => {
      const next = typeof updater === 'function' ? (updater as (prev: T) => T)(h.present) : updater;
      return applyChange(h, next, txId);
    });
  }, []);

  const undo = useCallback(() => setHistory((h) => undoHistory(h)), []);
  const redo = useCallback(() => setHistory((h) => redoHistory(h)), []);

  return {
    value: history.present,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
