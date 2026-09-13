"use client";

import { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { PlacedLeaf } from "@/lib/leaf";
import {
  type LeafAddress,
  addressFromHit,
  addressesToTransforms,
  addressToPosition,
  resolveSpacing,
} from "@/lib/leafAddress";
import type { Tree } from "@/lib/tree";
import HoverSphere from "./HoverSphere";
import Leaves from "./Leaves";
import { createGlassMaterial } from "./materials";
import { useClickGuard } from "./useClickGuard";

const NO_HOVER = new THREE.Vector3();

/**
 * Presentational. It grows nothing and stores nothing: the tree comes in as
 * geometry, the leaves come in as addresses, and placing one is reported
 * upward. Live, archive and sandbox are all this component with different
 * props, which is what stops the sandbox drifting away from the real scene.
 */
export default function Plant({
  tree,
  leaves,
  pending,
  alphaMap,
  scatter = false,
  interactive = true,
  onPlace,
  onSelect,
  onCrowded,
}: {
  tree: Tree;
  leaves: PlacedLeaf[];
  pending?: PlacedLeaf | null;
  alphaMap: THREE.Texture;
  scatter?: boolean;
  interactive?: boolean;
  onPlace?: (address: LeafAddress) => void;
  onSelect?: (leaf: PlacedLeaf) => void;
  onCrowded?: () => void;
}) {
  const [hoverPosition, setHoverPosition] = useState(NO_HOVER);
  const guard = useClickGuard();

  const material = useMemo(() => createGlassMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const visible = useMemo(
    () => (pending ? [...leaves, pending] : leaves),
    [leaves, pending],
  );

  const occupied = useMemo(() => visible.map((leaf) => leaf.address), [visible]);

  const transforms = useMemo(
    () =>
      scatter
        ? tree.scattered
        : addressesToTransforms(occupied, tree.branches),
    [scatter, tree, occupied],
  );

  /**
   * Resolve the hit the same way on hover and on click, so the bead sits where
   * the leaf will actually land once spacing has pushed it clear of its
   * neighbours. Without the preview the nudge reads as the leaf jumping out
   * from under the cursor.
   */
  const resolve = (e: ThreeEvent<PointerEvent>): LeafAddress | null => {
    if (e.faceIndex === undefined || e.faceIndex === null) return null;
    const hit = addressFromHit(tree.branches, e.faceIndex, e.point);
    if (!hit) return null;
    return resolveSpacing(hit, occupied, tree.branches);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!interactive) return;

    const address = resolve(e);
    const position = address && addressToPosition(address, tree.branches);
    setHoverPosition(position ?? NO_HOVER);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!interactive || !onPlace) return;
    if (!guard.isClick(e)) return;

    const address = resolve(e);
    if (!address) {
      onCrowded?.();
      return;
    }

    onPlace(address);
  };

  return (
    <group>
      <mesh castShadow receiveShadow geometry={tree.stemGeometry} material={material} />
      <mesh
        castShadow
        receiveShadow
        geometry={tree.branchesGeometry}
        material={material}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => guard.onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerOut={() => setHoverPosition(NO_HOVER)}
        onPointerUp={onPointerUp}
      />
      <HoverSphere position={hoverPosition} />
      <Leaves
        transforms={transforms}
        alphaMap={alphaMap}
        pendingIndex={pending && !scatter ? visible.length - 1 : null}
        onSelect={
          scatter || !onSelect
            ? undefined
            : (index) => {
                const leaf = visible[index];
                if (leaf && !leaf.pending) onSelect(leaf);
              }
        }
      />
    </group>
  );
}
