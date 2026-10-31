/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Custom card fields (people-helper lib/domain/fields.ts): the definition shape and the UI's own logic — which
// fields a card shows, the markers («поза списком», «поза підрозділами поля», «поле в архіві»), value display, the
// edit drafts and the PATCH built from them. The helper validates everything again; this module only decides what
// to show and send. Pure module (no '@/' imports), tested with node --test.

export const FIELD_TYPES = [
  'text',
  'longtext',
  'number',
  'date',
  'select',
  'boolean',
  'url',
  'email',
  'phone',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export type FieldVisibility = 'work' | 'hr';

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];
  visibility: FieldVisibility;
  /** Empty = every person; otherwise the person's unit or any unit above it must be listed. */
  unitIds: string[];
  hint: string | null;
  order: number;
  archived: boolean;
  createdAt: string;
  createdBy: string;
}

export type CustomValues = Record<string, unknown>;

interface UnitParent {
  id: string;
  parentUnitId: string | null;
}

/** Copy of the helper's appliesTo: no unitIds = everyone, else the unit or any unit above it is listed. */
export function appliesTo(
  def: Pick<FieldDef, 'unitIds'>,
  unitId: string | null,
  units: readonly UnitParent[],
): boolean {
  if (!def.unitIds.length) return true;
  const parent = new Map(units.map((u) => [u.id, u.parentUnitId]));
  // The parents in the data may form a loop: every unit is visited once.
  const seen = new Set<string>();
  for (let u = unitId; u && !seen.has(u); u = parent.get(u) ?? null) {
    if (def.unitIds.includes(u)) return true;
    seen.add(u);
  }
  return false;
}

const collator = new Intl.Collator('uk');
const byOrder = (a: FieldDef, b: FieldDef) => a.order - b.order || collator.compare(a.label, b.label);
export const sortDefs = (defs: readonly FieldDef[]): FieldDef[] => [...defs].sort(byOrder);

const isSet = (v: unknown) => v !== undefined && v !== null;

// ---------- what a card shows ----------

export interface CardField {
  def: FieldDef;
  value: unknown;
  hasValue: boolean;
  /** A select value that is no longer among the options. */
  outOfList: boolean;
  /** The person's unit (and the ones above it) is not among the field's units, yet a value is stored. */
  outOfUnits: boolean;
  archived: boolean;
  /** Only «clear» is possible: the helper refuses a new value for an archived field or one outside its units. */
  locked: boolean;
}

/**
 * The fields of one visibility a card lists: the active ones that concern the person (empty too), plus any with a
 * stored value. Values of unknown fields and of the other visibility are not shown.
 */
export function cardFields(
  defs: readonly FieldDef[],
  visibility: FieldVisibility,
  unitId: string | null,
  units: readonly UnitParent[],
  values: CustomValues,
): CardField[] {
  const rows: CardField[] = [];
  for (const def of sortDefs(defs)) {
    if (def.visibility !== visibility) continue;
    const value = values[def.id];
    const hasValue = isSet(value);
    const applies = appliesTo(def, unitId, units);
    if (!hasValue && (def.archived || !applies)) continue;
    const outOfUnits = hasValue && !applies;
    rows.push({
      def,
      value,
      hasValue,
      outOfList: hasValue && def.type === 'select' && !(def.options ?? []).includes(value as string),
      outOfUnits,
      archived: def.archived,
      locked: def.archived || outOfUnits,
    });
  }
  return rows;
}

export interface StoredField {
  def: FieldDef | null;
  label: string;
  value: unknown;
}

/** Every stored value of one visibility with its label (the archive): archived fields too, unknown ids by id. */
export function storedFields(
  defs: readonly FieldDef[],
  visibility: FieldVisibility,
  values: CustomValues,
): StoredField[] {
  const known: StoredField[] = [];
  const unknown: StoredField[] = [];
  const byId = new Map(defs.map((d) => [d.id, d]));
  for (const [id, value] of Object.entries(values)) {
    if (!isSet(value)) continue;
    const def = byId.get(id);
    if (!def) unknown.push({ def: null, label: id, value });
    else if (def.visibility === visibility) known.push({ def, label: def.label, value });
  }
  known.sort((a, b) => byOrder(a.def!, b.def!));
  return [...known, ...unknown];
}

// ---------- display ----------

const numberFormat = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 10 });

