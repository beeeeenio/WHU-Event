import PptxGenJS from 'pptxgenjs';
import type { LabeledFootPosition } from '../domain/feet';
import { footColorForHeight } from '../domain/footColorScale';
import type { LayoutResult, TriangleCorner } from '../domain/types';
import { CI_PPTX_LOGOS, type CiId } from './ci';

/**
 * PowerPoints eingebautes "rtTriangle"-Autoshape hat bei rot=0° den rechten Winkel laut
 * DrawingML-Preset-Geometrie unten-links (bl) — Rotation ist in PowerPoint (wie in diesem Tool)
 * im Uhrzeigersinn positiv, daher rückt der rechte Winkel je 90° eine Ecke im Uhrzeigersinn
 * weiter (bl→tl→tr→br). Nicht mit Rendern verifiziert (nur die erzeugte XML-Struktur per
 * Bash/unzip) — falls die Ecke im echten PowerPoint doch nicht stimmt, hier korrigieren.
 */
const TRIANGLE_ROTATION_DEG: Record<TriangleCorner, number> = { bl: 0, tl: 90, tr: 180, br: 270 };

const SLIDE_WIDTH_IN = 13.33;
const SLIDE_HEIGHT_IN = 7.5;
const MARGIN_IN = 0.6;
const TITLE_H_IN = 0.5;
const SECTION_LABEL_H_IN = 0.3;
const SECTION_GAP_IN = 0.4;

const PANEL_FILL = '2C3E6B';
const PANEL_SONDERMASS_FILL = '9A6B00';
const PANEL_LINE = '061638';

function toHex(color: string): string {
  return color.replace('#', '').toUpperCase();
}

