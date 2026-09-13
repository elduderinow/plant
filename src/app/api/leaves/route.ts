import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Writes go through here rather than straight from the browser, for one
 * reason: the rate limit needs an IP, and the browser does not know its own.
 * It is hashed with a salt and never stored raw.
 *
 * This still uses the anon key, so the row level security and the security
 * definer function are doing the actual protecting. There is no service key in
 * this app at all.
 */
function hashIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const salt = process.env.IP_HASH_SALT || "plant";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ status: "error", message: "no database" }, { status: 503 });
  }

  const body = await request.json();

  const { data, error } = await supabase.rpc("place_leaf", {
    p_id: body.id,
    p_tree_id: body.treeId,
    p_branch_index: body.branchIndex,
    p_t: body.t,
    p_angle: body.angle,
    p_px: body.px,
    p_py: body.py,
    p_pz: body.pz,
    p_author: body.author,
    p_message: body.message,
    p_ip_hash: hashIp(request),
  });

  if (error) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
