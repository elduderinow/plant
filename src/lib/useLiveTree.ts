"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Vector3 } from "three";
import type { PlacedLeaf } from "./leaf";
import type { LeafAddress } from "./leafAddress";
import { type LeafRow, type PlaceResult, type TreeRow, supabase } from "./supabase";
import {
  DEFAULT_BRANCH_COUNT,
  GEOM_VERSION,
  MAX_LEAVES,
  type TreeParams,
  nextSeed,
} from "./tree";

const OWN_KEY = "plant.own";

function ownIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(OWN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function rememberOwn(id: string) {
  const ids = ownIds();
  ids.add(id);
  window.localStorage.setItem(OWN_KEY, JSON.stringify([...ids].slice(-500)));
}

function toLeaf(row: LeafRow, own: Set<string>): PlacedLeaf {
  return {
    id: row.id,
    address: { branchIndex: row.branch_index, t: row.t, angle: row.angle },
    author: row.author,
    message: row.message,
    hidden: row.hidden,
    createdAt: row.created_at,
    own: own.has(row.id),
  };
}

export type LiveTree = {
  params: TreeParams;
  treeId: string | null;
  ordinal: number;
  maxLeaves: number;
  leaves: PlacedLeaf[];
  ready: boolean;
  place: (
    address: LeafAddress,
    position: Vector3,
    author: string,
    message: string,
  ) => Promise<PlaceResult["status"]>;
};

const FALLBACK: TreeParams = {
  seed: 400,
  branchCount: DEFAULT_BRANCH_COUNT,
  geomVersion: GEOM_VERSION,
};

/**
 * The live tree and everyone's leaves on it, kept current over realtime.
 *
 * Without a database configured it keeps the same shape in memory, so the scene
 * still runs in a bare checkout. That path seals a tree too, it just forgets
 * every tree it sealed.
 */
export function useLiveTree(): LiveTree {
  const [tree, setTree] = useState<TreeRow | null>(null);
  const [leaves, setLeaves] = useState<PlacedLeaf[]>([]);
  const [ready, setReady] = useState(!supabase);
  const [localParams, setLocalParams] = useState(FALLBACK);
  const treeIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;

    const { data: row } = await supabase.rpc("live_tree").single<TreeRow>();
    if (!row) return;

    setTree(row);
    treeIdRef.current = row.id;

    const { data: rows } = await supabase
      .from("leaves")
      .select("*")
      .eq("tree_id", row.id)
      .order("slot");

    const own = ownIds();
    setLeaves((rows ?? []).map((r) => toLeaf(r as LeafRow, own)));
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime. Leaves arrive as other people leave them, and the tree row
  // changing is how a seal reaches everyone who is watching.
  useEffect(() => {
    if (!supabase || !tree) return;
    const client = supabase;

    const channel = client
      .channel(`tree:${tree.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "plant",
          table: "leaves",
          filter: `tree_id=eq.${tree.id}`,
        },
        (payload) => {
          const row = payload.new as LeafRow;
          setLeaves((previous) =>
            // The echo of our own optimistic insert arrives here too.
            previous.some((leaf) => leaf.id === row.id)
              ? previous
              : [...previous, toLeaf(row, ownIds())],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "plant", table: "trees" },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [tree, load]);

  const place = useCallback(
    async (
      address: LeafAddress,
      position: Vector3,
      author: string,
      message: string,
    ): Promise<PlaceResult["status"]> => {
      const id = crypto.randomUUID();

      // No database: keep it in memory and seal locally.
      if (!supabase) {
        setLeaves((previous) => {
          const next = [
            ...previous,
            { id, address, author, message, own: true, createdAt: new Date().toISOString() },
          ];
          if (next.length >= MAX_LEAVES) {
            setLocalParams((p) => ({ ...p, seed: nextSeed(p.seed) }));
            return [];
          }
          return next;
        });
        return "placed";
      }

      const response = await fetch("/api/leaves", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          treeId: treeIdRef.current,
          branchIndex: address.branchIndex,
          t: address.t,
          angle: address.angle,
          px: position.x,
          py: position.y,
          pz: position.z,
          author,
          message,
        }),
      });

      const result = (await response.json()) as PlaceResult;

      if (result.status === "placed") {
        rememberOwn(id);
        // Optimistic. The realtime echo will find this id already here.
        setLeaves((previous) => [
          ...previous,
          { id, address, author, message, own: true, createdAt: new Date().toISOString() },
        ]);
      }

      if (result.status === "sealed" || result.status === "stale") {
        if (result.status === "sealed") rememberOwn(id);
        await load();
      }

      return result.status;
    },
    [load],
  );

  return {
    params: tree
      ? { seed: tree.seed, branchCount: tree.branch_count, geomVersion: tree.geom_version }
      : localParams,
    treeId: tree?.id ?? null,
    ordinal: tree?.ordinal ?? 1,
    maxLeaves: tree?.max_leaves ?? MAX_LEAVES,
    leaves,
    ready,
    place,
  };
}
