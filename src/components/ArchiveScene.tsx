"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PlacedLeaf } from "@/lib/leaf";
import { type LeafRow, type TreeRow, supabase } from "@/lib/supabase";
import { buildTree } from "@/lib/tree";
import LeafMessage from "./LeafMessage";
import Plant from "./Plant";
import PlantCanvas from "./PlantCanvas";

/**
 * The trees that filled up. A sealed tree is two integers and its leaves, so
 * browsing the archive costs one canvas and a query, however many there are.
 * It renders through the same buildTree and the same Plant as the live scene,
 * which is the whole reason an ancestor looks like one.
 */
export default function ArchiveScene() {
  const [trees, setTrees] = useState<TreeRow[]>([]);
  const [at, setAt] = useState(0);
  const [leaves, setLeaves] = useState<PlacedLeaf[]>([]);
  const [reading, setReading] = useState<PlacedLeaf | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoaded(true);
      return;
    }

    void (async () => {
      const { data } = await supabase
        .from("trees")
        .select("*")
        .not("sealed_at", "is", null)
        .order("ordinal", { ascending: false });

      setTrees((data ?? []) as TreeRow[]);
      setLoaded(true);
    })();
  }, []);

  const current = trees[at] ?? null;

  useEffect(() => {
    if (!supabase || !current) return;

    void (async () => {
      const { data } = await supabase
        .from("leaves")
        .select("*")
        .eq("tree_id", current.id)
        .order("slot");

      setLeaves(
        ((data ?? []) as LeafRow[]).map((row) => ({
          id: row.id,
          address: { branchIndex: row.branch_index, t: row.t, angle: row.angle },
          author: row.author,
          message: row.message,
          hidden: row.hidden,
          createdAt: row.created_at,
        })),
      );
    })();
  }, [current]);

  const tree = useMemo(
    () =>
      current
        ? buildTree({
            seed: current.seed,
            branchCount: current.branch_count,
            geomVersion: current.geom_version,
          })
        : null,
    [current],
  );

  if (loaded && !current) {
    return (
      <div className="status">
        <p>No tree has filled up yet.</p>
        <Link href="/">back to the live one</Link>
      </div>
    );
  }

  return (
    <>
      {tree ? (
        <PlantCanvas>
          {(alphaMap) => (
            <Plant
              tree={tree}
              leaves={leaves}
              alphaMap={alphaMap}
              interactive={false}
              onSelect={setReading}
            />
          )}
        </PlantCanvas>
      ) : null}

      <div className="panel">
        <button type="button" disabled={at >= trees.length - 1} onClick={() => setAt(at + 1)}>
          older
        </button>
        <button type="button" disabled={at <= 0} onClick={() => setAt(at - 1)}>
          newer
        </button>
        <span className="count">
          {current ? `tree ${current.ordinal} · ${leaves.length} messages` : ""}
        </span>
        <Link href="/">live tree</Link>
      </div>

      <p className="hint">click a leaf to read it</p>
      {reading ? <LeafMessage leaf={reading} onClose={() => setReading(null)} /> : null}
    </>
  );
}
