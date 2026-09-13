import type { LeafAddress } from "./leafAddress";

/** A leaf on a tree: where it sits, and the message someone left on it. */
export type PlacedLeaf = {
  id: string;
  address: LeafAddress;
  author: string;
  message: string;
  createdAt?: string;
  /** Placed locally and not yet written, so cancelling drops it for free. */
  pending?: boolean;
  /** Left from this browser, matched by the id kept in localStorage. */
  own?: boolean;
  /** Moderated. The leaf keeps its place so the tree's shape never changes. */
  hidden?: boolean;
};
