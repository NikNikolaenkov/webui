/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUkrainian, loadSchemaDictionary } from '../../src/i18n/schema/load.ts';

const dict = { 'enums/AccountType/User/label': { en: 'User account', uk: 'Користувач' } };

test('loadSchemaDictionary returns null for non-uk', async () => {
  let calls = 0;
  const importer = async () => {
    calls++;
    return { default: dict };
  };
  assert.equal(await loadSchemaDictionary('en-US', importer), null);
  assert.equal(await loadSchemaDictionary(undefined, importer), null);
  assert.equal(await loadSchemaDictionary('ru_RU', importer), null);
  assert.equal(calls, 0);
});

test('loadSchemaDictionary loads for uk-UA', async () => {
  const importer = async () => ({ default: dict });
  assert.deepEqual(await loadSchemaDictionary('uk-UA', importer), dict);
  assert.deepEqual(await loadSchemaDictionary('uk_UA', importer), dict);
  assert.deepEqual(await loadSchemaDictionary('uk', importer), dict);
});

test('a failed dictionary import falls back to English (null)', async () => {
  assert.equal(await loadSchemaDictionary('uk-UA', async () => Promise.reject(new Error('chunk failed'))), null);
});

test('isUkrainian', () => {
  assert.ok(isUkrainian('uk-UA') && isUkrainian('UK') && isUkrainian('uk_UA'));
  assert.ok(!isUkrainian('ukr') && !isUkrainian('en-GB') && !isUkrainian(undefined));
});
