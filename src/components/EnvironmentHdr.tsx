"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import type { WebGPURenderer } from "three/webgpu";
import { PMREMGenerator } from "three/webgpu";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

/**
 * drei's <Environment> leans on its own loader plumbing, so the HDR is loaded
 * and prefiltered by hand here. Same result as the 2024 scene: the map lights
 * the transmission material and doubles as a heavily blurred backdrop.
 */
export default function EnvironmentHdr({ file, blur = 1 }: { file: string; blur?: number }) {
  const scene = useThree((s) => s.scene);
  const renderer = useThree((s) => s.gl);

  useEffect(() => {
    let disposed = false;
    let envMap: THREE.Texture | null = null;

    new HDRLoader().load(file, (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }

      // PMREMGenerator must come from three/webgpu. The core one prefilters
      // with a plain ShaderMaterial, which the node renderer rejects outright
      // ("Material ShaderMaterial is not compatible"), leaving no environment
      // map at all and therefore nothing for the glass to refract.
      const pmrem = new PMREMGenerator(renderer as unknown as WebGPURenderer);
      envMap = pmrem.fromEquirectangular(texture).texture;
      pmrem.dispose();
      texture.dispose();

      scene.environment = envMap;
      scene.background = envMap;
      scene.backgroundBlurriness = blur;
    });

    return () => {
      disposed = true;
      scene.environment = null;
      scene.background = null;
      envMap?.dispose();
    };
  }, [file, blur, scene, renderer]);

  return null;
}
