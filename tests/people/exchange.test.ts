/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  csvFileName,
  importCells,
  parseCsv,
  spreadsheetIdOf,
  toCsv,
  MAX_IMPORT_ROWS,
} from '../../src/features/people/exchange.ts';

test('csv roundtrip: quotes, separators, new lines inside cells, BOM for Excel', () => {
  const rows = [
    ['ПІБ', 'Посада', 'Нотатки HR'],
    ['Олена "Оля" Коваль', 'Менеджер; продажі', 'рядок 1\nрядок 2'],
    ['', '=1+1', 'a,b'],
  ];
  const csv = toCsv(rows);
  assert.ok(csv.startsWith('\uFEFF'), 'BOM so Excel opens UTF-8');
  assert.deepEqual(
    parseCsv(csv),
    rows.map((r, i) => (i === 2 ? ['', "'=1+1", 'a,b'] : r)),
  );
});

test('csv: formula-looking cells are neutralised on export (OWASP: = + - @ tab CR), phone numbers stay', () => {
  const cells = [
    '=HYPERLINK("x")',
    '+SUM(A1)',
    '-5',
    '@a',
    '\tx',
    '\rx',
    'ok',
    '+380 44 100 0000',
    '+38 (044) 100-00-00',
    '0441000000',
    '-',
  ];
  assert.deepEqual(parseCsv(toCsv([cells]))[0], [
    '\'=HYPERLINK("x")',
    "'+SUM(A1)",
    "'-5",
    "'@a",
    "'\tx",
    "'\rx",
    'ok',
    '+380 44 100 0000',
    '+38 (044) 100-00-00',
    '0441000000',
    "'-",
  ]);
});

test('csv parse: the separator is detected from the header (comma, semicolon, tab), CRLF and BOM tolerated', () => {
  assert.deepEqual(parseCsv('\uFEFFПІБ;Посада\r\nАнна;Менеджер\r\n'), [
    ['ПІБ', 'Посада'],
    ['Анна', 'Менеджер'],
  ]);
  assert.deepEqual(parseCsv('ПІБ\tПосада\nАнна\tМенеджер'), [
    ['ПІБ', 'Посада'],
    ['Анна', 'Менеджер'],
  ]);
  assert.deepEqual(parseCsv('ПІБ,Посада\n"Анна, молодша",""'), [
    ['ПІБ', 'Посада'],
    ['Анна, молодша', ''],
  ]);
  assert.deepEqual(parseCsv(''), []);
  // Trailing empty lines are dropped, empty lines inside kept as empty rows are dropped too.
  assert.deepEqual(parseCsv('a,b\n\n1,2\n\n'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('csv parse refuses absurd sizes instead of freezing the page', () => {
  const big = ['ПІБ', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Людина ${i}`)].join('\n');
  assert.throws(() => parseCsv(big), /rows/);
});

test('spreadsheet id from a link or the bare id', () => {
  assert.equal(spreadsheetIdOf('https://docs.google.com/spreadsheets/d/1AbC-dEf_123456/edit#gid=0'), '1AbC-dEf_123456');
  assert.equal(spreadsheetIdOf(' 1AbC-dEf_123456 '), '1AbC-dEf_123456');
  assert.equal(spreadsheetIdOf('https://evil.example/x'), null);
  assert.equal(spreadsheetIdOf('short'), null);
});

test('export file name carries the date and marks HR exports', () => {
  const at = new Date('2026-10-31T12:00:00Z');
  assert.equal(csvFileName(at, false), 'personal-2026-10-31.csv');
  assert.equal(csvFileName(at, true), 'personal-HR-2026-10-31.csv');
});

test('import cells: the export guard apostrophe is removed only before = + - @ tab CR', () => {
  assert.deepEqual(importCells([["'=1+1", "'@a", "'+SUM(A1)", "'-5", "'\tx", "'текст", "'1", '+380']]), [
    ['=1+1', '@a', '+SUM(A1)', '-5', '\tx', "'текст", "'1", '+380'],
  ]);
});
