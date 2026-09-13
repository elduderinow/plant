"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { PlacedLeaf } from "@/lib/leaf";
import type { LeafAddress } from "@/lib/leafAddress";
import {
  DEFAULT_BRANCH_COUNT,
  GEOM_VERSION,
  MAX_LEAVES,
  buildTree,
  nextSeed,
} from "@/lib/tree";
import LeafComposer from "./LeafComposer";
import LeafMessage from "./LeafMessage";
import Plant from "./Plant";
import PlantCanvas from "./PlantCanvas";

const FIRST_SEED = 400;

/**
 * The live tree. Place a leaf, leave a message, and when the tree fills it is
 * sealed and the next one grows.
 *
 * Leaves live in local state for now. Supabase replaces this state and the
 * place() body; nothing else in the scene knows the difference.
 */
export default function LiveScene() {
  const [params, setParams] = useState({
    seed: FIRST_SEED,
    branchCount: DEFAULT_BRANCH_COUNT,
    geomVersion: GEOM_VERSION,
  });
  const [leaves, setLeaves] = useState<PlacedLeaf[]>([]);
  const [pending, setPending] = useState<PlacedLeaf | null>(null);
  const [reading, setReading] = useState<PlacedLeaf | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const tree = useMemo(() => buildTree(params), [params]);

  const place = useCallback((address: LeafAddress) => {
    setNotice(null);
    setPending({
      id: crypto.randomUUID(),
      address,
      author: "",
      message: "",
      pending: true,
      own: true,
    });
  }, []);

  const confirm = useCallback(
    (author: string, message: string) => {
      if (!pending) return;
      const leaf: PlacedLeaf = {
        ...pending,
        author,
        message,
        pending: false,
        createdAt: new Date().toISOString(),
      };
      setPending(null);

      setLeaves((previous) => {
        const next = [...previous, leaf];
        if (next.length >= MAX_LEAVES) {
          // Sealed. The next tree grows from a seed derived from this one, so
          // the whole history rebuilds from a single number.
          setParams((p) => ({ ...p, seed: nextSeed(p.seed) }));
          setNotice("That tree is full. A new one is growing.");
          return [];
        }
        return next;
      });
    },
    [pending],
  );

  return (
    <>
      <PlantCanvas>
        {(alphaMap) => (
          <Plant
            tree={tree}
            leaves={leaves}
            pending={pending}
            alphaMap={alphaMap}
            interactive={!pending}
            onPlace={place}
            onSelect={setReading}
            onCrowded={() => setNotice("Too crowded there. Try a clearer spot.")}
          />
        )}
      </PlantCanvas>

      <div className="panel">
        <span className="count">
          {leaves.length} / {MAX_LEAVES} leaves
        </span>
        <Link href="/sandbox">sandbox</Link>
      </div>

      <p className="hint">drag to orbit · click a branch to leave a message</p>
      {notice ? <p className="notice">{notice}</p> : null}

      {pending ? (
        <LeafComposer onConfirm={confirm} onCancel={() => setPending(null)} />
      ) : null}
      {reading ? <LeafMessage leaf={reading} onClose={() => setReading(null)} /> : null}
    </>
  );
}
