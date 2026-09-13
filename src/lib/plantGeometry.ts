import { BufferGeometry, CatmullRomCurve3, Euler, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TaperedTubeGeometry } from "./TaperedTubeGeometry";

export type BranchPoint = { position: Vector3; normal: Vector3; girth: number };
export type UpwardBranchPoint = {
  startPoint: Vector3;
  endPoint: Vector3;
  normal: Vector3;
  girth: number;
};
export type LeafTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

/**
 * The 2024 version took a seed and ignored it, calling Math.random directly, so
 * the slider only ever acted as a reroll and the plant differed between server
 * and client. This is a real seeded generator, so a given seed always grows the
 * same plant and rerolling still works by changing it.
 */
export function makeRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export function generateRandomCurve(
  amount: number,
  start: Vector3,
  end: Vector3,
  maxDeviation: number,
  random: () => number,
): CatmullRomCurve3 {
  const points: Vector3[] = [];

  for (let i = 0; i < amount; i++) {
    const t = i / (amount - 1);
    const y = start.y + t * (end.y - start.y);

    // Deviation grows with height, so the base stays planted and the tip leans.
    const deviationStrength = t * maxDeviation;

    points.push(
      new Vector3(
        (random() - 0.5) * 2 * deviationStrength,
        y,
        (random() - 0.5) * 2 * deviationStrength,
      ),
    );
  }

  return new CatmullRomCurve3(points);
}

export function generateRandomCurveInDirection(
  amount: number,
  start: Vector3,
  end: Vector3,
  normal: Vector3,
  maxDeviation: number,
  random: () => number,
): CatmullRomCurve3 {
  const points: Vector3[] = [];

  const normalizedNormal = normal.clone().normalize();
  const direction = end.clone().sub(start).normalize();

  const perpendicular = new Vector3()
    .crossVectors(normalizedNormal, direction)
    .normalize();
  const perpendicular2 = new Vector3()
    .crossVectors(perpendicular, direction)
    .normalize();

  for (let i = 0; i < amount; i++) {
    const t = i / (amount - 1);
    const basePoint = new Vector3().lerpVectors(start, end, t);
    const deviationStrength = t * maxDeviation;

    points.push(
      basePoint
        .add(perpendicular.clone().multiplyScalar((random() - 0.5) * 2 * deviationStrength))
        .add(perpendicular2.clone().multiplyScalar((random() - 0.5) * 2 * deviationStrength)),
    );
  }

  return new CatmullRomCurve3(points);
}

/** Girth tapers along the tube's u coordinate, matching the stem's own taper. */
function calculateGirth(u: number, startRadius: number, endRadius: number) {
  return startRadius - u * (startRadius - endRadius);
}

/** Pick vertices off the stem to sprout branches from, skipping base and tip. */
export function getRandomNormalPointsAndDirection(
  geometry: BufferGeometry,
  numRandomPoints: number,
  baseRadius: number,
  tipRadius: number,
  random: () => number,
): BranchPoint[] {
  const position = new Vector3();
  const normal = new Vector3();

  const positionAttribute = geometry.getAttribute("position");
  const normalAttribute = geometry.getAttribute("normal");
  const uvAttribute = geometry.getAttribute("uv");
  const vertexCount = positionAttribute.count;

  const randomPoints: BranchPoint[] = [];

  for (let i = 0; i < numRandomPoints; i++) {
    const randomIndex = Math.floor(random() * vertexCount);

    position.fromBufferAttribute(positionAttribute, randomIndex);
    normal.fromBufferAttribute(normalAttribute, randomIndex);

    if (position.y < 0.2) continue;
    if (position.length() < 0.05) continue;
    if (position.y > 0.95) continue;

    normal.normalize();

    randomPoints.push({
      position: position.clone(),
      normal: normal.clone(),
      girth: calculateGirth(uvAttribute.getX(randomIndex), baseRadius, tipRadius),
    });
  }

  return randomPoints;
}

/** Turn each branch point into a start and end, angled upward off the stem. */
export function getPointsWithUpwardDirection(
  points: BranchPoint[],
  directionLength = 0.3,
): UpwardBranchPoint[] {
  return points.map(({ position, normal, girth }) => {
    const upwardDirection = normal.clone();

    // Force some lift, so a branch off the underside still grows up.
    upwardDirection.y = Math.max(0.5, upwardDirection.y);
    upwardDirection.normalize();

    return {
      // Sink the start inside the stem so the join does not float.
      startPoint: position.clone().add(normal.clone().multiplyScalar(-girth / 1.5)),
      endPoint: position.clone().add(upwardDirection.multiplyScalar(directionLength)),
      normal: normal.clone(),
      girth,
    };
  });
}

