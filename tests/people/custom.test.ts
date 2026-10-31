/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appliesTo,
  buildCustomPatch,
  cardFields,
  customBlock,
  draftOf,
  fieldPatch,
  formatValue,
  parseDraft,
  reorderChanges,
  selectOptions,
  storedFields,
  unitTreeOrder,
  withDraft,
  type FieldDef,
} from '../../src/features/people/custom.ts';

const def = (over: Partial<FieldDef> & { id: string }): FieldDef => ({
  label: over.id,
  type: 'text',
  visibility: 'work',
  unitIds: [],
  hint: null,
  order: 0,
  archived: false,
  createdAt: '2026-10-31T00:00:00.000Z',
  createdBy: 'hr@example.test',
  ...over,
});

const units = [
  { id: 'root', parentUnitId: null },
  { id: 'log', parentUnitId: 'root' },
  { id: 'okk', parentUnitId: 'log' },
  { id: 'sales', parentUnitId: 'root' },
];

test('appliesTo: empty list means everyone, else the unit or an ancestor', () => {
  assert.equal(appliesTo(def({ id: 'a' }), null, units), true);
  assert.equal(appliesTo(def({ id: 'a', unitIds: ['log'] }), 'log', units), true);
  assert.equal(appliesTo(def({ id: 'a', unitIds: ['log'] }), 'okk', units), true);
  assert.equal(appliesTo(def({ id: 'a', unitIds: ['log'] }), 'sales', units), false);
  assert.equal(appliesTo(def({ id: 'a', unitIds: ['log'] }), null, units), false);
  assert.equal(appliesTo(def({ id: 'a', unitIds: ['okk'] }), 'log', units), false);
  assert.equal(appliesTo(def({ id: 'a', unitIds: ['x'] }), 'ghost', units), false);
});

test('appliesTo survives a parent cycle', () => {
  const loop = [
    { id: 'a', parentUnitId: 'b' },
    { id: 'b', parentUnitId: 'a' },
  ];
  assert.equal(appliesTo(def({ id: 'f', unitIds: ['z'] }), 'a', loop), false);
  assert.equal(appliesTo(def({ id: 'f', unitIds: ['b'] }), 'a', loop), true);
});

test('cardFields: applicable active fields (empty too), filled stragglers with markers, ordered', () => {
  const defs = [
    def({ id: 'size', label: 'Розмір', type: 'select', options: ['S', 'M'], order: 2 }),
    def({ id: 'med', label: 'Медогляд', type: 'date', unitIds: ['log'], order: 1 }),
    def({ id: 'old', label: 'Старе', archived: true, order: 0 }),
    def({ id: 'oldFilled', label: 'Старе заповнене', archived: true, order: 3 }),
    def({ id: 'hrOnly', label: 'Сімейний стан', visibility: 'hr', order: 4 }),
  ];
  const rows = cardFields(defs, 'work', 'sales', units, { size: 'XL', oldFilled: 'x', hrOnly: 'leak', ghost: 1 });
  assert.deepEqual(
    rows.map((r) => r.def.id),
    ['size', 'oldFilled'],
  );
  const size = rows.find((r) => r.def.id === 'size')!;
  assert.equal(size.outOfList, true);
  assert.equal(size.outOfUnits, false);
  assert.equal(size.hasValue, true);
  assert.equal(rows.find((r) => r.def.id === 'oldFilled')!.archived, true);

  const inLog = cardFields(defs, 'work', 'okk', units, {});
  assert.deepEqual(
    inLog.map((r) => r.def.id),
    ['med', 'size'],
  );
  assert.equal(inLog[0]!.hasValue, false);
});

test('cardFields: a value outside the field’s units stays visible with the marker', () => {
  const defs = [def({ id: 'med', type: 'date', unitIds: ['log'] })];
  const [row] = cardFields(defs, 'work', 'sales', units, { med: '2026-01-02' });
  assert.equal(row!.outOfUnits, true);
  assert.equal(row!.outOfList, false);
});

test('cardFields: hr visibility only sees hr definitions', () => {
  const defs = [def({ id: 'w' }), def({ id: 'h', visibility: 'hr' })];
  assert.deepEqual(
    cardFields(defs, 'hr', null, units, {}).map((r) => r.def.id),
    ['h'],
  );
});

test('storedFields (archive): every stored value with a label, archived and unknown ids included', () => {
  const defs = [def({ id: 'a', label: 'Розмір', archived: true }), def({ id: 'h', label: 'HR', visibility: 'hr' })];
  const rows = storedFields(defs, 'work', { a: 'M', zz: 5, h: 'nope' });
  assert.deepEqual(
    rows.map((r) => [r.label, r.def?.id ?? null, r.value]),
    [
      ['Розмір', 'a', 'M'],
      ['zz', null, 5],
    ],
  );
});

