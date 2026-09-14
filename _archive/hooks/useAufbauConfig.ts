import { useMemo, useState } from 'react';
import { countFeet, footPositions, labeledFootPositions } from '../domain/feet';
import { computeLayout } from '../domain/layout';
import { buildMaterialList } from '../domain/materialList';
import {
  footTypeForHeight,
  isBracingRequired,
  isHorizontalBracingRequired,
  isRailingRequired,
  STRUCTURE_RULES,
} from '../domain/rules';
import type { RailingSide, StructureTypeId } from '../domain/types';

const ALL_SIDES: RailingSide[] = ['hinten', 'links', 'rechts', 'vorne'];

export interface AufbauConfigOptions {
  structureType: StructureTypeId;
  initialWidthM?: number;
  initialDepthM?: number;
}

/** Gemeinsamer State + Berechnung für alle Aufbautyp-Module (Bühne, Tisch, Tresen, je Tribünen-Reihe). */
export function useAufbauConfig({ structureType, initialWidthM = 4, initialDepthM = 2 }: AufbauConfigOptions) {
  const rules = STRUCTURE_RULES[structureType];
  const [widthM, setWidthM] = useState(initialWidthM);
  const [depthM, setDepthM] = useState(initialDepthM);
  const [heightCm, setHeightCm] = useState(rules.heightOptionsCm[0]);
  const [orientationOverride, setOrientationOverride] = useState<'normal' | 'rotiert' | null>(null);
  const [activeRailingSides, setActiveRailingSides] = useState<RailingSide[]>([]);

  const layoutComparison = useMemo(() => computeLayout(widthM, depthM), [widthM, depthM]);
  const orientation = orientationOverride ?? layoutComparison.recommended;
  const layout = orientation === 'normal' ? layoutComparison.normal : layoutComparison.rotiert;

  const totalFeet = useMemo(() => countFeet(layout.panels), [layout]);
  const feet = useMemo(() => footPositions(layout.panels), [layout]);
  const labeledFeet = useMemo(() => labeledFootPositions(layout.panels), [layout]);
  const footType = footTypeForHeight(structureType, heightCm);
  const railingRequired = isRailingRequired(structureType, heightCm);
  const bracingRequired = isBracingRequired(structureType, heightCm);
  const horizontalBracingRequired = isHorizontalBracingRequired(structureType, heightCm);

  const effectiveRailingSides = rules.railingConfigurable ? activeRailingSides : [];

  const materialList = useMemo(
    () =>
      buildMaterialList({
        structureType,
        layout,
        heightCm,
        activeRailingSides: effectiveRailingSides,
      }),
    [structureType, layout, heightCm, effectiveRailingSides],
  );

  function toggleRailingSide(side: RailingSide): void {
    setActiveRailingSides((prev) => (prev.includes(side) ? prev.filter((s) => s !== side) : [...prev, side]));
  }

  function selectAllRailingSides(): void {
    setActiveRailingSides(ALL_SIDES);
  }

  return {
    rules,
    widthM,
    setWidthM,
    depthM,
    setDepthM,
    heightCm,
    setHeightCm,
    orientation,
    setOrientation: setOrientationOverride,
    layoutComparison,
    layout,
    totalFeet,
    feet,
    labeledFeet,
    footType,
    railingRequired,
    bracingRequired,
    horizontalBracingRequired,
    activeRailingSides: effectiveRailingSides,
    toggleRailingSide,
    selectAllRailingSides,
    materialList,
  };
}

export type UseAufbauConfigReturn = ReturnType<typeof useAufbauConfig>;
