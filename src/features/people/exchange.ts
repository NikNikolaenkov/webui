/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// «Імпорт / експорт» without Google: the helper's exchange table travels as a CSV file. Pure helpers (tested with
// node --test): CSV out (UTF-8 BOM so Excel reads Cyrillic; formula-looking cells neutralised against CSV injection)
// and in (separator detected from the header line), spreadsheet id from a link. The table never leaves the browser
// except to the helper; it is kept only in component state.

export const MAX_IMPORT_ROWS = 5000;
const MAX_COLUMNS = 100;

/**
 * OWASP CSV injection: a cell starting with = + - @ tab or CR could run as a formula, so it gets a leading apostrophe
 * (shown as text). Exempt: something that is plainly a phone number (digits, spaces, brackets, dashes, optional +).
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const PHONE = /^\+?[\d\s()-]{5,}$/;
const guard = (v: string) => (FORMULA_START.test(v) && !PHONE.test(v) ? `'${v}` : v);
const quote = (v: string) => (/[",;\t\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: string[][]): string {
  return '\uFEFF' + rows.map((r) => r.map((c) => quote(guard(c ?? ''))).join(',')).join('\r\n') + '\r\n';
}

function separatorOf(text: string): string {
  let inQuotes = false;
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ',';
}

/** RFC 4180 with the separator of the header line; empty lines are dropped. Throws on more than MAX_IMPORT_ROWS. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];
  const sep = separatorOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const endRow = () => {
    row.push(cell);
    cell = '';
    if (row.some((c) => c !== '')) {
      if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Too many rows (over ${MAX_IMPORT_ROWS})`);
      if (row.length > MAX_COLUMNS) throw new Error(`Too many columns in a row (over ${MAX_COLUMNS})`);
      rows.push(row);
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') inQuotes = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      endRow();
      i++;
    } else if (ch === '\n' || ch === '\r') endRow();
    else cell += ch;
  }
  if (cell !== '' || row.length) endRow();
  if (rows.length > MAX_IMPORT_ROWS + 1) throw new Error(`Too many rows (over ${MAX_IMPORT_ROWS})`);
  return rows;
}

/** Undo the export's formula guard (only before exactly the guarded characters) before sending rows to the helper. */
export const importCells = (rows: string[][]): string[][] =>
  rows.map((r) => r.map((c) => c.replace(/^'(?=[=+\-@\t\r])/, '')));

/** The id of a Google spreadsheet from its link or the bare id; null for anything else. */
export function spreadsheetIdOf(input: string): string | null {
  const t = input.trim();
  const m = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(t);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{8,}$/.test(t) ? t : null;
}

export function csvFileName(at: Date, hr: boolean): string {
  return `personal-${hr ? 'HR-' : ''}${at.toISOString().slice(0, 10)}.csv`;
}

// ---------- what the helper answers (lib/sheets in people-helper) ----------

export interface SheetsStatus {
  sheetsConfigured: boolean;
  serviceEmail: string | null;
  mirrors: number;
}

export interface ExportResult {
  exportId: string;
  headers: string[];
  rows: string[][];
  hr: boolean;
  written?: { spreadsheetId: string; sheet: string; rows: number };
}

export interface ImportChange {
  field: string;
  header: string;
  from: string;
  to: string;
}

export type ImportItem =
  | { kind: 'createUnit'; name: string }
  | { kind: 'create'; row: number; fullName: string; lines: string[] }
  | { kind: 'update'; row: number; cardId: string; fullName: string; changes: ImportChange[]; lines: string[] }
  | { kind: 'block' | 'delete'; row: number; cardId: string; fullName: string };

export interface ImportPreview {
  previewId: string;
  items: ImportItem[];
  warnings: { row?: number; message: string }[];
  counts: {
    rows: number;
    create: number;
    update: number;
    block: number;
    delete: number;
    createUnit: number;
    unchanged: number;
    notInSheet: number;
  };
}

export interface ImportResult {
  previewId: string;
  alreadyApplied: boolean;
  applied: number;
  failed: { row?: number; kind: string; message: string }[];
  created: { row: number; cardId: string }[];
}

export interface MirrorReport {
  key: string;
  title: string;
  at: string;
  ok: boolean;
  error?: string;
  written: number;
  appended: number;
  marked: number;
  unmarked: number;
  manualEdits: { sheet: string; row: number; key: string; header: string; sheetValue: string; registryValue: string }[];
  notes: { sheet?: string; row?: number; message: string }[];
}

export interface MirrorStatus {
  key: string;
  title: string;
  sheets: string[];
  last: MirrorReport | null;
}

/** Whether the preview would change anything (the apply button is pointless otherwise). */
export const hasChanges = (p: ImportPreview) => p.items.length > 0;