test('formatValue by type', () => {
  const yn = { yes: 'Так', no: 'Ні' };
  assert.equal(formatValue(def({ id: 'b', type: 'boolean' }), true, yn), 'Так');
  assert.equal(formatValue(def({ id: 'b', type: 'boolean' }), false, yn), 'Ні');
  assert.equal(formatValue(def({ id: 'd', type: 'date' }), '2026-03-09', yn), '09.03.2026');
  assert.equal(formatValue(def({ id: 'd', type: 'date' }), 'garbage', yn), 'garbage');
  assert.equal(formatValue(def({ id: 'n', type: 'number' }), 12.5, yn).replace(/\s/g, ''), '12,5');
  assert.equal(formatValue(def({ id: 't' }), 'hello', yn), 'hello');
  assert.equal(formatValue(def({ id: 't' }), { odd: 1 }, yn), '{"odd":1}');
});

test('draftOf and parseDraft by type', () => {
  const num = def({ id: 'n', type: 'number' });
  assert.equal(draftOf(12.5), '12.5');
  assert.equal(draftOf(undefined), '');
  assert.equal(draftOf(true), 'true');
  assert.equal(draftOf(false), 'false');

  assert.deepEqual(parseDraft(num, '12,5'), { ok: true, value: 12.5 });
  assert.deepEqual(parseDraft(num, ' 1 000,25 '), { ok: true, value: 1000.25 });
  assert.deepEqual(parseDraft(num, '-3'), { ok: true, value: -3 });
  assert.deepEqual(parseDraft(num, ''), { ok: true, value: null });
  assert.deepEqual(parseDraft(num, 'abc'), { ok: false });
  assert.deepEqual(parseDraft(num, '1,2,3'), { ok: false });
  assert.deepEqual(parseDraft(def({ id: 'd', type: 'date' }), '2026-03-09'), { ok: true, value: '2026-03-09' });
  assert.deepEqual(parseDraft(def({ id: 'd', type: 'date' }), '09.03.2026'), { ok: false });
  assert.deepEqual(parseDraft(def({ id: 'b', type: 'boolean' }), 'true'), { ok: true, value: true });
  assert.deepEqual(parseDraft(def({ id: 'b', type: 'boolean' }), 'false'), { ok: true, value: false });
  assert.deepEqual(parseDraft(def({ id: 'b', type: 'boolean' }), ''), { ok: true, value: null });
  assert.deepEqual(parseDraft(def({ id: 't' }), '  hi  '), { ok: true, value: 'hi' });
  assert.deepEqual(parseDraft(def({ id: 't' }), '   '), { ok: true, value: null });
});

test('selectOptions keeps a stored out-of-list value selectable', () => {
  const d = def({ id: 's', type: 'select', options: ['S', 'M'] });
  assert.deepEqual(selectOptions(d, 'M'), ['S', 'M']);
  assert.deepEqual(selectOptions(d, 'XL'), ['S', 'M', 'XL']);
  assert.deepEqual(selectOptions(d, undefined), ['S', 'M']);
});

test('buildCustomPatch (edit): only changes, clears as null, locked rows only on clear', () => {
  const defs = [
    def({ id: 'a', label: 'А' }),
    def({ id: 'n', label: 'Число', type: 'number' }),
    def({ id: 'c', label: 'Очищу' }),
    def({ id: 'same', label: 'Те саме' }),
    def({ id: 'arch', label: 'Архівне', archived: true }),
    def({ id: 'out', label: 'Поза', unitIds: ['log'] }),
  ];
  const original = { a: 'old', c: 'gone', same: 'x', arch: 'keep', out: 'stay' };
  const rows = cardFields(defs, 'work', 'sales', units, original);
  const drafts = { a: 'new', n: '7,5', c: '', same: 'x', arch: 'keep', out: '' };
  // «a», «n», «c», «same» do not apply to 'sales'? They apply to everyone; «out» is outside its units (locked).
  assert.deepEqual(buildCustomPatch(rows, drafts, original), {
    ok: true,
    patch: { a: 'new', n: 7.5, c: null, out: null },
  });
});

test('buildCustomPatch: locked row untouched is never sent; bad number names the field', () => {
  const defs = [
    def({ id: 'arch', label: 'Архівне', archived: true }),
    def({ id: 'n', label: 'Число', type: 'number' }),
  ];
  const rows = cardFields(defs, 'work', null, units, { arch: 'keep' });
  assert.deepEqual(buildCustomPatch(rows, { arch: 'keep', n: '' }, { arch: 'keep' }), { ok: true, patch: {} });
  assert.deepEqual(buildCustomPatch(rows, { arch: 'keep', n: 'x1' }, { arch: 'keep' }), { ok: false, label: 'Число' });
});

