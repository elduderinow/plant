"use client";

import { useCallback, useRef } from "react";

/**
 * Tells a click apart from the end of an orbit drag.
 *
 * Placement used to fire on pointerup with no test at all, so dragging the
 * camera across the plant dropped a leaf wherever the gesture happened to end.
 */
const DRAG_THRESHOLD = 5;

export function useClickGuard() {
  const origin = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = useCallback((e: { clientX: number; clientY: number }) => {
    origin.current = { x: e.clientX, y: e.clientY };
  }, []);

  const isClick = useCallback((e: { clientX: number; clientY: number }) => {
    const start = origin.current;
    origin.current = null;
    if (!start) return false;
    return Math.hypot(e.clientX - start.x, e.clientY - start.y) <= DRAG_THRESHOLD;
  }, []);

  return { onPointerDown, isClick };
}
