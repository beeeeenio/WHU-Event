export async function exportCanvasAsPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG-Export der 3D-Ansicht fehlgeschlagen');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
