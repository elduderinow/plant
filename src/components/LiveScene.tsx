"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { PlacedLeaf } from "@/lib/leaf";
import { type LeafAddress, addressToPosition } from "@/lib/leafAddress";
import { buildTree } from "@/lib/tree";
import { useLiveTree } from "@/lib/useLiveTree";
import LeafComposer from "./LeafComposer";
import LeafMessage from "./LeafMessage";
import Plant from "./Plant";
import PlantCanvas from "./PlantCanvas";

/**
 * The live tree. Place a leaf, leave a message, and when the tree fills it is
 * sealed and the next one grows. Leaves other people are leaving arrive over
 * realtime while you watch.
 */
export default function LiveScene() {
  const live = useLiveTree();
  const [pending, setPending] = useState<PlacedLeaf | null>(null);
  const [reading, setReading] = useState<PlacedLeaf | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tree = useMemo(() => buildTree(live.params), [live.params]);

  const place = useCallback((address: LeafAddress) => {
    setNotice(null);
    setError(null);
    setPending({
      id: "pending",
      address,
      author: "",
      message: "",
      pending: true,
      own: true,
    });
  }, []);

  const confirm = useCallback(
    async (author: string, message: string) => {
      if (!pending) return;

      const position = addressToPosition(pending.address, tree.branches);
      if (!position) return;

      setBusy(true);
      const status = await live.place(pending.address, position, author, message);
      setBusy(false);

      if (status === "placed" || status === "sealed") {
        setPending(null);
        if (status === "sealed") setNotice("That tree is full. A new one is growing.");
        return;
      }

      // Everything else keeps the composer open with the text still in it.
      if (status === "stale") {
        setError("That tree filled up while you were typing. Try again to leave it on the new one.");
      } else if (status === "crowded") {
        setError("Someone just took that spot. Cancel and pick another.");
      } else if (status === "rate_limited") {
        setError("That is a lot of messages for one hour. Come back later.");
      } else {
        setError("That did not save. Try again.");
      }
    },
    [pending, live, tree],
  );

  return (
    <>
      <PlantCanvas>
        {(alphaMap) => (
          <Plant
            tree={tree}
            leaves={live.leaves}
            pending={pending}
            alphaMap={alphaMap}
            interactive={!pending && live.ready}
            onPlace={place}
            onSelect={setReading}
            onCrowded={() => setNotice("Too crowded there. Try a clearer spot.")}
          />
        )}
      </PlantCanvas>

      <div className="panel">
        <span className="count">
          tree {live.ordinal} · {live.leaves.length} / {live.maxLeaves} leaves
        </span>
        <Link href="/archive">archive</Link>
        <Link href="/sandbox">sandbox</Link>
      </div>

      <p className="hint">drag to orbit · click a branch to leave a message</p>
      {notice ? <p className="notice">{notice}</p> : null}

      {pending ? (
        <LeafComposer
          onConfirm={confirm}
          onCancel={() => {
            setPending(null);
            setError(null);
          }}
          busy={busy}
          error={error}
        />
      ) : null}
      {reading ? <LeafMessage leaf={reading} onClose={() => setReading(null)} /> : null}
    </>
  );
}
