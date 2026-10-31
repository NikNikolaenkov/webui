/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Client-side translation of the server schema (/api/schema) by a dictionary keyed
// by schema path. Only display names are translated; identifiers never change, and
// an entry whose English original no longer matches the schema is ignored, so an
// upstream wording change shows the new English text instead of a stale translation.

export type SchemaDictionary = Record<string, { en: string; uk: string }>;

type Visit = (path: string, holder: Record<string, unknown>, key: string) => void;

const EXCLUDED_ENUMS = new Set(['Locale', 'TimeZone']);

// Rules over the generic pattern of a string: map keys become "*", array elements "[]".
// Top-level layout names (Management, Settings, Account) are route segments, not labels.
const RULES: RegExp[] = [
  /^enums\/\*\/\[\]\/label$/,
  /^schemas\/\*\/variants\/\[\]\/label$/,
  /^forms\/\*\/title$/,
  /^forms\/\*\/sections\/\[\]\/title$/,
  /^forms\/\*\/sections\/\[\]\/fields\/\[\]\/(label|keyLabel|valueLabel)$/,
  /^lists\/\*\/(title|subtitle|singularName|pluralName)$/,
  /^lists\/\*\/(columns|filters|itemActions|massActions)\/\[\]\/label$/,
  /^layouts\/\[\]\/items\/\[\]\/(link|container)\/name$/,
  /^layouts\/\[\]\/items\/\[\]\/container\/items\/\[\](\/items\/\[\])?\/name$/,
  /^dashboards\/\[\]\/label$/,
  /^dashboards\/\[\]\/cards\/\[\]\/title$/,
  /^dashboards\/\[\]\/cards\/\[\]\/series\/\[\]\/label$/,
];

const SECTIONS = ['enums', 'schemas', 'forms', 'lists', 'layouts', 'dashboards'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stable identity of an array element: its name (or wrapped link/container name, or id). */
function elementId(element: unknown): string | undefined {
  if (!isRecord(element)) return undefined;
  for (const candidate of [element.name, element.id]) {
    if (typeof candidate === 'string' && candidate !== '') return candidate;
  }
  for (const wrapper of [element.link, element.container]) {
    if (isRecord(wrapper) && typeof wrapper.name === 'string' && wrapper.name !== '') return wrapper.name;
  }
  return undefined;
}

/** Path segment for each element: its identity when unique in the array, otherwise the index. */
function elementSegments(array: unknown[]): string[] {
  const ids = array.map(elementId);
  const seen = new Map<string, number>();
  for (const id of ids) if (id !== undefined) seen.set(id, (seen.get(id) ?? 0) + 1);
  return ids.map((id, index) => (id !== undefined && seen.get(id) === 1 ? id : String(index)));
}

function walk(value: unknown, path: string, pattern: string, visit: Visit): void {
  if (Array.isArray(value)) {
    const segments = elementSegments(value);
    value.forEach((element, index) => walk(element, `${path}/${segments[index]}`, `${pattern}/[]`, visit));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${key}`;
    const childPattern = `${pattern}/${key}`;
    if (typeof child === 'string') {
      if (RULES.some((rule) => rule.test(childPattern))) visit(childPath, value, key);
    } else {
      walk(child, childPath, childPattern, visit);
    }
  }
}

function walkSchema(schema: unknown, visit: Visit): void {
  if (!isRecord(schema)) return;
  for (const section of SECTIONS) {
    const value = schema[section];
    if (Array.isArray(value)) {
      walk(value, section, section, visit);
    } else if (isRecord(value)) {
      for (const [name, child] of Object.entries(value)) {
        if (section === 'enums' && EXCLUDED_ENUMS.has(name)) continue;
        walk(child, `${section}/${name}`, `${section}/*`, visit);
      }
    }
  }
}

/** Translatable strings of the schema: path → English text. */
export function collectSchemaStrings(schema: unknown): Map<string, string> {
  const strings = new Map<string, string>();
  walkSchema(schema, (path, holder, key) => {
    const text = holder[key];
    if (typeof text === 'string' && text.trim() !== '') strings.set(path, text);
  });
  return strings;
}

/** A translated copy of the schema; the input is not modified. */
export function translateSchema<T>(schema: T, dict: SchemaDictionary): T {
  const copy = structuredClone(schema);
  walkSchema(copy, (path, holder, key) => {
    const entry = dict[path];
    if (entry && entry.uk !== '' && entry.en === holder[key]) holder[key] = entry.uk;
  });
  return copy;
}
