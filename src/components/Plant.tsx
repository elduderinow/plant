"use client";

import { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  createBranchesGeometry,
  createLeafTransformsFromPositions,
  createRandomLeafTransforms,
  generateRandomCurve,
  getPointsWithUpwardDirection,
  getRandomNormalPointsAndDirection,
  makeRandom,
} from "@/lib/plantGeometry";
import { TaperedTubeGeometry } from "@/lib/TaperedTubeGeometry";
import HoverSphere from "./HoverSphere";
import Leaves from "./Leaves";
import { createGlassMaterial } from "./materials";

const STARTPOINT = new THREE.Vector3(0, 0, 0);
const ENDPOINT = new THREE.Vector3(0, 1, 0);
const STEM_BASE_RADIUS = 0.02;
const STEM_TIP_RADIUS = 0.003;

const NO_HOVER = new THREE.Vector3();

export default function Plant({
  seed,
  branchCount,
  randomLeaves,
  alphaMap,
}: {
  seed: number;
  branchCount: number;
  randomLeaves: boolean;
  alphaMap: THREE.Texture;
}) {
  const [hoverPosition, setHoverPosition] = useState(NO_HOVER);
  const [leafPositions, setLeafPositions] = useState<THREE.Vector3[]>([]);

  const { stemGeometry, branchesGeometry, scattered } = useMemo(() => {
    // One generator for the whole plant, so every stage of the build advances
    // the same stream and the seed reproduces the plant exactly.
    const random = makeRandom(seed);

    const mainCurve = generateRandomCurve(4, STARTPOINT, ENDPOINT, 0.1, random);

    const stem = new TaperedTubeGeometry(
      mainCurve,
      10,
      STEM_BASE_RADIUS,
      STEM_TIP_RADIUS,
      12,
    );
    stem.computeVertexNormals();

    const branchPoints = getRandomNormalPointsAndDirection(
      stem,
      branchCount,
      STEM_BASE_RADIUS,
      STEM_TIP_RADIUS,
      random,
    );
    const upward = getPointsWithUpwardDirection(branchPoints, 0.3);
    const branches = createBranchesGeometry(upward, random);

    return {
      stemGeometry: stem,
      branchesGeometry: branches,
      scattered: createRandomLeafTransforms(branches, 100, random),
    };
  }, [seed, branchCount]);

  // A fresh plant invalidates any leaves placed on the old one.
  useEffect(() => setLeafPositions([]), [seed, branchCount]);

  useEffect(() => {
    return () => {
      stemGeometry.dispose();
      branchesGeometry.dispose();
    };
  }, [stemGeometry, branchesGeometry]);

  const material = useMemo(() => createGlassMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const placedLeaves = useMemo(
    () => createLeafTransformsFromPositions(leafPositions, branchesGeometry),
    [leafPositions, branchesGeometry],
  );

  /**
   * The 2024 version read the array, dropped its last entry and appended the
   * new point:
   *
   *   currentPositions.length > 0 ? [...currentPositions.slice(0, -1), e.point] : [e.point]
   *
   * which pins the array at one leaf forever, so clicking only ever slid a
   * single leaf around the plant. The store persists the array and the scene
   * calls it leavePositions, so accumulating is clearly what was meant. Leaves
   * accumulate here. Drop the slice back in if the original behaviour is wanted.
   */
  const addLeaf = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setLeafPositions((prev) => [...prev, e.point.clone()]);
  };

  return (
    <group>
      <mesh castShadow receiveShadow geometry={stemGeometry} material={material} />
      <mesh
        castShadow
        receiveShadow
        geometry={branchesGeometry}
        material={material}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHoverPosition(e.point.clone());
        }}
        onPointerOut={() => setHoverPosition(NO_HOVER)}
        onPointerUp={addLeaf}
      />
      <HoverSphere position={hoverPosition} />
      <Leaves transforms={randomLeaves ? scattered : placedLeaves} alphaMap={alphaMap} />
    </group>
  );
}
