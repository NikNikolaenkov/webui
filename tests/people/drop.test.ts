/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_UNIT, personNodeId as P, unitNodeId as U } from '../../src/features/people/org/graph.ts';
import { planDrop } from '../../src/features/people/org/drop.ts';

const person = (cardId: string, unitId: string | null, managerCardId: string | null) => ({
  cardId,
  fullName: cardId,
  title: null,
  unitId,
  managerCardId,
});
// root (head dir) ← sales (head sh) ← team (head tl); dir ← sh ← s1 ← s1a ; sh ← tl ← t1
const units = [
  { id: 'root', name: 'Компанія', parentUnitId: null, headCardId: 'dir' },
  { id: 'sales', name: 'Продажі', parentUnitId: 'root', headCardId: 'sh' },
  { id: 'team', name: 'Команда', parentUnitId: 'sales', headCardId: 'tl' },
];
const people = [
  person('dir', 'root', null),
  person('sh', 'sales', 'dir'),
  person('s1', 'sales', 'sh'),
  person('s1a', 'sales', 's1'),
  person('tl', 'team', 'sh'),
  person('t1', 'team', 'tl'),
];

test('drag and drop: moves, refusals before any request, no-ops', () => {
  const plan = (from: string, to: string) => planDrop(people, units, from, to);
  assert.deepEqual(plan(P('t1'), P('s1')), { kind: 'person', cardId: 't1', target: { managerCardId: 's1' } });
  assert.deepEqual(plan(P('s1'), U('team')), { kind: 'person', cardId: 's1', target: { unitId: 'team' } });
  assert.deepEqual(plan(U('team'), U('root')), { kind: 'unit', unitId: 'team', parentUnitId: 'root' });
  // A manager into their own branch: refused (person and unit), so the helper is never asked.
  assert.deepEqual(plan(P('s1'), P('s1a')), { kind: 'refused', reason: 'cycle' });
  assert.deepEqual(plan(U('sales'), U('team')), { kind: 'refused', reason: 'cycle' });
  // Dropping a unit on a person, or anything on the «no unit» block, is not a move.
  assert.deepEqual(plan(U('team'), P('s1')), { kind: 'refused', reason: 'unsupported' });
  assert.deepEqual(plan(P('s1'), NO_UNIT), { kind: 'refused', reason: 'unsupported' });
  // Already there.
  assert.deepEqual(plan(P('s1a'), P('s1')), { kind: 'noop' });
  assert.deepEqual(plan(P('s1'), U('sales')), { kind: 'noop' }, 'already under the head of sales');
  assert.deepEqual(plan(U('team'), U('sales')), { kind: 'noop' });
  assert.deepEqual(plan(P('s1'), P('s1')), { kind: 'noop' });
});