export interface PptxSection {
  layout: LayoutResult;
  feet: LabeledFootPosition[];
  heightCm: number;
  /** Beschriftung über diesem Abschnitt, z.B. "Unterbau" / "Thekenplatte (oben)". */
  label: string;
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zeichnet einen Grundriss (Platten als Rechteck-Shapes, Füße als Kreis-Shapes) skaliert in einen Bereich der Folie. */
function drawSection(slide: PptxGenJS.Slide, section: PptxSection, region: Region): void {
  const { layout, feet, heightCm, label } = section;
  if (layout.widthM <= 0 || layout.depthM <= 0) return;

  const dims = `${layout.widthM.toFixed(2)} × ${layout.depthM.toFixed(2)} m, BH ${heightCm} cm`;
  slide.addText(label ? `${label} — ${dims}` : dims, {
    x: region.x,
    y: region.y,
    w: region.w,
    h: SECTION_LABEL_H_IN,
    fontSize: 12,
    bold: true,
    color: '061638',
    fontFace: 'Arial',
  });

  const drawableY = region.y + SECTION_LABEL_H_IN;
  const drawableH = region.h - SECTION_LABEL_H_IN;
  const scale = Math.min(region.w / layout.widthM, drawableH / layout.depthM);
  const drawnW = layout.widthM * scale;
  const drawnH = layout.depthM * scale;
  const offsetX = region.x + (region.w - drawnW) / 2;
  const offsetY = drawableY + (drawableH - drawnH) / 2;

  for (const p of layout.panels) {
    if (p.corner !== undefined) {
      slide.addShape('rtTriangle', {
        x: offsetX + p.x * scale,
        y: offsetY + p.y * scale,
        w: p.w * scale,
        h: p.d * scale,
        rotate: TRIANGLE_ROTATION_DEG[p.corner],
        fill: { color: PANEL_FILL },
        line: { color: PANEL_LINE, width: 1 },
      });
      continue;
    }
    slide.addShape('rect', {
      x: offsetX + p.x * scale,
      y: offsetY + p.y * scale,
      w: p.w * scale,
      h: p.d * scale,
      fill: { color: p.isSondermass ? PANEL_SONDERMASS_FILL : PANEL_FILL },
      line: { color: PANEL_LINE, width: 1 },
    });
  }

  const footColor = toHex(footColorForHeight(heightCm));
  const footDiameterIn = Math.max(0.07, Math.min(0.3, 0.16 * scale));
  for (const f of feet) {
    slide.addShape('ellipse', {
      x: offsetX + f.renderX * scale - footDiameterIn / 2,
      y: offsetY + f.renderY * scale - footDiameterIn / 2,
      w: footDiameterIn,
      h: footDiameterIn,
      fill: { color: footColor },
      line: { color: '000000', width: 0.5 },
    });
  }
}

function newSlide(pptx: PptxGenJS): PptxGenJS.Slide {
  pptx.defineLayout({ name: 'NIVTEC_WIDE', width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = 'NIVTEC_WIDE';
  return pptx.addSlide();
}

function addMainTitle(slide: PptxGenJS.Slide, title: string, availableW: number): void {
  slide.addText(title, {
    x: MARGIN_IN,
    y: 0.2,
    w: availableW,
    h: TITLE_H_IN,
    fontSize: 16,
    bold: true,
    color: '061638',
    fontFace: 'Arial',
  });
}

/**
 * Platziert das Logo der aktuell aktiven CI oben rechts auf der Folie — dieselbe Initiative, die
 * gerade im Tool ausgewählt ist. CFF hat nur eine weiße Wortmarke (siehe CI_PPTX_LOGOS), die auf
 * einer weißen Folie sonst unsichtbar wäre, deshalb bekommt sie hier ihren eigenen Deep-Navy-Chip.
 */
function addCiLogo(slide: PptxGenJS.Slide, ci: CiId): void {
  const logo = CI_PPTX_LOGOS[ci];
  const heightIn = 0.4;
  const widthIn = heightIn * logo.aspectRatio;
  const x = SLIDE_WIDTH_IN - MARGIN_IN - widthIn;
  const y = 0.15;

  if (logo.slideChipColorHex) {
    const paddingIn = 0.08;
    slide.addShape('roundRect', {
      x: x - paddingIn,
      y: y - paddingIn,
      w: widthIn + paddingIn * 2,
      h: heightIn + paddingIn * 2,
      rectRadius: 0.06,
      fill: { color: logo.slideChipColorHex },
      line: { color: logo.slideChipColorHex, width: 0 },
    });
  }

  slide.addImage({ path: logo.imagePath, x, y, w: widthIn, h: heightIn });
}

/**
 * Exportiert einen einzelnen Grundriss als editierbare PowerPoint-Folie: jede Platte
 * ist ein eigenes Rechteck-Shape, jeder Fuß ein eigenes Kreis-Shape (Farbe nach
 * Fußhöhe, siehe footColorScale) — beides in PowerPoint frei verschiebbar/anpassbar.
 */
export async function exportLayoutAsPptx(
  layout: LayoutResult,
  feet: LabeledFootPosition[],
  heightCm: number,
  filename: string,
  ci: CiId,
  title = 'Grundrissplan',
): Promise<void> {
  const pptx = new PptxGenJS();
  const slide = newSlide(pptx);
  const availableW = SLIDE_WIDTH_IN - MARGIN_IN * 2;
  const availableH = SLIDE_HEIGHT_IN - MARGIN_IN * 2 - TITLE_H_IN;

  addMainTitle(slide, title, availableW);
  addCiLogo(slide, ci);
  drawSection(
    slide,
    { layout, feet, heightCm, label: '' },
    { x: MARGIN_IN, y: MARGIN_IN + TITLE_H_IN, w: availableW, h: availableH },
  );

  await pptx.writeFile({ fileName: filename });
}

/**
 * Exportiert mehrere Grundriss-Abschnitte nebeneinander auf einer Folie (z.B.
 * Tresen-Unterbau + Thekenplatte) — genau wie die 2D-Ansicht im Tool sie
 * nebeneinander zeigt.
 */
export async function exportSectionsAsPptx(
  sections: PptxSection[],
  filename: string,
  ci: CiId,
  title: string,
): Promise<void> {
  const pptx = new PptxGenJS();
  const slide = newSlide(pptx);
  const availableW = SLIDE_WIDTH_IN - MARGIN_IN * 2;
  const availableH = SLIDE_HEIGHT_IN - MARGIN_IN * 2 - TITLE_H_IN;

  addMainTitle(slide, title, availableW);
  addCiLogo(slide, ci);

  const count = Math.max(1, sections.length);
  const sectionW = (availableW - SECTION_GAP_IN * (count - 1)) / count;

  sections.forEach((section, i) => {
    const x = MARGIN_IN + i * (sectionW + SECTION_GAP_IN);
    drawSection(slide, section, { x, y: MARGIN_IN + TITLE_H_IN, w: sectionW, h: availableH });
  });

  await pptx.writeFile({ fileName: filename });
}
