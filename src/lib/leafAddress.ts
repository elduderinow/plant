import { CatmullRomCurve3, Euler, Quaternion, Vector3 } from "three";
import {
  BRANCH_TUBULAR_SEGMENTS,
  type BranchSpec,
  type LeafTransform,
} from "./plantGeometry";

/**
 * A leaf is stored as a position on a branch, not as a world point: which
 * branch, how far along it, and which way round the tube.
 *
 * The 2024 scene kept the raw click point and re-derived the transform by
 * scanning every vertex of the merged branch geometry for the nearest one,
 * which is O(leaves x vertices) and reran for every leaf on every add. An
 * address is three small numbers, the transform comes straight off the curve,
 * and nudging a leaf that lands too close to its neighbours moves it *along the
 * branch* instead of off into space.
 */
export type LeafAddress = {
  branchIndex: number;
  /** Arc-length parameter along the branch curve, 0 at the stem, 1 at the tip. */
  t: number;
  /** Radians around the tube, in TubeGeometry's own convention. */
  angle: number;
};

/** Leaves never sit inside the stem, and never on the very tip cap. */
const T_MIN = 0.15;
const T_MAX = 0.97;

const UP = new Vector3(0, 1, 0);

/** TaperedTubeGeometry eases its radius with this, so the address must too. */
const smoothStep = (t: number) => t * t * (3 - 2 * t);

function radiusAt(branch: BranchSpec, t: number) {
  return branch.baseRadius + (branch.tipRadius - branch.baseRadius) * smoothStep(t);
}

type Frame = { tangent: Vector3; normal: Vector3; binormal: Vector3 };

/**
 * The frames TubeGeometry itself used, so a leaf lands on the rendered surface
 * rather than near it. They are only defined at segment boundaries, so an
 * address between two of them interpolates, the same way the tube's own quads
 * do.
 */
const frameCache = new WeakMap<CatmullRomCurve3, ReturnType<CatmullRomCurve3["computeFrenetFrames"]>>();

function frameAt(curve: CatmullRomCurve3, t: number): Frame {
  let frames = frameCache.get(curve);
  if (!frames) {
    frames = curve.computeFrenetFrames(BRANCH_TUBULAR_SEGMENTS, false);
    frameCache.set(curve, frames);
  }

  const scaled = Math.max(0, Math.min(1, t)) * BRANCH_TUBULAR_SEGMENTS;
  const i = Math.min(BRANCH_TUBULAR_SEGMENTS - 1, Math.floor(scaled));
  const f = scaled - i;

  return {
    tangent: frames.tangents[i].clone().lerp(frames.tangents[i + 1], f).normalize(),
    normal: frames.normals[i].clone().lerp(frames.normals[i + 1], f).normalize(),
    binormal: frames.binormals[i].clone().lerp(frames.binormals[i + 1], f).normalize(),
  };
}

/**
 * TubeGeometry builds a ring vertex at `-cos(v) * normal + sin(v) * binormal`.
 * Matching that exactly is what makes `angle` mean the same thing here as it
 * does in the geometry.
 */
function surfaceNormal(frame: Frame, angle: number) {
  return frame.normal
    .clone()
    .multiplyScalar(-Math.cos(angle))
    .add(frame.binormal.clone().multiplyScalar(Math.sin(angle)))
    .normalize();
}

export function addressToPosition(address: LeafAddress, branches: BranchSpec[]): Vector3 | null {
  const branch = branches[address.branchIndex];
  if (!branch) return null;

  const t = Math.max(0, Math.min(1, address.t));
  const frame = frameAt(branch.curve, t);
  const normal = surfaceNormal(frame, address.angle);

  return branch.curve.getPointAt(t).add(normal.multiplyScalar(radiusAt(branch, t)));
}

export function addressToTransform(
  address: LeafAddress,
  branches: BranchSpec[],
): LeafTransform | null {
  const branch = branches[address.branchIndex];
  if (!branch) return null;

  const t = Math.max(0, Math.min(1, address.t));
  const frame = frameAt(branch.curve, t);
  const normal = surfaceNormal(frame, address.angle);
  const position = branch.curve.getPointAt(t).add(normal.clone().multiplyScalar(radiusAt(branch, t)));

  const rotation = new Euler().setFromQuaternion(
    new Quaternion().setFromUnitVectors(UP, normal),
  );

  return {
    position: position.toArray() as [number, number, number],
    rotation: [rotation.x, rotation.y, rotation.z],
    scale: [1, 1, 1],
  };
}

