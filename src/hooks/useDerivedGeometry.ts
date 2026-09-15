import { useMemo } from 'react';
import { countFeet, footPositions, labeledFootPositions } from '../domain/feet';
import { buildMaterialList } from '../domain/materialList';
import type { LayoutResult, RailingSide, StructureTypeId } from '../domain/types';

/**
 * Berechnet Füße und Materialliste aus einem BELIEBIGEN LayoutResult — egal ob es aus
 * Breite/Tiefe (computeLayout) oder aus frei zusammengestellten Reihen (buildLayoutFromRows)
 * stammt. Genau das, was Bühne/Tresen/Tribüne bisher je einzeln von Hand nachgebaut haben.
 */
export function useDerivedGeometry(
  layout: LayoutResult,
  structureType: StructureTypeId,
  heightCm: number,
  activeRailingSides: RailingSide[],
) {
  const totalFeet = useMemo(() => countFeet(layout.panels), [layout]);
  const feet = useMemo(() => footPositions(layout.panels), [layout]);
  const labeledFeet = useMemo(() => labeledFootPositions(layout.panels, heightCm), [layout, heightCm]);
  const materialList = useMemo(
    () => buildMaterialList({ structureType, layout, heightCm, activeRailingSides }),
    [structureType, layout, heightCm, activeRailingSides],
  );

  return { totalFeet, feet, labeledFeet, materialList };
}
