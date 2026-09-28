import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 500;

export function draftStorageKey(namespace: string): string {
  return `nivtec:draft:${namespace}`;
}

/**
 * Sichert `currentData` automatisch (debounced, 500 ms nach der letzten Änderung) im
 * localStorage und lädt einen vorhandenen Entwurf einmalig beim ersten Mount — über denselben
 * Parser/Validierungspfad wie der Datei-Import (`onLoad`), damit ein beschädigter oder aus einer
 * älteren Version stammender Entwurf nie zum Absturz führt, sondern einfach ignoriert wird.
 *
 * Bewusst komplett getrennt von den benannten Speicherständen (SavedConfigsPanel) und dem
 * Datei-Export/-Import (PlanFileBar) — reine Absicherung gegen ein versehentliches Neuladen
 * oder Schließen des Tabs, kein Ersatz für bewusstes Speichern.
 */
export function useDraftAutosave(namespace: string, currentData: unknown, onLoad: (data: unknown) => string | null) {
  const [restored, setRestored] = useState(false);
  const loadedRef = useRef(false);
  // Zustand direkt beim allerersten Render (vor einem möglichen Restore) — solange currentData
  // dem noch entspricht, wurde nichts Eigenes verändert, also gibt es auch nichts zu sichern.
  // Verhindert einen leeren "Phantom-Entwurf", der bei einem späteren Neuladen fälschlich als
  // "wiederhergestellt" gilt, obwohl der Nutzer dieses Modul nie angefasst hat.
  const initialSnapshotRef = useRef(JSON.stringify(currentData));

  // Einmalig beim Mount: vorhandenen Entwurf laden, BEVOR der erste Autosave-Schreibzugriff
  // passiert — sonst würde der leere Startzustand einen echten Entwurf sofort überschreiben.
  useEffect(() => {
    loadedRef.current = true;
    try {
      const raw = localStorage.getItem(draftStorageKey(namespace));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const error = onLoad(parsed);
      if (!error) setRestored(true);
    } catch {
      // ungültiger/beschädigter Entwurf — einfach ignorieren, kein Absturz
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (JSON.stringify(currentData) === initialSnapshotRef.current) return;
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(draftStorageKey(namespace), JSON.stringify(currentData));
      } catch {
        // z.B. privater Modus ohne localStorage — Autosave schlägt dann still fehl
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [namespace, currentData]);

  function discard() {
    try {
      localStorage.removeItem(draftStorageKey(namespace));
    } catch {
      // ignorieren
    }
    setRestored(false);
  }

  return { restored, discard };
}
