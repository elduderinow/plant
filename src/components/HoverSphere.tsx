"use client";

import { useEffect, useMemo } from "react";
import { Color, Vector3 } from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";

/**
 * A tiny emissive bead that sits wherever the pointer touches a branch, with a
 * short-range point light so it reads as glowing rather than painted on.
 *
 * Materials are constructed here rather than declared as JSX. Node materials
 * are not part of r3f's default catalogue, and passing an instance avoids both
 * the extend() call and hand-written JSX typings for every node material.
 */
export default function HoverSphere({ position }: { position: Vector3 }) {
  const material = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    m.color = new Color("#ea7814");
    m.emissive = new Color("#ea7814");
    m.emissiveIntensity = 5;
    return m;
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <group>
      <mesh position={position} material={material}>
        <sphereGeometry args={[0.002, 16, 16]} />
      </mesh>
      <pointLight
        position={position}
        decay={0.5}
        distance={0.05}
        color="#ea7814"
        intensity={15}
      />
    </group>
  );
}
