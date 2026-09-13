"use client";

import dynamic from "next/dynamic";

const SandboxScene = dynamic(() => import("@/components/SandboxScene"), {
  ssr: false,
  loading: () => <div className="status">Growing…</div>,
});

export default function Sandbox() {
  return (
    <main>
      <SandboxScene />
    </main>
  );
}
