-- Leave a message, in its own schema.
--
-- The Supabase project `apps` is a shared container: one schema per app, so
-- `public` never becomes a junk drawer. Everything below lives in `plant`.
--
-- Two things a custom schema needs that `public` gets for free on Supabase:
-- the anon/authenticated roles need USAGE on the schema and SELECT on the
-- tables (RLS decides rows, grants decide whether the table is visible at all),
-- and the schema has to be added to PostgREST's exposed list.

create schema if not exists plant;
grant usage on schema plant to anon, authenticated;

create extension if not exists pgcrypto;

-- A tree is two integers. seed and branch_count reproduce the geometry exactly,
-- so nothing about a tree's shape is stored. geom_version records which
-- generator grew it: changing the generator would otherwise silently reshape
-- every tree already sealed.
create table if not exists plant.trees (
  id           uuid primary key default gen_random_uuid(),
  ordinal      int  not null unique,
  seed         int  not null,
  branch_count int  not null default 40,
  geom_version int  not null default 1,
  max_leaves   int  not null default 120,
  sealed_at    timestamptz,
  created_at   timestamptz not null default now()
);

-- Only one tree is ever unsealed.
create unique index if not exists trees_one_live
  on plant.trees ((sealed_at is null)) where sealed_at is null;

create table if not exists plant.leaves (
  id           uuid primary key,
  tree_id      uuid not null references plant.trees (id) on delete cascade,
  slot         int  not null,

  -- Where the leaf sits, as an address on a branch rather than a world point.
  branch_index int  not null,
  t            double precision not null check (t >= 0 and t <= 1),
  angle        double precision not null,

  -- The same point in world space. Derived from the address by the client and
  -- never used for rendering: it exists only so this database can enforce the
  -- minimum spacing between leaves, which it cannot do without the geometry.
  px double precision not null,
  py double precision not null,
  pz double precision not null,

  author    text not null check (length(btrim(author))  between 1 and 40),
  message   text not null check (length(btrim(message)) between 1 and 280),

  -- Moderation blanks the message and keeps the leaf, so hiding one never
  -- changes the shape of the tree.
  hidden    boolean not null default false,

  ip_hash    text,
  created_at timestamptz not null default now(),

  unique (tree_id, slot)
);

create index if not exists leaves_tree on plant.leaves (tree_id, slot);
create index if not exists leaves_rate on plant.leaves (ip_hash, created_at);

alter table plant.trees  enable row level security;
alter table plant.leaves enable row level security;

-- Anyone may read. Nobody may write except through place_leaf, which is
-- security definer, so there is no insert, update or delete policy at all.
drop policy if exists trees_read on plant.trees;
create policy trees_read on plant.trees for select using (true);

drop policy if exists leaves_read on plant.leaves;
create policy leaves_read on plant.leaves for select using (true);

-- The next tree's seed comes from the one before it, so the whole history
-- rebuilds from a single number. xorshift32, matching lib/plantGeometry's
-- makeRandom, kept here so the database is the only thing that decides.
create or replace function plant.next_seed(previous int)
returns int
language plpgsql
immutable
as $$
declare
  state bigint := (previous # 2654435769)::bigint & 4294967295;
begin
  if state = 0 then
    state := 1;
  end if;

  state := (state # ((state << 13) & 4294967295)) & 4294967295;
  state := (state # (state >> 17)) & 4294967295;
  state := (state # ((state << 5)  & 4294967295)) & 4294967295;

  return ((state % 16777215) + 1)::int;
end;
$$;

-- Grow the first tree if there is none.
insert into plant.trees (ordinal, seed)
select 1, 400
where not exists (select 1 from plant.trees);

create or replace function plant.live_tree()
returns plant.trees
language sql
stable
as $$
  select * from plant.trees where sealed_at is null order by ordinal desc limit 1;
$$;

/*
 * Adds one leaf, and seals the tree and grows the next one in the same
 * transaction if that leaf was the last it had room for.
 *
 * Everything that decides whether a leaf may exist happens here, under a lock
 * on the tree row, because two people can be typing at the same moment.
 */
create or replace function plant.place_leaf(
  p_id           uuid,
  p_tree_id      uuid,
  p_branch_index int,
  p_t            double precision,
  p_angle        double precision,
  p_px           double precision,
  p_py           double precision,
  p_pz           double precision,
  p_author       text,
  p_message      text,
  p_ip_hash      text default null,
  p_min_spacing  double precision default 0.045
)
returns jsonb
language plpgsql
security definer
set search_path = plant, public
as $$
declare
  tree     plant.trees;
  live     plant.trees;
  taken    int;
  recent   int;
  crowded  boolean;
begin
  select * into tree from plant.trees where id = p_tree_id for update;

  if not found or tree.sealed_at is not null then
    -- The tree filled while they were typing. The message is not lost; the
    -- client re-places it on the tree that is live now.
    select * into live from plant.trees where sealed_at is null order by ordinal desc limit 1;
    return jsonb_build_object('status', 'stale', 'tree', to_jsonb(live));
  end if;

  if p_ip_hash is not null then
    select count(*) into recent
      from plant.leaves
     where ip_hash = p_ip_hash
       and created_at > now() - interval '1 hour';

    if recent >= 10 then
      return jsonb_build_object('status', 'rate_limited');
    end if;
  end if;

  select exists (
    select 1 from plant.leaves
     where tree_id = tree.id
       and (px - p_px) ^ 2 + (py - p_py) ^ 2 + (pz - p_pz) ^ 2 < p_min_spacing ^ 2
  ) into crowded;

  if crowded then
    -- The client resolves spacing before it ever asks, so this only fires when
    -- two people placed in the same spot at the same moment. It retries.
    return jsonb_build_object('status', 'crowded');
  end if;

  select count(*) into taken from plant.leaves where tree_id = tree.id;

  insert into plant.leaves (
    id, tree_id, slot, branch_index, t, angle, px, py, pz, author, message, ip_hash
  ) values (
    p_id, tree.id, taken, p_branch_index, p_t, p_angle, p_px, p_py, p_pz,
    btrim(p_author), btrim(p_message), p_ip_hash
  );

  if taken + 1 >= tree.max_leaves then
    update plant.trees set sealed_at = now() where id = tree.id;

    insert into plant.trees (ordinal, seed, branch_count, geom_version, max_leaves)
    values (
      tree.ordinal + 1,
      plant.next_seed(tree.seed),
      tree.branch_count,
      tree.geom_version,
      tree.max_leaves
    )
    returning * into live;

    return jsonb_build_object('status', 'sealed', 'tree', to_jsonb(live));
  end if;

  return jsonb_build_object('status', 'placed');
end;
$$;

revoke all on function plant.place_leaf(
  uuid, uuid, int, double precision, double precision,
  double precision, double precision, double precision,
  text, text, text, double precision
) from public;

grant execute on function plant.place_leaf(
  uuid, uuid, int, double precision, double precision,
  double precision, double precision, double precision,
  text, text, text, double precision
) to anon, authenticated;

grant execute on function plant.live_tree() to anon, authenticated;

-- RLS decides which rows; the grant decides whether the table is reachable.
grant select on plant.trees, plant.leaves to anon, authenticated;
