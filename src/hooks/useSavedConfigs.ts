import { useState } from 'react';
import { deleteConfig, listSavedConfigs, renameConfig, saveConfig, type SavedConfig } from '../lib/savedConfigs';

export function useSavedConfigs<T>(namespace: string) {
  const [configs, setConfigs] = useState<SavedConfig<T>[]>(() => listSavedConfigs<T>(namespace));

  function save(name: string, data: T): SavedConfig<T> {
    const entry = saveConfig(namespace, name, data);
    setConfigs((prev) => [...prev, entry]);
    return entry;
  }

  function remove(id: string): void {
    deleteConfig(namespace, id);
    setConfigs((prev) => prev.filter((c) => c.id !== id));
  }

  function rename(id: string, name: string): void {
    renameConfig(namespace, id, name);
    setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  return { configs, save, remove, rename };
}
