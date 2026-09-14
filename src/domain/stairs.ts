import type { RampResult, StairsResult } from './types';

/** Stufenhöhe laut NivTec-Anleitung (Teil II/III): Standard-Steigung 20 cm pro Stufe. */
export const STEP_HEIGHT_CM = 20;
/** Auftrittstiefe laut NivTec-Anleitung (Teil III, S. 7–9 / Teil IV, S. 17–18): 35 cm. */
export const STEP_DEPTH_M = 0.35;
/** Übliches Neigungsverhältnis für barrierefreie Eventrampen (1:12 nach DIN 18040). */
export const DEFAULT_INCLINE_RATIO = 12;

export function computeStairs(heightCm: number, stepHeightCm: number = STEP_HEIGHT_CM): StairsResult {
  const stepCount = heightCm <= 0 ? 0 : Math.max(1, Math.round(heightCm / stepHeightCm));
  return { heightCm, stepCount, stepHeightCm, stepDepthM: STEP_DEPTH_M };
}

export function computeRamp(heightCm: number, inclineRatio: number = DEFAULT_INCLINE_RATIO): RampResult {
  const lengthM = Math.round(((heightCm / 100) * inclineRatio) * 100) / 100;
  return { heightCm, inclineRatio, lengthM };
}
