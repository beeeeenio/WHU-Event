import { useCallback, useRef } from 'react';

/**
 * Liefert eine Canvas-Referenz für den PNG-Export, auch wenn die 3D-Ansicht gerade NICHT
 * sichtbar ist (per CSS "hidden" ausgeblendet, aber weiter gemountet). Ein per CSS verstecktes
 * <Canvas> hat Größe 0 — react-three-fiber ruft `onCreated` in dem Fall NICHT sofort auf,
 * sondern erst, sobald der Container wirklich eine echte Größe bekommt (über einen eigenen
 * ResizeObserver + WebGL-Setup, das länger als ein paar Animationsframes dauern kann).
 *
 * show3d() macht die 3D-Ansicht sichtbar. War sie das schon vorher (3D-Tab war schon offen),
 * reicht ein kurzes Warten (zwei Frames) auf den bereits vorhandenen Canvas. War sie es NICHT
 * (häufigster Fall: frisch geladene Seite, 3D-Tab noch nie geöffnet), wird stattdessen auf den
 * NÄCHSTEN echten `onCanvasReady`-Aufruf gewartet, mit einem Timeout als Sicherheitsnetz, damit
 * das hier nie endlos hängt.
 */
export function useExportCanvas(show3d: () => void) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waiterRef = useRef<((canvas: HTMLCanvasElement | null) => void) | null>(null);

  const onCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
    if (canvas && waiterRef.current) {
      waiterRef.current(canvas);
      waiterRef.current = null;
    }
  }, []);

  const getCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    show3d();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (canvasRef.current) return canvasRef.current;

    return new Promise<HTMLCanvasElement | null>((resolve) => {
      waiterRef.current = resolve;
      setTimeout(() => {
        if (waiterRef.current) {
          waiterRef.current = null;
          resolve(canvasRef.current);
        }
      }, 5000);
    });
  }, [show3d]);

  return { onCanvasReady, getCanvas };
}
