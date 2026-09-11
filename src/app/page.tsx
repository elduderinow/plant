"use client";

import dynamic from "next/dynamic";

const PlantScene = dynamic(() => import("@/components/PlantScene"), {
  ssr: false,
  loading: () => <div className="status">Growing…</div>,
});

export default function Home() {
  return (
    <main>
      <PlantScene />
    </main>
  );
}
