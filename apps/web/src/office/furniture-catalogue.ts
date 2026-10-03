import type { FurnitureKind } from './floorplan.js';

export interface CatalogueGroup {
  id: string;
  label: string;
  kinds: FurnitureKind[];
}

/**
 * The existing procedural kit, grouped for the palette. Every `FurnitureKind`
 * appears exactly once; no new model, texture, or external asset is introduced.
 */
export const FURNITURE_CATALOGUE: CatalogueGroup[] = [
  { id: 'seating', label: 'Seating', kinds: ['chair', 'stool'] },
  { id: 'desks', label: 'Desks', kinds: ['desk', 'table'] },
  { id: 'tech', label: 'Tech', kinds: ['monitor', 'printer'] },
  { id: 'decor', label: 'Decor', kinds: ['rug', 'calendar', 'whiteboard', 'poster'] },
  { id: 'plants', label: 'Plants', kinds: ['plant'] },
  { id: 'shared', label: 'Shared', kinds: ['cabinet', 'bookshelf', 'cooler'] },
];

/** Every kind in the palette, in catalogue order. */
export const CATALOGUE_KINDS: FurnitureKind[] = FURNITURE_CATALOGUE.flatMap(
  (group) => group.kinds,
);

export function catalogueLabel(kind: FurnitureKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
