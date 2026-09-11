"use client";

/** Three directional lights, unchanged from the 2024 scene. */
export default function Lights() {
  return (
    <group>
      <directionalLight color="#5100ff" position={[5, 5, -8]} intensity={6} />
      <directionalLight color="#e7a84a" position={[-5, 2, -8]} intensity={6} />
      <directionalLight color="#ea7814" position={[-1, 0, 2]} intensity={1} />
    </group>
  );
}
