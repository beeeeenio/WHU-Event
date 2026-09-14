import { useState } from 'react';
import { useSavedConfigs } from '../../hooks/useSavedConfigs';

interface Props<T> {
  /** Eindeutiger Namensraum je Modul, z.B. "buehne", "tresen". */
  namespace: string;
  /** Aktueller Zustand des Moduls, als reines JSON-Objekt — wird 1:1 gespeichert. */
  currentData: T;
  /** Setzt den Modul-Zustand aus einer geladenen Konfiguration zurück. */
  onLoad: (data: T) => void;
}

export function SavedConfigsPanel<T>({ namespace, currentData, onLoad }: Props<T>) {
  const { configs, save, remove } = useSavedConfigs<T>(namespace);
  const [name, setName] = useState('');

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    save(trimmed, currentData);
    setName('');
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder='z.B. "Tresen Fleetdesk"'
          className="flex-1 px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim()}
          className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-contrast)] disabled:opacity-40"
        >
          Speichern
        </button>
      </div>

      {configs.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">Noch keine gespeicherten Konfigurationen.</p>
      ) : (
        <ul className="space-y-1.5">
          {configs.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5"
            >
              <div className="min-w-0">
                <div className="text-sm text-[var(--color-text)] truncate">{c.name}</div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {new Date(c.savedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onLoad(c.data)}
                  className="px-2.5 py-1 rounded-md text-xs border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-contrast)]"
                >
                  Laden
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="px-2.5 py-1 rounded-md text-xs border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
