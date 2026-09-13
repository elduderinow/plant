"use client";

import { ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrigamiLeafGeometry } from "@/lib/OrigamiLeafGeometry";
import { LeafTransform } from "@/lib/plantGeometry";
import { createLeafMaterial } from "./materials";
import { useClickGuard } from "./useClickGuard";

const HOVER_COLOR = new THREE.Color("#a9ff30");
const BASE_COLOR = new THREE.Color("#ffffff");
/** The leaf placed but not yet confirmed, so it reads as not-yet-real. */
const PENDING_COLOR = new THREE.Color("#ea7814");

/**
 * The 2024 scene used drei's <Instances>/<Instance>, which patches per-instance
 * colour into the material with onBeforeCompile and so does not survive the
 * move to node materials. This drives an InstancedMesh directly instead, which
 * three's WebGPU path already understands, including instanceColor.
 */
export default function Leaves({
  transforms,
  alphaMap,
  pendingIndex = null,
  onSelect,
}: {
  transforms: LeafTransform[];
  alphaMap: THREE.Texture;
  pendingIndex?: number | null;
  onSelect?: (index: number) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const guard = useClickGuard();

  const geometry = useMemo(() => new OrigamiLeafGeometry(0.03, 20, 12, 0.01), []);
  const material = useMemo(() => createLeafMaterial(alphaMap), [alphaMap]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // The buffer is allocated once at the cap and only `count` of it is drawn, so
  // adding a leaf never reallocates.
  const capacity = 5000;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();

    transforms.forEach((t, i) => {
      position.fromArray(t.position);
      euler.fromArray(t.rotation);
      quaternion.setFromEuler(euler);
      scale.fromArray(t.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
      const color =
        i === pendingIndex ? PENDING_COLOR : hovered === i ? HOVER_COLOR : BASE_COLOR;
      mesh.setColorAt(i, color);
    });

    mesh.count = transforms.length;
    mesh.instanceMatrix.needsUpdate = true;
    // InstancedMesh.raycast tests this sphere first and caches it forever. It
    // is computed while every instance is still at the origin, so without this
    // no leaf is ever clickable.
    mesh.computeBoundingSphere();
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [transforms, hovered, pendingIndex]);

  useEffect(() => {
    document.body.style.cursor = hovered === null ? "default" : "pointer";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [hovered]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, capacity]}
      castShadow
      receiveShadow
      frustumCulled={false}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) setHovered(e.instanceId);
      }}
      onPointerOut={() => setHovered(null)}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (!onSelect) return;
        e.stopPropagation();
        guard.onPointerDown(e);
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        if (!onSelect) return;
        // Reading a leaf must never also place one, so the branch mesh below
        // never sees this event.
        e.stopPropagation();
        if (!guard.isClick(e)) return;
        if (e.instanceId !== undefined) onSelect(e.instanceId);
      }}
    />
  );
}
