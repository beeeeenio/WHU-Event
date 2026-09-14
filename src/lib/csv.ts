import { groupMaterialList } from '../domain/materialList';
import type { MaterialListItem } from '../domain/types';

export function materialListToCsv(items: MaterialListItem[]): string {
  const header = ['Pos', 'Gruppe', 'Artikel', 'Art.-Nr.', 'Menge', 'Einheit'];
  const ordered = groupMaterialList(items).flatMap(([, groupItems]) => groupItems);
  const rows = ordered.map((i, index) => [index + 1, i.gruppe, i.artikel, i.artikelNr ?? '', i.menge, i.einheit]);
  const escape = (v: unknown) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(escape).join(';')).join('\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
