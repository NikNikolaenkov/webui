/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE_SECTION, PEOPLE_VIEWS, parseRole, withPeopleSection } from '../../src/features/people/menu.ts';
import type { Layout } from '../../src/types/schema.ts';

const layout = (name: string): Layout => ({
  name,
  icon: 'settings',
  items: [{ link: { name: 'x', icon: 'settings', viewName: `x:${name}` } }],
});
const schema = () => ({ objects: {}, layouts: [layout('Management'), layout('Settings'), layout('Account')] });
const links = (l: Layout | undefined) => (l?.items ?? []).flatMap((i) => ('link' in i ? [i.link.viewName] : []));
const section = (role: 'hr' | 'support' | 'admin') =>
  withPeopleSection(schema(), role).layouts.find((l) => l.name === PEOPLE_SECTION);

test('menu shows People only for hr/support/admin', () => {
  for (const role of ['hr', 'support', 'admin'] as const) {
    const people = section(role);
    assert.ok(people, `${role}: section present`);
    for (const view of [
      PEOPLE_VIEWS.org,
      PEOPLE_VIEWS.people,
      PEOPLE_VIEWS.lines,
      PEOPLE_VIEWS.discrepancies,
      PEOPLE_VIEWS.exchange,
    ]) {
      assert.ok(links(people).includes(view), `${role}: ${view}`);
    }
  }
  for (const role of [null, undefined, 'user', '', 'HR', 42, { role: 'hr' }]) {
    const s = withPeopleSection(schema(), parseRole(role));
    assert.equal(s.layouts.length, 3, `${String(role)}: unchanged`);
    assert.ok(!s.layouts.some((l) => l.name === PEOPLE_SECTION));
  }
  assert.equal(parseRole('hr'), 'hr');
  assert.equal(parseRole('support'), 'support');
  assert.equal(parseRole('admin'), 'admin');
});

test('archive link only for hr/admin', () => {
  assert.ok(links(section('hr')).includes(PEOPLE_VIEWS.archive));
  assert.ok(links(section('admin')).includes(PEOPLE_VIEWS.archive));
  assert.ok(!links(section('support')).includes(PEOPLE_VIEWS.archive));
});

test('section goes before Account, the schema object is not mutated, labels come from the translator', () => {
  const original = schema();
  const s = withPeopleSection(original, 'hr', (key, fallback) => `uk:${key}:${fallback}`);
  assert.deepEqual(
    s.layouts.map((l) => l.name),
    ['Management', 'Settings', PEOPLE_SECTION, 'Account'],
  );
  assert.equal(original.layouts.length, 3);
  const first = s.layouts.find((l) => l.name === PEOPLE_SECTION)!.items[0]!;
  assert.ok('link' in first && first.link.name.startsWith('uk:people.menu.'));
  // Without an Account section it is appended; applying twice does not duplicate it.
  const twice = withPeopleSection(withPeopleSection({ layouts: [layout('Management')] }, 'support'), 'support');
  assert.deepEqual(
    twice.layouts.map((l) => l.name),
    ['Management', PEOPLE_SECTION],
  );
});
