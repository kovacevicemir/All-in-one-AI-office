import { useEffect, useRef } from 'react';
import type { Group, Material, Mesh } from 'three';
import { Furniture } from './furniture.js';
import type { Placement } from './floorplan.js';

/**
 * A translucent copy of a procedural model, used as the placement preview. It
 * renders the real `Furniture` dispatcher so the preview is exactly the item
 * that will be placed, and only overrides the materials to make it ghostly.
 */
export function GhostFurniture({ placement }: { placement: Placement }) {
  const group = useRef<Group>(null);

  useEffect(() => {
    group.current?.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh !== true) return;
      const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.transparent = true;
        material.opacity = 0.5;
        material.depthWrite = false;
      }
    });
  }, [placement.kind]);

  return (
    <group ref={group}>
      <Furniture placement={placement} />
    </group>
  );
}