export const BRANCH_TUBULAR_SEGMENTS = 10;
export const BRANCH_RADIAL_SEGMENTS = 12;
export const BRANCH_TIP_RADIUS = 0.003;

/**
 * A branch's curve and taper, kept alongside the merged geometry. A leaf is
 * stored as an address on one of these (branch index, t along the curve, angle
 * around the tube) rather than as a world point, so `triangleOffset` is what
 * turns a raycast faceIndex back into a branch. See lib/leafAddress.ts.
 */
export type BranchSpec = {
  curve: CatmullRomCurve3;
  baseRadius: number;
  tipRadius: number;
  /** First triangle of this branch in the merged geometry's draw order. */
  triangleOffset: number;
};

export function createBranches(
  upwardPoints: UpwardBranchPoint[],
  random: () => number,
): { geometry: BufferGeometry; branches: BranchSpec[] } {
  const branches: BranchSpec[] = [];
  let triangleOffset = 0;

  const branchesGeometries = upwardPoints.map((point) => {
    const curve = generateRandomCurveInDirection(
      4,
      point.startPoint,
      point.endPoint,
      point.normal,
      0.04,
      random,
    );
    const baseRadius = point.girth - 0.001;
    const geometry = new TaperedTubeGeometry(
      curve,
      BRANCH_TUBULAR_SEGMENTS,
      baseRadius,
      BRANCH_TIP_RADIUS,
      BRANCH_RADIAL_SEGMENTS,
    );

    branches.push({ curve, baseRadius, tipRadius: BRANCH_TIP_RADIUS, triangleOffset });

    const index = geometry.getIndex();
    triangleOffset += index
      ? index.count / 3
      : geometry.getAttribute("position").count / 3;

    return geometry;
  });

  return { geometry: mergeGeometries(branchesGeometries), branches };
}

export function createBranchesGeometry(
  upwardPoints: UpwardBranchPoint[],
  random: () => number,
): BufferGeometry {
  return createBranches(upwardPoints, random).geometry;
}

const UP = new Vector3(0, 1, 0);

/** Orient a leaf to the surface normal of the nearest branch vertex. */
export function createLeafTransformsFromPositions(
  leavesPositions: Vector3[],
  branches: BufferGeometry,
): LeafTransform[] {
  const normalAttribute = branches.getAttribute("normal");
  const positionAttribute = branches.getAttribute("position");
  const vertex = new Vector3();

  return leavesPositions.map((leafPos) => {
    let closestIndex = 0;
    let minDist = Infinity;

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      const dist = vertex.distanceTo(leafPos);
      if (dist < minDist) {
        minDist = dist;
        closestIndex = i;
      }
    }

    const normal = new Vector3().fromBufferAttribute(normalAttribute, closestIndex);
    const quaternion = new Quaternion().setFromUnitVectors(UP, normal);

    return {
      position: leafPos.toArray() as [number, number, number],
      rotation: new Euler().setFromQuaternion(quaternion).toArray().slice(0, 3) as [
        number,
        number,
        number,
      ],
      scale: [1, 1, 1],
    };
  });
}

/** Scatter leaves over the branches, thinning them out near the very tips. */
export function createRandomLeafTransforms(
  geometry: BufferGeometry,
  count: number,
  random: () => number,
): LeafTransform[] {
  const transforms: LeafTransform[] = [];
  const position = new Vector3();
  const quaternion = new Quaternion();

  const positionAttribute = geometry.getAttribute("position");
  const normalAttribute = geometry.getAttribute("normal");
  const vertexCount = positionAttribute.count;

  let maxY = 0;
  for (let i = 0; i < vertexCount; i++) {
    maxY = Math.max(maxY, positionAttribute.getY(i));
  }

  let leafCount = 0;
  let attempts = 0;
  const maxAttempts = count * 3;

  while (leafCount < count && attempts < maxAttempts) {
    attempts++;
    const vertexIndex = Math.floor(random() * vertexCount);
    position.fromBufferAttribute(positionAttribute, vertexIndex);
    const normal = new Vector3().fromBufferAttribute(normalAttribute, vertexIndex);

    if (position.y < 0.2) continue;
    if (position.length() < 0.05) continue;

    const tipFactor = position.y / maxY;
    if (tipFactor > 0.95 && random() > 0.1) continue;

    quaternion.setFromUnitVectors(UP, normal);

    transforms.push({
      position: position.toArray() as [number, number, number],
      rotation: new Euler().setFromQuaternion(quaternion).toArray().slice(0, 3) as [
        number,
        number,
        number,
      ],
      scale: [1, 1, 1],
    });

    leafCount++;
  }

  return transforms;
}
