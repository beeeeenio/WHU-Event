import { useRef, useState } from 'react';
import { useSavedConfigs } from '../../hooks/useSavedConfigs';
import { downloadTextFile } from '../../lib/download';

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
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    save(trimmed, currentData);
    setName('');
  }

  function handleExportFile() {
    downloadTextFile(`nivtec-${namespace}.json`, JSON.stringify(currentData, null, 2), 'application/json;charset=utf-8');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // dieselbe Datei muss sich später erneut auswählen lassen
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      onLoad(parsed as T);
      setImportError(null);
    } catch {
      setImportError('Datei konnte nicht gelesen werden — ist es eine gültige NivTec-JSON-Datei?');
    }
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleExportFile}
          className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
        >
          Als Datei exportieren
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)]"
        >
          Aus Datei importieren
        </button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileChange} className="hidden" />
        <span className="text-xs text-[var(--color-text-muted)]">
          Für den Austausch mit anderen Tools, z.B. einer übergeordneten Hallenplanung.
        </span>
      </div>
      {importError && <p className="text-xs text-[var(--color-danger)]">{importError}</p>}

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
