import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null when the environment is not configured, and the scene falls back to
 * keeping leaves in memory. That keeps the sandbox and a bare checkout working
 * without a database behind them.
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const hasSupabase = supabase !== null;

export type TreeRow = {
  id: string;
  ordinal: number;
  seed: number;
  branch_count: number;
  geom_version: number;
  max_leaves: number;
  sealed_at: string | null;
  created_at: string;
};

export type LeafRow = {
  id: string;
  tree_id: string;
  slot: number;
  branch_index: number;
  t: number;
  angle: number;
  author: string;
  message: string;
  hidden: boolean;
  created_at: string;
};

export type PlaceResult =
  | { status: "placed" }
  | { status: "sealed"; tree: TreeRow }
  | { status: "stale"; tree: TreeRow }
  | { status: "crowded" }
  | { status: "rate_limited" }
  | { status: "error"; message: string };
