/** Welche Initiative/CI aktuell aktiv ist — geteilt zwischen App.tsx (Header-Umschalter) und den
 *  Konfiguratoren (damit der PPTX-Export weiß, welches Logo oben rechts auf die Folie soll). */
export type CiId = 'forumwhu' | 'cff' | 'whuevent';

export interface CiPptxLogo {
  /** Datei unter public/, für den PPTX-Export direkt als fertig geschnittenes PNG (kein SVG —
   *  pptxgenjs bettet Bilder als Roh-Bytes ein, PowerPoint selbst rendert kein SVG darin verlässlich). */
  imagePath: string;
  /** Breite/Höhe der Bilddatei, um die Ziel-Breite aus einer festen Zielhöhe zu berechnen. */
  aspectRatio: number;
  /** Nur gesetzt, wenn das Logo eine dunkle Fläche hinter sich braucht, um auf einer weißen
   *  Folie lesbar zu sein (z.B. CFF: die einzige vorhandene Logodatei ist die weiße Variante,
   *  laut Guidelines für den Deep-Navy-Hintergrund gedacht — auf Weiß sonst unsichtbar). */
  slideChipColorHex?: string;
}

export const CI_PPTX_LOGOS: Record<CiId, CiPptxLogo> = {
  forumwhu: { imagePath: '/brand/forumwhu-mark.png', aspectRatio: 896 / 240 },
  cff: { imagePath: '/brand/cff-main-white.png', aspectRatio: 4596 / 482, slideChipColorHex: '0C0734' },
  whuevent: { imagePath: '/brand/whuevent-mark-black.png', aspectRatio: 600 / 116 },
};
