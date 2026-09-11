"use client";

import { ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrigamiLeafGeometry } from "@/lib/OrigamiLeafGeometry";
import { LeafTransform } from "@/lib/plantGeometry";
import { createLeafMaterial } from "./materials";

const HOVER_COLOR = new THREE.Color("#a9ff30");
const BASE_COLOR = new THREE.Color("#ffffff");

/**
 * The 2024 scene used drei's <Instances>/<Instance>, which patches per-instance
 * colour into the material with onBeforeCompile and so does not survive the
 * move to node materials. This drives an InstancedMesh directly instead, which
 * three's WebGPU path already understands, including instanceColor.
 */
export default function Leaves({
  transforms,
  alphaMap,
}: {
  transforms: LeafTransform[];
  alphaMap: THREE.Texture;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);

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
      mesh.setColorAt(i, hovered === i ? HOVER_COLOR : BASE_COLOR);
    });

    mesh.count = transforms.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [transforms, hovered]);

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
    />
  );
}
