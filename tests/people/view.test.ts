/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitView, origin, panBy, reanchor, rebase, zoomAround } from '../../src/features/people/org/view.ts';

const box = (id: string, x: number, y: number) => [id, { id, x, y, w: 100, h: 50 }] as const;
const layout = (...b: ReturnType<typeof box>[]) => ({ boxes: new Map(b) });

test('view: pan, zoom and re-anchoring keep the canvas where it is', () => {
  const l1 = layout(box('r', 500, 0), box('a', 200, 300));
  const v = { anchor: 'r', sx: 400, sy: 10, scale: 1 };
  assert.deepEqual(origin(v, l1), { x: -100, y: 10 });
  assert.deepEqual(origin(panBy(v, 5, -5), l1), { x: -95, y: 5 });
  const z = zoomAround(v, 0.5, 0, 0);
  assert.equal(z.scale, 0.5);
  assert.deepEqual(origin(z, l1), { x: -50, y: 5 });
  // Re-anchoring changes nothing on screen.
  assert.deepEqual(origin(reanchor(v, l1, 'a')!, l1), origin(v, l1));
});

test('view: when the anchor block disappears after a refetch, the canvas does not jump', () => {
  const before = layout(box('r', 500, 0), box('a', 200, 300));
  const after = layout(box('r', 520, 0)); // 'a' gone (moved into a collapsed branch, or deleted)
  const v = { anchor: 'a', sx: 300, sy: 310, scale: 1 };
  const next = rebase(v, before, after, ['r']);
  assert.ok(next);
  assert.equal(next.anchor, 'r', 'falls back to a visible block');
  assert.deepEqual(origin(next, after), origin(v, before), 'canvas origin stays put');
  // Anchor still there: nothing to do.
  assert.equal(rebase({ ...v, anchor: 'r' }, before, after, ['r']), null);
  // Nothing visible to anchor to: nothing to do.
  assert.equal(rebase(v, before, layout(), ['r']), null);
});

test('view: the default view fits the chart to the width, centred, never above 100% nor below the readable floor', () => {
  // Wide chart: 2000 px into a 1000 px viewport → 50%, the whole width on screen, the left edge visible.
  const wide = { ...layout(box('r', 950, 16), box('left', 16, 200)), width: 2000 };
  const v = fitView(wide, 'r', 1000, { min: 0.3 })!;
  assert.equal(v.scale, 0.5);
  assert.deepEqual(origin(v, wide), { x: 0, y: 12 - 16 * 0.5 });
  // Narrow chart: never zoomed in past 100%, centred.
  const narrow = { ...layout(box('r', 100, 16)), width: 400 };
  const n = fitView(narrow, 'r', 1000, { min: 0.3 })!;
  assert.equal(n.scale, 1);
  assert.equal(origin(n, narrow)!.x, 300);
  // Too wide even at the floor: stays readable and starts at the left edge instead of cutting it off.
  const huge = { ...layout(box('r', 5000, 16)), width: 10000 };
  const h = fitView(huge, 'r', 1000, { min: 0.3 })!;
  assert.equal(h.scale, 0.3);
  assert.equal(origin(h, huge)!.x, 0);
  // No anchor laid out or no viewport yet: nothing to show.
  assert.equal(fitView(narrow, 'missing', 1000, { min: 0.3 }), null);
  assert.equal(fitView(narrow, 'r', 0, { min: 0.3 }), null);
});
