# plant

A generative glass plant you can grow leaves on, rendered with three.js `WebGPURenderer`.

Drag to orbit. Click a branch to place a leaf. "new plant" rerolls the seed,
"scatter leaves" swaps placed leaves for a hundred scattered ones.

Live: see the Vercel deployment for this repo.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- three.js r186 via `three/webgpu` and `three/tsl`
- `@react-three/fiber` v9, `@react-three/drei` v10 for `CameraControls` only

## How the port differs

Ported from the Plant scene in the 2024 portfolio, which ran on WebGL through
`WebGLRenderer` and a stack of drei / postprocessing helpers. Those helpers patch
GLSL through `onBeforeCompile`, which the node renderer rejects, so each one was
replaced with a native equivalent:

| 2024 | here |
|---|---|
| drei `MeshTransmissionMaterial` | `MeshPhysicalNodeMaterial` native transmission |
| drei `<Instances>/<Instance>` | raw `InstancedMesh` with `setMatrixAt` / `setColorAt` |
| drei `<Environment>` | `HDRLoader` + `PMREMGenerator` from `three/webgpu` |
| `@react-three/postprocessing` N8AO + Bloom + ToneMapping | TSL `ao` (GTAO) + `bloom` through `RenderPipeline`, ACES on the renderer |
| leva | plain HTML buttons |
| zustand store | local React state |

Two things behave differently on purpose, both marked in the code:

1. **The seed is real.** The 2024 version accepted a seed and then called
   `Math.random` anyway, so the slider only rerolled and the plant differed
   between server and client. A seeded xorshift generator replaces it, so a given
   seed always grows the same plant.
2. **Placed leaves accumulate.** The original did
   `[...currentPositions.slice(0, -1), e.point]`, which pins the array at one
   entry, so clicking only ever slid a single leaf around. Leaves add up here.

Lost in translation: drei's transmission material also did a multi-sample
backside blur and chromatic aberration. Neither has a native equivalent, so the
glass is a little cleaner than the original.

## Backend

`WebGPURenderer` is asked for WebGL directly when `navigator.gpu` is absent, and
keeps its own automatic fallback for the case where WebGPU exists but fails to
start. The scene is TSL either way, so the same node graph compiles to WGSL or
GLSL. The active backend is printed in the bottom right.

## Develop

```bash
npm install
npm run dev
```

`NODE_ENV` must not be forced to `development` for `npm run build`.
