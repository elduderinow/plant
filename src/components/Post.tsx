"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { mrt, output, pass, transformedNormalView } from "three/tsl";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";

/**
 * The 2024 scene ran N8AO, Bloom and ACES tone mapping through
 * @react-three/postprocessing, none of which works on the WebGPU path. All
 * three come back here as three's own TSL passes: GTAO stands in for N8AO,
 * bloom is three's BloomNode, and tone mapping is applied by the pipeline's
 * output transform from the renderer setting.
 *
 * The AO matters more than it looks. Without it the glass has almost no
 * definition against a bright environment and the plant washes out.
 *
 * Intensity scales do not carry over from postprocessing: its Bloom intensity
 * of 10 is not three's bloom strength of 10, which would blow out the frame.
 */
export default function Post({
  bloomStrength = 0.35,
  bloomRadius = 0.5,
  bloomThreshold = 0.9,
  aoRadius = 0.2,
  aoScale = 1.4,
}: {
  bloomStrength?: number;
  bloomRadius?: number;
  bloomThreshold?: number;
  aoRadius?: number;
  aoScale?: number;
}) {
  const renderer = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  const pipeline = useMemo(() => {
    const composed = new RenderPipeline(renderer);

    // GTAO reads depth and view normals, so the scene pass has to write a
    // normal target alongside colour.
    const scenePass = pass(scene, camera);
    scenePass.setMRT(mrt({ output, normal: transformedNormalView }));

    const color = scenePass.getTextureNode("output");
    const depth = scenePass.getTextureNode("depth");
    const normal = scenePass.getTextureNode("normal");

    const aoPass = ao(depth, normal, camera);
    aoPass.radius.value = aoRadius;
    aoPass.scale.value = aoScale;

    const occluded = aoPass.getTextureNode().mul(color);
    composed.outputNode = occluded.add(
      bloom(occluded, bloomStrength, bloomRadius, bloomThreshold),
    );

    return composed;
  }, [renderer, scene, camera, bloomStrength, bloomRadius, bloomThreshold, aoRadius, aoScale]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);

  // Priority above 0 takes the render loop away from r3f, so the composed
  // output is what reaches the canvas rather than a plain scene render.
  useFrame(() => {
    pipeline.render();
  }, 1);

  return null;
}
