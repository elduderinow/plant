import { Color, DoubleSide, Texture } from "three";
import { MeshPhysicalNodeMaterial } from "three/webgpu";

/**
 * The 2024 scene used drei's MeshTransmissionMaterial, which patches GLSL into
 * MeshPhysicalMaterial through onBeforeCompile and therefore cannot run on the
 * WebGPU path. MeshPhysicalNodeMaterial carries transmission natively, so the
 * glassy look survives, with two caveats: the multi-sample backside blur and
 * the chromatic aberration were drei extras and have no native equivalent, so
 * they are gone. ior, transmission, thickness and roughness all map across.
 */
export function createGlassMaterial(): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial();
  m.color = new Color("#ffffff");
  m.transmission = 1;
  m.ior = 1.8;
  m.thickness = 2;
  m.roughness = 0.1;
  m.metalness = 0;
  return m;
}

export function createLeafMaterial(alphaMap: Texture): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial();
  m.color = new Color("#ffffff");
  m.transmission = 0.82;
  m.ior = 2;
  m.thickness = 0.9;
  m.roughness = 0.17;
  m.metalness = 0;
  m.side = DoubleSide;
  // The mask cuts the leaf silhouette out of the fan geometry.
  m.alphaMap = alphaMap;
  m.alphaTest = 0.5;
  return m;
}
