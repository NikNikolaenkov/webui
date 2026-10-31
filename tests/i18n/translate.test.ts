/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSchemaStrings, translateSchema, type SchemaDictionary } from '../../src/i18n/schema/translate.ts';

function fixture() {
  return {
    objects: {},
    fields: { 'x:Account': { description: 'Account description' } },
    enums: {
      AccountType: [
        { name: 'User', label: 'User account' },
        { name: 'Group', label: 'Group account' },
      ],
      Locale: [{ name: 'uk-UA', label: 'Ukrainian (Ukraine)' }],
      TimeZone: [{ name: 'Europe/Kyiv', label: 'Europe/Kyiv' }],
    },
    schemas: { Store: { type: 'multiple', variants: [{ name: 'PostgreSql', label: 'PostgreSQL', schemaName: 'StorePg' }] } },
    forms: {
      F: {
        title: 'Account',
        subtitle: 'Edit an account',
        sections: [{ title: 'General', fields: [{ name: 'User account', label: 'User account', placeholder: 'Type here' }] }],
      },
    },
    lists: {
      L: {
        title: 'Accounts',
        subtitle: 'Manage accounts',
        labelProperty: 'name',
        singularName: 'account',
        pluralName: 'accounts',
        columns: [{ name: 'name', label: 'Name' }],
      },
    },
    layouts: [
      {
        name: 'Management',
        items: [
          { link: { name: 'Dashboard', viewName: 'CustomComponent/Dashboard' } },
          { container: { name: 'Directory', items: [{ type: 'link', name: 'Accounts', viewName: 'x:Account/User' }] } },
        ],
      },
    ],
    dashboards: [{ id: 'overview', label: 'Overview', cards: [{ title: 'Total Users', description: 'Accounts provisioned.' }] }],
  };
}

const uk = (en: string, ukText: string) => ({ en, uk: ukText });

test('translates label when en matches', () => {
  const dict: SchemaDictionary = { 'enums/AccountType/User/label': uk('User account', 'Обліковий запис користувача') };
  const out = translateSchema(fixture(), dict);
  assert.equal(out.enums.AccountType[0].label, 'Обліковий запис користувача');
  assert.equal(out.enums.AccountType[1].label, 'Group account');
});

test('stale translation falls back', () => {
  const dict: SchemaDictionary = { 'enums/AccountType/User/label': uk('User acct', 'Обліковий запис користувача') };
  assert.equal(translateSchema(fixture(), dict).enums.AccountType[0].label, 'User account');
});

test('empty uk falls back', () => {
  const dict: SchemaDictionary = { 'enums/AccountType/User/label': uk('User account', '') };
  assert.equal(translateSchema(fixture(), dict).enums.AccountType[0].label, 'User account');
});

test('does not translate identifiers', () => {
  const dict: SchemaDictionary = {
    'enums/AccountType/User/name': uk('User', 'Користувач'),
    'forms/F/sections/0/fields/User account/name': uk('User account', 'Обліковий запис'),
    'layouts/Management/items/Dashboard/link/viewName': uk('CustomComponent/Dashboard', 'Панель'),
    'layouts/Management/name': uk('Management', 'Керування'),
    'lists/L/labelProperty': uk('name', 'назва'),
  };
  const out = translateSchema(fixture(), dict);
  assert.equal(out.enums.AccountType[0].name, 'User');
  assert.equal(out.forms.F.sections[0].fields[0].name, 'User account');
  assert.equal(out.layouts[0].items[0].link?.viewName, 'CustomComponent/Dashboard');
  assert.equal(out.layouts[0].name, 'Management');
  assert.equal(out.lists.L.labelProperty, 'name');
  const paths = [...collectSchemaStrings(fixture()).keys()];
  assert.ok(!paths.some((p) => p.endsWith('/name') && p.startsWith('enums/')));
  assert.ok(!paths.includes('layouts/Management/name'));
});

test('skips descriptions and excluded enums', () => {
  const strings = collectSchemaStrings(fixture());
  const paths = [...strings.keys()];
  assert.ok(!paths.some((p) => p.startsWith('fields/')));
  assert.ok(!paths.some((p) => p.startsWith('enums/Locale/') || p.startsWith('enums/TimeZone/')));
  assert.ok(!paths.some((p) => /\/(description|subtitle|placeholder|explanation)$/.test(p) && !p.startsWith('lists/')));
  assert.ok(!paths.includes('dashboards/overview/cards/0/description'));
  const dict: SchemaDictionary = { 'enums/Locale/uk-UA/label': uk('Ukrainian (Ukraine)', 'Українська (Україна)') };
  assert.equal(translateSchema(fixture(), dict).enums.Locale[0].label, 'Ukrainian (Ukraine)');
});

test('collects the name strings of every section', () => {
  const strings = collectSchemaStrings(fixture());
  assert.deepEqual(
    [...strings.entries()].sort(),
    [
      ['dashboards/overview/cards/0/title', 'Total Users'],
      ['dashboards/overview/label', 'Overview'],
      ['enums/AccountType/Group/label', 'Group account'],
      ['enums/AccountType/User/label', 'User account'],
      ['forms/F/sections/0/fields/User account/label', 'User account'],
      ['forms/F/sections/0/title', 'General'],
      ['forms/F/title', 'Account'],
      ['layouts/Management/items/Dashboard/link/name', 'Dashboard'],
      ['layouts/Management/items/Directory/container/items/Accounts/name', 'Accounts'],
      ['layouts/Management/items/Directory/container/name', 'Directory'],
      ['lists/L/columns/name/label', 'Name'],
      ['lists/L/pluralName', 'accounts'],
      ['lists/L/singularName', 'account'],
      ['lists/L/subtitle', 'Manage accounts'],
      ['lists/L/title', 'Accounts'],
      ['schemas/Store/variants/PostgreSql/label', 'PostgreSQL'],
    ],
  );
});

test('path uses element name, not index', () => {
  const dict: SchemaDictionary = {
    'enums/AccountType/User/label': uk('User account', 'Обліковий запис користувача'),
    'enums/AccountType/Group/label': uk('Group account', 'Груповий обліковий запис'),
  };
  const schema = fixture();
  schema.enums.AccountType.reverse();
  const out = translateSchema(schema, dict);
  assert.equal(out.enums.AccountType[0].name, 'Group');
  assert.equal(out.enums.AccountType[0].label, 'Груповий обліковий запис');
  assert.equal(out.enums.AccountType[1].label, 'Обліковий запис користувача');
});

test('does not mutate input', () => {
  const schema = fixture();
  const before = structuredClone(schema);
  translateSchema(schema, { 'enums/AccountType/User/label': uk('User account', 'Обліковий запис користувача') });
  assert.deepEqual(schema, before);
});
