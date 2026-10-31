/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Invariants of src/i18n/uk.json that must hold whatever upstream adds to en.json.
// Completeness (en keys without uk) is a report (tools/i18n/ui-sync.ts), not a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Tree = { [key: string]: string | Tree };
const read = (name: string): Tree => JSON.parse(readFileSync(new URL(`../../src/i18n/${name}.json`, import.meta.url), 'utf8'));

function flatten(tree: Tree, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

const en = flatten(read('en'));
const uk = flatten(read('uk'));
const PLURAL = /_(one|few|many|other)$/;
const placeholders = (s: string) => [...new Set(s.match(/\{\{[^}]+\}\}/g) ?? [])].sort();
// Fork-only keys: names of the top-level layout sections (route ids in the schema).
const FORK_ONLY = /^layouts\./;

test('uk.json keeps placeholders', () => {
  for (const [key, text] of uk) {
    const source = en.get(key) ?? en.get(key.replace(PLURAL, '_other'));
    if (source === undefined) continue;
    const allowed = placeholders(source).filter((p) => !(PLURAL.test(key) && p === '{{count}}'));
    for (const p of allowed) assert.ok(text.includes(p), `${key}: missing ${p}`);
    for (const p of placeholders(text)) assert.ok(placeholders(source).includes(p), `${key}: unexpected ${p}`);
  }
});

test('no empty values', () => {
  for (const [key, text] of uk) assert.notEqual(text.trim(), '', key);
});

test('no keys absent from en', () => {
  for (const key of uk.keys()) {
    if (FORK_ONLY.test(key)) continue;
    const known = en.has(key) || (PLURAL.test(key) && en.has(key.replace(PLURAL, '_other')));
    assert.ok(known, `stale key ${key}`);
  }
});

test('Ukrainian plural forms are complete', () => {
  for (const key of en.keys()) {
    if (!key.endsWith('_other') || !uk.has(key)) continue;
    const base = key.slice(0, -'_other'.length);
    for (const form of ['one', 'few', 'many', 'other']) assert.ok(uk.has(`${base}_${form}`), `${base}_${form}`);
  }
});
