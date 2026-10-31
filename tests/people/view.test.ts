/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { origin, panBy, reanchor, rebase, zoomAround } from '../../src/features/people/org/view.ts';

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
