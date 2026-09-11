"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useState } from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import Controls from "./Controls";
import EnvironmentHdr from "./EnvironmentHdr";
import Lights from "./Lights";
import Plant from "./Plant";
import Post from "./Post";

type Backend = "webgpu" | "webgl";

const DEFAULTS = { seed: 400, branchCount: 40 };

export default function PlantScene() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [failed, setFailed] = useState(false);
  const [alphaMap, setAlphaMap] = useState<THREE.Texture | null>(null);
  const [seed, setSeed] = useState(DEFAULTS.seed);
  const [randomLeaves, setRandomLeaves] = useState(false);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    let texture: THREE.Texture | null = null;
    loader.load("/images/leafmask.png", (t) => {
      texture = t;
      setAlphaMap(t);
    });
    return () => texture?.dispose();
  }, []);

  /**
   * WebGPU where available, WebGL 2 otherwise. The scene is the same either
   * way: node materials compile to WGSL or GLSL depending on which backend
   * starts, and the bloom pass is TSL rather than a GLSL effect chain.
   */
  const createRenderer = useCallback(async (props: object) => {
    const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;

    const renderer = new WebGPURenderer({
      ...(props as ConstructorParameters<typeof WebGPURenderer>[0]),
      forceWebGL: !hasWebGPU,
      antialias: true,
    });

    try {
      await renderer.init();
    } catch (error) {
      setFailed(true);
      throw error;
    }

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;

    const active = renderer.backend as { isWebGPUBackend?: boolean };
    setBackend(active.isWebGPUBackend === true ? "webgpu" : "webgl");
    return renderer;
  }, []);

  if (failed) {
    return (
      <div className="status">
        <p>This scene could not start a GPU context.</p>
        <p className="muted">It needs WebGPU or WebGL 2.</p>
      </div>
    );
  }

  return (
    <>
      <Canvas
        dpr={[1, 2]}
        shadows
        camera={{ fov: 45, position: [0, 0, 0], near: 0.01, far: 100 }}
        gl={createRenderer}
      >
        <Controls />
        <Lights />
        {alphaMap ? (
          <Plant
            seed={seed}
            branchCount={DEFAULTS.branchCount}
            randomLeaves={randomLeaves}
            alphaMap={alphaMap}
          />
        ) : null}
        <EnvironmentHdr file="/hdri/potsdamer_platz_1k.hdr" blur={1} />
        <Post />
      </Canvas>

      <div className="panel">
        <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 9999) + 1)}>
          new plant
        </button>
        <button type="button" onClick={() => setRandomLeaves((v) => !v)}>
          {randomLeaves ? "placed leaves" : "scatter leaves"}
        </button>
        <span className="seed">seed {seed}</span>
      </div>

      <p className="hint">drag to orbit · click a branch to place a leaf</p>
      {backend ? <p className="backend">{backend}</p> : null}
    </>
  );
}
