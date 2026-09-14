export interface SavedConfig<T> {
  id: string;
  name: string;
  savedAt: string;
  data: T;
}

function storageKey(namespace: string): string {
  return `nivtec:saved:${namespace}`;
}

export function listSavedConfigs<T>(namespace: string): SavedConfig<T>[] {
  try {
    const raw = localStorage.getItem(storageKey(namespace));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll<T>(namespace: string, configs: SavedConfig<T>[]): void {
  try {
    localStorage.setItem(storageKey(namespace), JSON.stringify(configs));
  } catch {
    // localStorage kann z.B. im privaten Modus nicht verfügbar sein — stiller Fallback,
    // das Speichern schlägt dann fehl, ohne die App zum Absturz zu bringen.
  }
}

function generateId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveConfig<T>(namespace: string, name: string, data: T): SavedConfig<T> {
  const configs = listSavedConfigs<T>(namespace);
  const entry: SavedConfig<T> = { id: generateId(), name, savedAt: new Date().toISOString(), data };
  writeAll(namespace, [...configs, entry]);
  return entry;
}

export function deleteConfig(namespace: string, id: string): void {
  writeAll(
    namespace,
    listSavedConfigs(namespace).filter((c) => c.id !== id),
  );
}

export function renameConfig(namespace: string, id: string, name: string): void {
  writeAll(
    namespace,
    listSavedConfigs(namespace).map((c) => (c.id === id ? { ...c, name } : c)),
  );
}
