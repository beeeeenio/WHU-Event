import type { FootType, StructureTypeId } from './types';

export interface StructureRules {
  /** Auswählbare Aufbauhöhen in cm. */
  heightOptionsCm: number[];
  /** Höhe (cm), ab der ein Geländer laut DGUV Pflicht ist. undefined = nie Pflicht. */
  railingRequiredFromCm?: number;
  /** Höhe (cm), ab der eine Diagonalverstrebung nötig ist (>=80cm, laut Aufbauregeln 2.2). */
  bracingRequiredFromCm?: number;
  /** Höhe (cm), ÜBER der zusätzlich eine Horizontalverstrebung nötig ist (>140cm, laut Aufbauregeln 2.3) — NICHT immer verbaut. */
  horizontalBracingAboveCm?: number;
  /** Darf der Nutzer einzelne Geländerseiten an-/abwählen? */
  railingConfigurable: boolean;
}

/**
 * Regeln je Aufbautyp, nach NivTec "Aufbauregeln in ihrer einfachsten Form" (Kap. 2):
 * 2.1 Bühnen < 80cm: keine Verstrebung. 2.2 Bühnen 80–140cm: nur Diagonalverstrebung.
 * 2.3 Bühnen >140–200cm: Horizontal- UND Diagonalverstrebung. Bühne/Tribüne/Tresen-
 * Unterbau nutzen dieselbe Höhenserie (Alu-Lastenverteilerfuß, 20–200 cm in 20-cm-
 * Schritten) — es gibt KEINEN Wechsel auf einen anderen Fußtyp ab einer bestimmten
 * Höhe; die Spindel (VS-Fuß) ist kein "Hochstand"-Ersatz, sondern wird gezielt für
 * Treppenstufen zum Höhenausgleich eingesetzt (siehe stairs.ts).
 */
export const STRUCTURE_RULES: Record<StructureTypeId, StructureRules> = {
  buehne: {
    heightOptionsCm: [20, 40, 60, 80, 100, 120, 140, 160, 180, 200],
    railingRequiredFromCm: 100,
    bracingRequiredFromCm: 80,
    horizontalBracingAboveCm: 140,
    railingConfigurable: true,
  },
  tribuene: {
    heightOptionsCm: [20, 40, 60, 80, 100, 120, 140, 160, 180, 200],
    railingRequiredFromCm: 100,
    bracingRequiredFromCm: 80,
    horizontalBracingAboveCm: 140,
    railingConfigurable: true,
  },
  tisch: {
    heightOptionsCm: [74, 90],
    railingConfigurable: false,
  },
  // Tresen-Unterbau ist ein normales Bühnenpodest — gleiche Höhenserie/Regeln.
  tresen: {
    heightOptionsCm: [20, 40, 60, 80, 100, 120, 140, 160, 180, 200],
    bracingRequiredFromCm: 80,
    horizontalBracingAboveCm: 140,
    railingConfigurable: true,
  },
};

/** Immer 'fest' (Alu-Lastenverteilerfuß) — die Höhenserie deckt 20–200 cm durchgängig ab. */
export function footTypeForHeight(_structureType: StructureTypeId, _heightCm: number): FootType {
  return 'fest';
}

export function isRailingRequired(structureType: StructureTypeId, heightCm: number): boolean {
  const threshold = STRUCTURE_RULES[structureType].railingRequiredFromCm;
  return threshold !== undefined && heightCm >= threshold;
}

export function isBracingRequired(structureType: StructureTypeId, heightCm: number): boolean {
  const threshold = STRUCTURE_RULES[structureType].bracingRequiredFromCm;
  return threshold !== undefined && heightCm >= threshold;
}

/** Zusätzlich zur Diagonalverstrebung: Horizontalverstrebung ist nur ÜBER 140cm nötig, nicht immer. */
export function isHorizontalBracingRequired(structureType: StructureTypeId, heightCm: number): boolean {
  const threshold = STRUCTURE_RULES[structureType].horizontalBracingAboveCm;
  return threshold !== undefined && heightCm > threshold;
}
