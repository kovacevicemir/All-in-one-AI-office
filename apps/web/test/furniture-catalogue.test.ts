import { describe, expect, it } from 'vitest';
import { FURNITURE_KINDS } from '../src/office/floorplan.js';
import {
  CATALOGUE_KINDS,
  FURNITURE_CATALOGUE,
  catalogueLabel,
} from '../src/office/furniture-catalogue.js';

describe('furniture catalogue', () => {
  it('lists every existing kind exactly once and nothing else', () => {
    const listed = FURNITURE_CATALOGUE.flatMap((group) => group.kinds);
    expect([...listed].sort()).toEqual([...FURNITURE_KINDS].sort());
    expect(new Set(listed).size).toBe(listed.length);
    expect(CATALOGUE_KINDS).toEqual(listed);
  });

  it('gives every group an id, a label and at least one kind', () => {
    for (const group of FURNITURE_CATALOGUE) {
      expect(group.id.length).toBeGreaterThan(0);
      expect(group.label.length).toBeGreaterThan(0);
      expect(group.kinds.length).toBeGreaterThan(0);
    }
  });

  it('labels a kind for the palette', () => {
    expect(catalogueLabel('whiteboard')).toBe('Whiteboard');
    expect(catalogueLabel('rug')).toBe('Rug');
  });
});
