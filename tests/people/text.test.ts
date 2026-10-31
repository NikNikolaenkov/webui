/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveText, type Translate } from '../../src/features/people/org/text.ts';

// The English defaults with {{…}} filled in, as i18next would without a translation.
const t: Translate = (_key, text, opts = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k]));

const person = (cardId: string, fullName: string, unitId: string | null, managerCardId: string | null) => ({
  cardId,
  fullName,
  title: null,
  unitId,
  managerCardId,
});
const units = [
  { id: 'root', name: 'Company', parentUnitId: null, headCardId: 'dir' },
  { id: 'sales', name: 'Sales', parentUnitId: 'root', headCardId: 'sh' },
  { id: 'hr', name: 'HR', parentUnitId: 'root', headCardId: 'hh' },
  { id: 'empty', name: 'Empty', parentUnitId: 'root', headCardId: null },
];
const people = [
  person('dir', 'Dir', 'root', null),
  person('sh', 'Sam Head', 'sales', 'dir'),
  person('s1', 'Sue One', 'sales', 'sh'),
  person('s2', 'Sid Two', 'sales', 'sh'),
  // Heads HR but works in sales (the HR block shows them; their own block is in sales).
  person('hh', 'Hal Head', 'sales', 'dir'),
  person('h1', 'Hana', 'hr', 'hh'),
];

test('confirm text: person under a person of the same unit', () => {
  const text = moveText({ kind: 'person', cardId: 's2', target: { managerCardId: 's1' } }, people, units, t);
  assert.equal(text.title, 'Move Sid Two under Sue One?');
  assert.equal(text.description, 'Subordinates move together with the person.');
});

test('confirm text: person under a manager in another unit names the unit change', () => {
  const text = moveText({ kind: 'person', cardId: 'h1', target: { managerCardId: 's1' } }, people, units, t);
  assert.equal(text.title, 'Move Hana under Sue One?');
  assert.match(text.description, /unit «Sales»/);
  assert.match(text.description, /HR/, 'the unit they leave');
});

test('confirm text: onto a unit — under its head, no head, or the head itself', () => {
  const under = moveText({ kind: 'person', cardId: 's1', target: { unitId: 'hr' } }, people, units, t);
  assert.equal(under.title, 'Move Sue One under HR?');
  assert.match(under.description, /under its head, Hal Head/);

  const none = moveText({ kind: 'person', cardId: 's1', target: { unitId: 'empty' } }, people, units, t);
  assert.match(none.description, /no head/);

  // The head of HR (working in sales) dropped onto HR: moves into the unit they head, without a manager.
  const head = moveText({ kind: 'person', cardId: 'hh', target: { unitId: 'hr' } }, people, units, t);
  assert.doesNotMatch(head.description, /no head/);
  assert.match(head.description, /heads «HR»/);
  assert.match(head.description, /without a manager/);
});

test('confirm text: unit under a unit', () => {
  const text = moveText({ kind: 'unit', unitId: 'hr', parentUnitId: 'sales' }, people, units, t);
  assert.equal(text.title, 'Move HR under Sales?');
  assert.equal(text.description, 'Nested units and their people move with it.');
});
