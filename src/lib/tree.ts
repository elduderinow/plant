import { BufferGeometry, Vector3 } from "three";
import {
  type BranchSpec,
  type LeafTransform,
  createBranches,
  createRandomLeafTransforms,
  generateRandomCurve,
  getPointsWithUpwardDirection,
  getRandomNormalPointsAndDirection,
  makeRandom,
} from "./plantGeometry";
import { TaperedTubeGeometry } from "./TaperedTubeGeometry";

/**
 * A tree is two integers. `seed` and `branchCount` reproduce the geometry
 * exactly, because makeRandom is a real xorshift, so the live tree, every
 * sealed tree in the archive and the sandbox all grow through this one
 * function. Nothing about a tree's shape is ever stored.
 *
 * `geomVersion` is what keeps that true over time. Changing the generator would
 * otherwise silently reshape every tree already sealed, so each version keeps
 * its own build and old trees keep growing the way they grew.
 */
export type TreeParams = {
  seed: number;
  branchCount: number;
  geomVersion: number;
};

export const GEOM_VERSION = 1;

export const DEFAULT_BRANCH_COUNT = 40;

/** Leaves per tree before it seals and the next one grows. */
export const MAX_LEAVES = 120;

export type Tree = {
  stemGeometry: BufferGeometry;
  branchesGeometry: BufferGeometry;
  branches: BranchSpec[];
  /** Scatter-mode leaves, for the sandbox. Not message leaves. */
  scattered: LeafTransform[];
};

const STARTPOINT = new Vector3(0, 0, 0);
const ENDPOINT = new Vector3(0, 1, 0);
const STEM_BASE_RADIUS = 0.02;
const STEM_TIP_RADIUS = 0.003;

function buildTreeV1({ seed, branchCount }: TreeParams): Tree {
  // One generator for the whole plant, so every stage of the build advances the
  // same stream and the seed reproduces the plant exactly.
  const random = makeRandom(seed);

  const mainCurve = generateRandomCurve(4, STARTPOINT, ENDPOINT, 0.1, random);

  const stemGeometry = new TaperedTubeGeometry(
    mainCurve,
    10,
    STEM_BASE_RADIUS,
    STEM_TIP_RADIUS,
    12,
  );
  stemGeometry.computeVertexNormals();

  const branchPoints = getRandomNormalPointsAndDirection(
    stemGeometry,
    branchCount,
    STEM_BASE_RADIUS,
    STEM_TIP_RADIUS,
    random,
  );
  const upward = getPointsWithUpwardDirection(branchPoints, 0.3);
  const { geometry: branchesGeometry, branches } = createBranches(upward, random);

  return {
    stemGeometry,
    branchesGeometry,
    branches,
    scattered: createRandomLeafTransforms(branchesGeometry, 100, random),
  };
}

const BUILDERS: Record<number, (params: TreeParams) => Tree> = {
  1: buildTreeV1,
};

export function buildTree(params: TreeParams): Tree {
  const build = BUILDERS[params.geomVersion];
  if (!build) {
    throw new Error(
      `No generator for geom_version ${params.geomVersion}. Old versions must be kept, not removed.`,
    );
  }
  return build(params);
}

/**
 * The next tree's seed comes from the one before it, so the whole history
 * rebuilds from a single number.
 */
export function nextSeed(seed: number) {
  const random = makeRandom(seed ^ 0x9e3779b9);
  random();
  return Math.floor(random() * 0xffffff) + 1;
}

export function disposeTree(tree: Tree) {
  tree.stemGeometry.dispose();
  tree.branchesGeometry.dispose();
}