export function formatValue(def: Pick<FieldDef, 'type'>, value: unknown, yesNo: { yes: string; no: string }): string {
  if (!isSet(value)) return '';
  switch (def.type) {
    case 'boolean':
      return value === true ? yesNo.yes : value === false ? yesNo.no : String(value);
    case 'date': {
      const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
      return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value);
    }
    case 'number':
      return typeof value === 'number' ? numberFormat.format(value) : String(value);
    default:
      return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/** The choices of a select: its options, plus a stored value that is no longer among them (so it stays selectable). */
export function selectOptions(def: Pick<FieldDef, 'options'>, stored: unknown): string[] {
  const options = def.options ?? [];
  return typeof stored === 'string' && stored && !options.includes(stored) ? [...options, stored] : options;
}

// ---------- edit drafts ----------

/** The text an input starts with: numbers as JS prints them, booleans as 'true' / 'false', empty as ''. */
export function draftOf(value: unknown): string {
  if (!isSet(value)) return '';
  return typeof value === 'string' ? value : String(value);
}

export type Parsed = { ok: true; value: unknown } | { ok: false };

/** The JSON value of an input's text: null when empty (clears), else typed by the field; {ok:false} when malformed. */
export function parseDraft(def: Pick<FieldDef, 'type'>, draft: string): Parsed {
  const text = draft.trim();
  if (!text) return { ok: true, value: null };
  switch (def.type) {
    case 'number': {
      const n = text.replace(/\s/g, '').replace(',', '.');
      if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(n)) return { ok: false };
      const value = Number(n);
      return Number.isFinite(value) ? { ok: true, value } : { ok: false };
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { ok: true, value: text } : { ok: false };
    case 'boolean':
      return text === 'true' || text === 'false' ? { ok: true, value: text === 'true' } : { ok: false };
    default:
      return { ok: true, value: text };
  }
}

/** The drafts with one row set (undefined puts it back to «unchanged»). */
export function withDraft(
  drafts: Record<string, string>,
  id: string,
  draft: string | undefined,
): Record<string, string> {
  const next = { ...drafts };
  if (draft === undefined) delete next[id];
  else next[id] = draft;
  return next;
}

export type PatchResult = { ok: true; patch: Record<string, unknown> } | { ok: false; label: string };

/**
 * The `custom` map to send: only values that changed (so untouched archived or out-of-unit values are never
 * resent), a cleared one as null. A locked row can only be cleared. `drafts` missing a row means «unchanged».
 */
export function buildCustomPatch(
  rows: readonly CardField[],
  drafts: Record<string, string>,
  original: CustomValues,
): PatchResult {
  const patch: Record<string, unknown> = {};
  for (const row of rows) {
    const { def } = row;
    const draft = drafts[def.id] ?? draftOf(original[def.id]);
    if (row.locked) {
      if (row.hasValue && draft.trim() === '') patch[def.id] = null;
      continue;
    }
    const parsed = parseDraft(def, draft);
    if (!parsed.ok) return { ok: false, label: def.label };
    if (parsed.value === null) {
      if (isSet(original[def.id])) patch[def.id] = null;
    } else if (original[def.id] !== parsed.value) {
      patch[def.id] = parsed.value;
    }
  }
  return { ok: true, patch };
}

// ---------- order ----------

/** Moves a field one place in the list (order, label) and returns the new `order` of each field that changed. */
export function reorderChanges(
  defs: readonly FieldDef[],
  id: string,
  dir: 'up' | 'down',
): { id: string; order: number }[] {
  const list = sortDefs(defs);
  const at = list.findIndex((d) => d.id === id);
  const to = dir === 'up' ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= list.length) return [];
  [list[at], list[to]] = [list[to]!, list[at]!];
  return list.flatMap((d, i) => (d.order === i ? [] : [{ id: d.id, order: i }]));
}

// ---------- units ----------

export interface UnitNode {
  id: string;
  name: string;
  parentUnitId: string | null;
}

/** Units depth-first (children by name) with their depth, for a pick list; orphans and cycle members go last at depth 0. */
export function unitTreeOrder<U extends UnitNode>(units: readonly U[]): { unit: U; depth: number }[] {
  const ids = new Set(units.map((u) => u.id));
  const children = new Map<string | null, U[]>();
  for (const u of [...units].sort((a, b) => collator.compare(a.name, b.name))) {
    const key = u.parentUnitId && ids.has(u.parentUnitId) ? u.parentUnitId : null;
    children.set(key, [...(children.get(key) ?? []), u]);
  }
  const out: { unit: U; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const u of children.get(parent) ?? []) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      out.push({ unit: u, depth });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const u of [...units].sort((a, b) => collator.compare(a.name, b.name))) {
    if (!seen.has(u.id)) {
      seen.add(u.id);
      out.push({ unit: u, depth: 0 });
    }
  }
  return out;
}

// ---------- a failed field list ----------

/**
 * What a card block of custom fields renders. A failed `/fields` request must not look like "no fields" (support could
 * tell a caller the data is not filled): the block shows the error instead.
 */
export function customBlock(failed: boolean, rowCount: number): 'error' | 'rows' | 'none' {
  return failed ? 'error' : rowCount > 0 ? 'rows' : 'none';
}

// ---------- editing a definition ----------

export interface FieldDraft {
  label: string;
  hint: string;
  unitIds: string[];
  options: string[];
}

export type FieldChanges = Partial<Pick<FieldDef, 'label' | 'hint' | 'options' | 'unitIds'>>;

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: readonly string[], b: readonly string[]) => sameList([...a].sort(), [...b].sort());

/**
 * The PATCH of a definition edit: only the keys that differ from the definition the dialog opened with, so a later
 * save does not revert another HR's concurrent change (e.g. a newly added option). Units compare as sets, options by
 * content AND order; options only for a select. An empty object means: nothing to send.
 */
export function fieldPatch(original: FieldDef, draft: FieldDraft): FieldChanges {
  const patch: FieldChanges = {};
  const label = draft.label.trim();
  if (label !== original.label) patch.label = label;
  const hint = draft.hint.trim() || null;
  if (hint !== (original.hint || null)) patch.hint = hint;
  if (!sameSet(draft.unitIds, original.unitIds)) patch.unitIds = draft.unitIds;
  if (original.type === 'select' && !sameList(draft.options, original.options ?? [])) patch.options = draft.options;
  return patch;
}
