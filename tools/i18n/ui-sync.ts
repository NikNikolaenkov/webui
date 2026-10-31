/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Completeness report of src/i18n/uk.json against en.json (never blocks: exit 0 unless JSON is invalid).
//   node --experimental-strip-types tools/i18n/ui-sync.ts src/i18n/en.json src/i18n/uk.json --check
// A Ukrainian plural (_one/_few/_many/_other) counts as present when its _other form exists.

import { readFileSync } from 'node:fs';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = '', out = new Set<string>()): Set<string> {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.add(path);
    else flatten(value, path, out);
  }
  return out;
}

function readJson(path: string): Tree {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`${path}: ${(error as Error).message}`);
    process.exit(1);
  }
}

const [enPath, ukPath] = process.argv.slice(2);
if (!enPath || !ukPath) {
  console.error('usage: ui-sync.ts <en.json> <uk.json> [--check]');
  process.exit(2);
}
const en = flatten(readJson(enPath));
const uk = flatten(readJson(ukPath));
const missing = [...en].filter((key) => !uk.has(key) && !(key.endsWith('_one') && uk.has(key.replace(/_one$/, '_other'))));
console.log(`ui strings: en ${en.size}, missing in uk ${missing.length}`);
for (const key of missing.slice(0, 20)) console.log(`  missing  ${key}`);