test('buildCustomPatch (create): only filled values', () => {
  const defs = [def({ id: 'a' }), def({ id: 'b', type: 'boolean' }), def({ id: 'c' })];
  const rows = cardFields(defs, 'work', null, units, {});
  assert.deepEqual(buildCustomPatch(rows, { a: 'x', b: 'false', c: '' }, {}), {
    ok: true,
    patch: { a: 'x', b: false },
  });
});

test('reorderChanges moves a field one place and renumbers only what changed', () => {
  const defs = [def({ id: 'a', order: 0 }), def({ id: 'b', order: 0 }), def({ id: 'c', order: 5 })];
  // list order (order, label): a, b, c → move c up → a, c, b
  assert.deepEqual(reorderChanges(defs, 'c', 'up'), [
    { id: 'c', order: 1 },
    { id: 'b', order: 2 },
  ]);
  assert.deepEqual(reorderChanges(defs, 'a', 'up'), []);
  assert.deepEqual(reorderChanges(defs, 'c', 'down'), []);
  assert.deepEqual(reorderChanges(defs, 'zz', 'down'), []);
  const neat = [def({ id: 'a', order: 0 }), def({ id: 'b', order: 1 })];
  assert.deepEqual(reorderChanges(neat, 'a', 'down'), [
    { id: 'b', order: 0 },
    { id: 'a', order: 1 },
  ]);
});

test('withDraft sets and removes a row without mutating', () => {
  const a = { x: '1' };
  const b = withDraft(a, 'y', '2');
  assert.deepEqual(b, { x: '1', y: '2' });
  assert.deepEqual(withDraft(b, 'x', undefined), { y: '2' });
  assert.deepEqual(a, { x: '1' });
});

test('unitTreeOrder lists units depth-first by name with their depth, tolerates orphans and cycles', () => {
  const list = [
    { id: 'b', name: 'Б', parentUnitId: null },
    { id: 'a', name: 'А', parentUnitId: null },
    { id: 'a2', name: 'А-два', parentUnitId: 'a' },
    { id: 'a1', name: 'А-один', parentUnitId: 'a' },
    { id: 'o', name: 'Сирота', parentUnitId: 'ghost' },
    { id: 'x', name: 'Ікс', parentUnitId: 'y' },
    { id: 'y', name: 'Ігрек', parentUnitId: 'x' },
  ];
  const got = unitTreeOrder(list).map((r) => `${r.depth}:${r.unit.id}`);
  assert.deepEqual(got.slice(0, 5), ['0:a', '1:a2', '1:a1', '0:b', '0:o']);
  assert.equal(got.length, list.length);
});

test('fieldPatch: only what differs from the definition the dialog opened with', () => {
  const original = def({
    id: 'f1',
    label: 'Розмір',
    type: 'select',
    options: ['S', 'M'],
    unitIds: ['u1', 'u2'],
    hint: 'Підказка',
  });
  const same = { label: ' Розмір ', hint: ' Підказка ', unitIds: ['u2', 'u1'], options: ['S', 'M'] };
  assert.deepEqual(fieldPatch(original, same), {});
  assert.deepEqual(fieldPatch(original, { ...same, label: 'Розмір форми' }), { label: 'Розмір форми' });
  assert.deepEqual(fieldPatch(original, { ...same, hint: '' }), { hint: null });
  assert.deepEqual(fieldPatch(original, { ...same, unitIds: ['u1'] }), { unitIds: ['u1'] });
  // options: content and order matter
  assert.deepEqual(fieldPatch(original, { ...same, options: ['M', 'S'] }), { options: ['M', 'S'] });
  assert.deepEqual(fieldPatch(original, { ...same, options: ['S', 'M', 'L'] }), { options: ['S', 'M', 'L'] });
  // a non-select field never sends options; an empty hint equals a missing one
  const text = def({ id: 'f2', label: 'Нотатка', hint: null });
  assert.deepEqual(fieldPatch(text, { label: 'Нотатка', hint: '', unitIds: [], options: ['x'] }), {});
});

test('customBlock: a failed field list is an error, never a silently missing section', () => {
  assert.equal(customBlock(true, 0), 'error');
  assert.equal(customBlock(true, 3), 'error');
  assert.equal(customBlock(false, 2), 'rows');
  assert.equal(customBlock(false, 0), 'none');
});
