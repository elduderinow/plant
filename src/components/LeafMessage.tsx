"use client";

import { useEffect } from "react";
import type { PlacedLeaf } from "@/lib/leaf";

/** Reads a leaf someone already left. */
export default function LeafMessage({
  leaf,
  onClose,
}: {
  leaf: PlacedLeaf;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const date = leaf.createdAt
    ? new Date(leaf.createdAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="overlay" onPointerDown={onClose}>
      <article className="message" onPointerDown={(e) => e.stopPropagation()}>
        <p className="message-body">
          {leaf.hidden ? <em className="muted">This message was removed.</em> : leaf.message}
        </p>
        <footer>
          <span>{leaf.hidden ? "—" : leaf.author}</span>
          {date ? <span className="muted">{date}</span> : null}
        </footer>
      </article>
    </div>
  );
}
