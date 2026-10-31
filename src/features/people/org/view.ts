/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Zoom and pan of the org chart. The view is anchored to a block: that block's top-left is at (sx, sy) on screen,
// so expanding or collapsing around it does not move it. Pure, tested with node --test.

export interface AnchoredView {
  anchor: string;
  sx: number;
  sy: number;
  scale: number;
}

interface Boxes {
  boxes: ReadonlyMap<string, { x: number; y: number }>;
}

/** Where the canvas origin is on screen (null if the anchor is not laid out). */
export function origin(v: AnchoredView, layout: Boxes): { x: number; y: number } | null {
  const b = layout.boxes.get(v.anchor);
  return b ? { x: v.sx - b.x * v.scale, y: v.sy - b.y * v.scale } : null;
}

export const panBy = (v: AnchoredView, dx: number, dy: number): AnchoredView => ({
  ...v,
  sx: v.sx + dx,
  sy: v.sy + dy,
});

/** Zoom to `scale` around the screen point (cx, cy). */
export function zoomAround(v: AnchoredView, scale: number, cx: number, cy: number): AnchoredView {
  const k = scale / v.scale;
  return { ...v, scale, sx: cx - (cx - v.sx) * k, sy: cy - (cy - v.sy) * k };
}

/** The same picture anchored to block `id` (null if either block is not laid out). */
export function reanchor(v: AnchoredView, layout: Boxes, id: string): AnchoredView | null {
  const o = origin(v, layout);
  const b = layout.boxes.get(id);
  if (!o || !b) return null;
  return { anchor: id, scale: v.scale, sx: o.x + b.x * v.scale, sy: o.y + b.y * v.scale };
}

/**
 * After a new layout (refetch, collapse) the anchor may be gone: re-anchor to the first of `fallbacks` that is laid
 * out, keeping the canvas origin where the old layout had it (no jump). Null — nothing to change.
 */
export function rebase(
  v: AnchoredView,
  before: Boxes,
  after: Boxes,
  fallbacks: readonly string[],
): AnchoredView | null {
  if (after.boxes.has(v.anchor)) return null;
  const o = origin(v, before);
  const id = fallbacks.find((f) => after.boxes.has(f));
  if (!o || !id) return null;
  const b = after.boxes.get(id)!;
  return { anchor: id, scale: v.scale, sx: o.x + b.x * v.scale, sy: o.y + b.y * v.scale };
}
