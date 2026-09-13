"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PlacedLeaf } from "@/lib/leaf";
import { MIN_SPACING } from "@/lib/leafAddress";
import { DEFAULT_BRANCH_COUNT, GEOM_VERSION, buildTree } from "@/lib/tree";
import Plant from "./Plant";
import PlantCanvas from "./PlantCanvas";

/**
 * Free-generates trees for testing: reroll the seed, change the branch count,
 * spray leaves at the branches to see spacing work. It writes nothing.
 *
 * It builds through the same buildTree and the same Plant as the live scene on
 * purpose. A sandbox with its own copy of the generator stops testing the real
 * thing on the first day either of them changes.
 */
export default function SandboxScene() {
  const [seed, setSeed] = useState(400);
  const [branchCount, setBranchCount] = useState(DEFAULT_BRANCH_COUNT);
  const [scatter, setScatter] = useState(false);
  const [leaves, setLeaves] = useState<PlacedLeaf[]>([]);
  const [crowded, setCrowded] = useState(false);

  const tree = useMemo(
    () => buildTree({ seed, branchCount, geomVersion: GEOM_VERSION }),
    [seed, branchCount],
  );

  const reset = (apply: () => void) => {
    setLeaves([]);
    apply();
  };

  return (
    <>
      <PlantCanvas>
        {(alphaMap) => (
          <Plant
            tree={tree}
            leaves={leaves}
            alphaMap={alphaMap}
            scatter={scatter}
            onPlace={(address) => {
              setCrowded(false);
              setLeaves((previous) => [
                ...previous,
                {
                  id: crypto.randomUUID(),
                  address,
                  author: "sandbox",
                  message: `leaf ${previous.length + 1}`,
                },
              ]);
            }}
            onCrowded={() => setCrowded(true)}
          />
        )}
      </PlantCanvas>

      <div className="panel sandbox">
        <label>
          seed
          <input
            type="range"
            min={1}
            max={9999}
            value={seed}
            onChange={(e) => reset(() => setSeed(Number(e.target.value)))}
          />
          <span className="value">{seed}</span>
        </label>

        <label>
          branches
          <input
            type="range"
            min={5}
            max={120}
            value={branchCount}
            onChange={(e) => reset(() => setBranchCount(Number(e.target.value)))}
          />
          <span className="value">{branchCount}</span>
        </label>

        <div className="sandbox-actions">
          <button
            type="button"
            onClick={() => reset(() => setSeed(Math.floor(Math.random() * 9999) + 1))}
          >
            reroll
          </button>
          <button type="button" onClick={() => setScatter((v) => !v)}>
            {scatter ? "placed leaves" : "scatter leaves"}
          </button>
          <button type="button" onClick={() => setLeaves([])}>
            clear
          </button>
          <Link href="/">live tree</Link>
        </div>

        <span className="muted">
          {leaves.length} placed · min spacing {MIN_SPACING}
          {crowded ? " · no room there" : ""}
        </span>
      </div>
    </>
  );
}
