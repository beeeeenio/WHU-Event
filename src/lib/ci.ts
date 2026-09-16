/** Welche Initiative/CI aktuell aktiv ist — geteilt zwischen App.tsx (Header-Umschalter) und den
 *  Konfiguratoren (damit der PPTX-Export weiß, welches Logo oben rechts auf die Folie soll). */
export type CiId = 'forumwhu' | 'cff' | 'whuevent' | 'sensability' | 'cscm';

export interface CiPptxLogo {
  /** Datei unter public/, für den PPTX-Export direkt als fertig geschnittenes PNG (kein SVG —
   *  pptxgenjs bettet Bilder als Roh-Bytes ein, PowerPoint selbst rendert kein SVG darin verlässlich). */
  imagePath: string;
  /** Breite/Höhe der Bilddatei, um die Ziel-Breite aus einer festen Zielhöhe zu berechnen. */
  aspectRatio: number;
}

export const CI_PPTX_LOGOS: Record<CiId, CiPptxLogo> = {
  forumwhu: { imagePath: '/brand/forumwhu-mark.png', aspectRatio: 896 / 240 },
  cff: { imagePath: '/brand/cff-main-dark.png', aspectRatio: 1600 / 168 },
  whuevent: { imagePath: '/brand/whuevent-mark-black.png', aspectRatio: 600 / 116 },
  sensability: { imagePath: '/brand/sensability-mark.png', aspectRatio: 2034 / 2057 },
  cscm: { imagePath: '/brand/cscm-mark.png', aspectRatio: 1572 / 428 },
};