export function addressesToTransforms(
  addresses: LeafAddress[],
  branches: BranchSpec[],
): LeafTransform[] {
  const transforms: LeafTransform[] = [];
  for (const address of addresses) {
    const transform = addressToTransform(address, branches);
    if (transform) transforms.push(transform);
  }
  return transforms;
}

/** Which branch owns a triangle of the merged geometry. */
function branchIndexForFace(branches: BranchSpec[], faceIndex: number): number {
  let low = 0;
  let high = branches.length - 1;
  let found = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (branches[mid].triangleOffset <= faceIndex) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

const COARSE_SAMPLES = 48;
const REFINE_STEPS = 24;

/** Nearest point on a curve to an arbitrary point: coarse scan, then bisect. */
function closestT(curve: CatmullRomCurve3, point: Vector3) {
  let best = 0;
  let bestDistance = Infinity;

  for (let i = 0; i <= COARSE_SAMPLES; i++) {
    const t = i / COARSE_SAMPLES;
    const distance = curve.getPointAt(t).distanceToSquared(point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = t;
    }
  }

  let low = Math.max(0, best - 1 / COARSE_SAMPLES);
  let high = Math.min(1, best + 1 / COARSE_SAMPLES);

  for (let i = 0; i < REFINE_STEPS; i++) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    if (curve.getPointAt(a).distanceToSquared(point) < curve.getPointAt(b).distanceToSquared(point)) {
      high = b;
    } else {
      low = a;
    }
  }

  return (low + high) / 2;
}

/** Turn a raycast hit on the merged branch geometry into an address. */
export function addressFromHit(
  branches: BranchSpec[],
  faceIndex: number,
  point: Vector3,
): LeafAddress | null {
  const branchIndex = branchIndexForFace(branches, faceIndex);
  const branch = branches[branchIndex];
  if (!branch) return null;

  const t = Math.max(T_MIN, Math.min(T_MAX, closestT(branch.curve, point)));

  const frame = frameAt(branch.curve, t);
  const offset = point.clone().sub(branch.curve.getPointAt(t));
  // Drop whatever part of the offset runs along the branch; the angle only
  // lives in the plane of the ring.
  offset.addScaledVector(frame.tangent, -offset.dot(frame.tangent));

  const angle = Math.atan2(offset.dot(frame.binormal), -offset.dot(frame.normal));

  return { branchIndex, t, angle };
}

/**
 * Closest two leaves may sit, in world units. The leaf geometry's radius is
 * 0.03, so this is roughly one and a half leaves apart. Tune it in the sandbox.
 */
export const MIN_SPACING = 0.045;

/** How far a leaf may be pushed from where it was clicked, in world units. */
const MAX_NUDGE = 0.08;
const NUDGE_STEP = 0.012;
const ANGLE_NUDGE = (Math.PI * 2) / 3;

/**
 * Move a freshly placed leaf off its neighbours, along the branch it landed on.
 *
 * Returns null when there is no room nearby. Refusing is deliberate: pushing a
 * leaf further than MAX_NUDGE would drop it somewhere the user did not click,
 * which reads as a bug rather than as spacing.
 */
export function resolveSpacing(
  candidate: LeafAddress,
  occupied: LeafAddress[],
  branches: BranchSpec[],
): LeafAddress | null {
  const branch = branches[candidate.branchIndex];
  if (!branch) return null;

  const neighbours: Vector3[] = [];
  for (const address of occupied) {
    const position = addressToPosition(address, branches);
    if (position) neighbours.push(position);
  }

  const clear = (address: LeafAddress) => {
    const position = addressToPosition(address, branches);
    if (!position) return false;
    return neighbours.every((n) => n.distanceTo(position) >= MIN_SPACING);
  };

  if (clear(candidate)) return candidate;

  // Arc length, so a step is the same distance on a long branch as a short one.
  const length = branch.curve.getLength() || 1;
  const stepT = NUDGE_STEP / length;
  const steps = Math.ceil(MAX_NUDGE / NUDGE_STEP);

  for (let step = 1; step <= steps; step++) {
    const offsets = [step * stepT, -step * stepT];
    for (const angleOffset of [0, ANGLE_NUDGE, -ANGLE_NUDGE]) {
      for (const offset of offsets) {
        const t = candidate.t + offset;
        if (t < T_MIN || t > T_MAX) continue;

        const moved = {
          branchIndex: candidate.branchIndex,
          t,
          angle: candidate.angle + angleOffset,
        };
        if (clear(moved)) return moved;
      }
    }
  }

  return null;
}
