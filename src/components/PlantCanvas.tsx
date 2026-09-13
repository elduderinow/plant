"use client";

import { Canvas } from "@react-three/fiber";
import { ReactNode, useCallback, useEffect, useState } from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import Controls from "./Controls";
import EnvironmentHdr from "./EnvironmentHdr";
import Lights from "./Lights";
import Post from "./Post";

type Backend = "webgpu" | "webgl";

/**
 * Everything a plant needs around it: the renderer, the environment, the post
 * chain and the leaf alpha map. The live scene, the archive and the sandbox all
 * mount this and differ only in what they put inside it.
 */
export default function PlantCanvas({
  children,
}: {
  children: (alphaMap: THREE.Texture) => ReactNode;
}) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [failed, setFailed] = useState(false);
  const [alphaMap, setAlphaMap] = useState<THREE.Texture | null>(null);

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
        {alphaMap ? children(alphaMap) : null}
        <EnvironmentHdr file="/hdri/potsdamer_platz_1k.hdr" blur={1} />
        <Post />
      </Canvas>
      {backend ? <p className="backend">{backend}</p> : null}
    </>
  );
}
