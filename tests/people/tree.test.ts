/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveError, subordinatesOf, unitMoveError, unitPath } from '../../src/features/people/tree.ts';

// dir ← head ← a ← a1 ; dir ← b ; units: root (head dir) ← sales (head) ← team (head a)
const people = [
  { cardId: 'dir', managerCardId: null },
  { cardId: 'head', managerCardId: 'dir' },
  { cardId: 'a', managerCardId: 'head' },
  { cardId: 'a1', managerCardId: 'a' },
  { cardId: 'b', managerCardId: 'dir' },
];
const units = [
  { id: 'root', name: 'Компанія', parentUnitId: null, headCardId: 'dir' },
  { id: 'sales', name: 'Продажі', parentUnitId: 'root', headCardId: 'head' },
  { id: 'team', name: 'Команда', parentUnitId: 'sales', headCardId: 'a' },
];

test('move rejects cycles', () => {
  assert.equal(moveError(people, units, 'head', { managerCardId: 'head' }), 'self');
  assert.equal(moveError(people, units, 'head', { managerCardId: 'a1' }), 'cycle', 'under own grandchild');
  assert.equal(moveError(people, units, 'head', { managerCardId: 'a' }), 'cycle', 'under own child');
  assert.equal(moveError(people, units, 'head', { unitId: 'team' }), 'cycle', 'into a unit headed by a subordinate');
  assert.equal(moveError(people, units, 'a1', { managerCardId: 'b' }), null);
  assert.equal(moveError(people, units, 'head', { managerCardId: 'b' }), null, 'sideways is fine');
  assert.equal(moveError(people, units, 'a', { unitId: 'team' }), null, 'own unit: no manager over self, no cycle');
  assert.equal(moveError(people, units, 'head', { unitId: 'missing' }), 'unknown');
  assert.equal(moveError(people, units, 'head', { managerCardId: 'missing' }), 'unknown');
  // A manager loop already in the data must not hang the check.
  const looped = [...people, { cardId: 'x', managerCardId: 'y' }, { cardId: 'y', managerCardId: 'x' }];
  assert.equal(moveError(looped, units, 'x', { managerCardId: 'y' }), 'cycle');
});

test('unit moves reject cycles; subordinates and unit paths', () => {
  assert.equal(unitMoveError(units, 'sales', 'team'), 'cycle');
  assert.equal(unitMoveError(units, 'sales', 'sales'), 'self');
  assert.equal(unitMoveError(units, 'team', 'root'), null);
  assert.equal(unitMoveError(units, 'team', null), null);
  assert.deepEqual([...subordinatesOf(people, 'head')].sort(), ['a', 'a1']);
  assert.deepEqual(
    unitPath(units, 'team').map((u) => u.name),
    ['Компанія', 'Продажі', 'Команда'],
  );
  assert.deepEqual(unitPath(units, 'nope'), []);
});
