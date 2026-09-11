"use client";

import { CameraControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";

const TARGET = new THREE.Vector3(0, 0.6, 0);
const MAX_DISTANCE = 0.8;

/** Orbits a box around the plant so the camera cannot wander off it. */
const BOUNDARY = new THREE.Box3(
  new THREE.Vector3(-0.4, 0, -0.4),
  new THREE.Vector3(0.4, 1, 0.4),
);

export default function Controls() {
  const controlsRef = useRef<CameraControls>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const direction = new THREE.Vector3(1, -0.2, 1).sub(TARGET).normalize();
    const position = TARGET.clone().add(direction.multiplyScalar(MAX_DISTANCE));

    void controls.setLookAt(
      position.x,
      position.y,
      position.z,
      TARGET.x,
      TARGET.y,
      TARGET.z,
      false,
    );
    controls.setBoundary(BOUNDARY);
  }, []);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      maxPolarAngle={Math.PI / 1.5}
      minPolarAngle={Math.PI / 3.5}
      minDistance={0.3}
      maxDistance={MAX_DISTANCE}
      dampingFactor={0.5}
    />
  );
}
