/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Keeps src/i18n/schema/uk.json in step with the server schema.
//   node --experimental-strip-types tools/i18n/schema-sync.ts <schema.json> <dict.json> --check
//     prints total / translated / missing / stale and the first 20 missing paths
//   ... --write
//     adds missing paths as {en, uk: ""}, refreshes en of stale entries and clears their uk,
//     drops paths the schema no longer has, sorts keys
// Exit code is 0 unless a file is not valid JSON (report only: never blocks a release).

import { readFileSync, writeFileSync } from 'node:fs';
import { collectSchemaStrings, type SchemaDictionary } from '../../src/i18n/schema/translate.ts';

const [schemaPath, dictPath, mode = '--check'] = process.argv.slice(2);
if (!schemaPath || !dictPath || !['--check', '--write'].includes(mode)) {
  console.error('usage: schema-sync.ts <schema.json> <dict.json> [--check|--write]');
  process.exit(2);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`${path}: ${(error as Error).message}`);
    process.exit(1);
  }
}

const strings = collectSchemaStrings(readJson(schemaPath));
const dict = readJson(dictPath) as SchemaDictionary;

let translated = 0;
const missing: string[] = [];
const stale: string[] = [];
for (const [path, en] of strings) {
  const entry = dict[path];
  if (!entry || entry.uk === '') missing.push(path);
  else if (entry.en !== en) stale.push(path);
  else translated++;
}
const obsolete = Object.keys(dict).filter((path) => !strings.has(path));
const unique = new Set(strings.values()).size;

if (mode === '--write') {
  const next: SchemaDictionary = {};
  for (const path of [...strings.keys()].sort()) {
    const en = strings.get(path)!;
    const entry = dict[path];
    next[path] = entry && entry.en === en ? entry : { en, uk: '' };
  }
  writeFileSync(dictPath, JSON.stringify(next, null, 2) + '\n');
}

console.log(
  `schema strings: total ${strings.size} (unique ${unique}), translated ${translated}, missing ${missing.length}, stale ${stale.length}, obsolete ${obsolete.length}`,
);
for (const path of missing.slice(0, 20)) console.log(`  missing  ${path}`);
for (const path of stale.slice(0, 20)) console.log(`  stale    ${path}`);
