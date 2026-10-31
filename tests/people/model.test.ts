/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardSections,
  filterPeople,
  formToPatch,
  lifecycleActions,
  personToForm,
  shouldLoadHr,
  type Person,
} from '../../src/features/people/model.ts';

const person = (over: Partial<Person> = {}): Person => ({
  cardId: 'c1',
  fullName: 'Тестова Олена',
  title: 'Рекрутерка',
  emails: [{ address: 'olena@example.test', label: 'робоча' }, { address: 'o2@example.test' }],
  phones: [{ number: '+380 44 000 00 00' }],
  online: [{ service: 'Telegram', user: '@olena' }],
  unitId: 'u1',
  managerCardId: 'm1',
  systems: { creatio: 'olena', bitrix24: '2.1' },
  status: 'active',
  statusDates: { created: '2026-01-12T09:00:00.000Z' },
  accountId: 'a1',
  accountEmail: 'olena@example.test',
  managed: true,
  ...over,
});

// The helper maps JSContact ↔ this model (people-helper lib/domain/model.ts, tested there); the UI never sees
// JSContact (it reads and writes through the helper), so its mapping is the model ↔ the edit form ↔ PATCH body.
test('card mapping roundtrip: helper card model ↔ edit form ↔ PATCH body', () => {
  const p = person();
  const patch = formToPatch(personToForm(p));
  assert.deepEqual(patch, {
    fullName: p.fullName,
    title: p.title,
    emails: p.emails,
    phones: p.phones,
    online: p.online,
    systems: p.systems,
  });
  // Unit and manager change only through «move» (cycle checks), never through PATCH.
  assert.ok(!('unitId' in patch) && !('managerCardId' in patch));

  const form = personToForm(person({ title: null, emails: [], systems: {} }));
  form.fullName = '  Нове Ім’я ';
  form.title = '   ';
  form.emails.push({ address: ' new@example.test ', label: ' ' }, { address: '', label: 'порожньо' });
  form.systems.push({ key: 'unitalk', value: '1201' }, { key: ' ', value: 'x' });
  assert.deepEqual(formToPatch(form), {
    fullName: 'Нове Ім’я',
    title: null,
    emails: [{ address: 'new@example.test' }],
    phones: p.phones,
    online: p.online,
    systems: { unitalk: '1201' },
  });
});

test('support view hides HR fields', () => {
  assert.equal(shouldLoadHr('support'), false, 'support never asks the helper for the HR card');
  assert.ok(!cardSections('support').includes('hr'));
  for (const role of ['hr', 'admin'] as const) {
    assert.equal(shouldLoadHr(role), true);
    assert.ok(cardSections(role).includes('hr'));
  }
  for (const role of ['support', 'hr', 'admin'] as const) {
    for (const s of ['account', 'work', 'systems', 'lines', 'history'] as const) {
      assert.ok(cardSections(role).includes(s), `${role}: ${s}`);
    }
  }
  assert.deepEqual(cardSections(null), []);
  assert.equal(shouldLoadHr(null), false);
});

test('lifecycle buttons follow the status and the managed account', () => {
  assert.deepEqual(lifecycleActions(person()), ['block', 'resetPassword', 'delete']);
  assert.deepEqual(lifecycleActions(person({ status: 'blocked' })), ['unblock', 'delete']);
  assert.deepEqual(lifecycleActions(person({ status: 'deleted' })), ['restore']);
  assert.deepEqual(lifecycleActions(person({ status: 'archived' })), []);
  assert.deepEqual(lifecycleActions(person({ managed: false })), []);
});

test('people search and filters', () => {
  const list = [
    person(),
    person({
      cardId: 'c2',
      fullName: 'Петренко Іван',
      title: 'Менеджер',
      unitId: 'u2',
      status: 'blocked',
      emails: [],
      phones: [{ number: '1201' }],
    }),
    person({
      cardId: 'c3',
      fullName: 'Сидоренко Анна',
      title: null,
      unitId: 'u2',
      status: 'deleted',
      emails: [],
      phones: [],
      accountEmail: 'anna@example.test',
    }),
  ];
  const ids = (q: Parameters<typeof filterPeople>[1]) => filterPeople(list, q).map((p) => p.cardId);
  assert.deepEqual(ids({}), ['c2', 'c3', 'c1'], 'sorted by name (uk collation)');
  assert.deepEqual(ids({ query: 'іван' }), ['c2']);
  assert.deepEqual(ids({ query: 'ANNA@' }), ['c3'], 'account email, case-insensitive');
  assert.deepEqual(ids({ query: '1201' }), ['c2'], 'phone');
  assert.deepEqual(ids({ query: 'рекрут' }), ['c1'], 'title');
  assert.deepEqual(ids({ unitId: 'u2' }), ['c2', 'c3']);
  assert.deepEqual(ids({ status: 'blocked' }), ['c2']);
  assert.deepEqual(ids({ unitId: 'u2', status: 'deleted', query: 'анна' }), ['c3']);
});
