"use client";

import dynamic from "next/dynamic";

const ArchiveScene = dynamic(() => import("@/components/ArchiveScene"), {
  ssr: false,
  loading: () => <div className="status">Looking back…</div>,
});

export default function Archive() {
  return (
    <main>
      <ArchiveScene />
    </main>
  );
}
