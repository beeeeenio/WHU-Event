/** Löst einen Browser-Download für Text-Inhalt aus (CSV, JSON, ...). `withBom` setzt ein
 *  UTF-8-BOM voran — nötig, damit Excel eine CSV zuverlässig als UTF-8 statt Latin-1 erkennt;
 *  für andere Formate (z.B. JSON) unüblich und deshalb standardmäßig aus. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8', withBom = false): void {
  const blob = new Blob([withBom ? '﻿' + content : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
