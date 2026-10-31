/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// The «Персонал» section: added to the server schema's layouts on the client (like translateSchema), only for
// people whose role the people helper confirms (GET /api/v1/me). The helper and Stalwart enforce access; the menu
// only decides what to show. Pure module (no '@/' runtime imports): tested with node --test.

import type { Layout, LayoutItem } from '@/types/schema';

export type PeopleRole = 'hr' | 'support' | 'admin';
export type Label = (key: string, fallback: string) => string;

/** Route id of the section (/Personnel/...); shown through t('layouts.Personnel'). */
export const PEOPLE_SECTION = 'Personnel';

/** Component name prefix: every view of the section is CustomComponent/People*. */
export const PEOPLE_COMPONENT_PREFIX = 'People';

export const PEOPLE_VIEWS = {
  org: 'CustomComponent/PeopleOrg',
  people: 'CustomComponent/People',
  lines: 'CustomComponent/PeopleLines',
  archive: 'CustomComponent/PeopleArchive',
  discrepancies: 'CustomComponent/PeopleDiscrepancies',
  exchange: 'CustomComponent/PeopleExchange',
  fields: 'CustomComponent/PeopleFields',
} as const;

const ROLES: readonly PeopleRole[] = ['hr', 'support', 'admin'];

export function parseRole(value: unknown): PeopleRole | null {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value) ? (value as PeopleRole) : null;
}

/** HR and admins see personal fields, the archive and the custom field definitions; support never does. */
export function isHrRole(role: PeopleRole | null | undefined): boolean {
  return role === 'hr' || role === 'admin';
}

const keep: Label = (_key, fallback) => fallback;

/**
 * What the helper said about this session: a role, `misconfigured` (it refused the admin UI by policy — the section
 * appears with one entry that explains the configuration error), or null (no section).
 */
export type PeopleAccessState = PeopleRole | 'misconfigured' | null;

export function peopleLayout(role: PeopleRole | 'misconfigured', label: Label = keep): Layout {
  const link = (key: string, fallback: string, icon: string, viewName: string): LayoutItem => ({
    link: { name: label(`people.menu.${key}`, fallback), icon, viewName },
  });
  if (role === 'misconfigured') {
    return { name: PEOPLE_SECTION, icon: 'contact', items: [link('people', 'People', 'users', PEOPLE_VIEWS.people)] };
  }
  return {
    name: PEOPLE_SECTION,
    icon: 'contact',
    items: [
      link('org', 'Org chart', 'network', PEOPLE_VIEWS.org),
      link('people', 'People', 'users', PEOPLE_VIEWS.people),
      link('lines', 'Phone lines', 'phone', PEOPLE_VIEWS.lines),
      ...(isHrRole(role) ? [link('archive', 'Archive', 'archive', PEOPLE_VIEWS.archive)] : []),
      link('discrepancies', 'Discrepancies', 'triangle-alert', PEOPLE_VIEWS.discrepancies),
      link('exchange', 'Import / export', 'upload', PEOPLE_VIEWS.exchange),
      ...(isHrRole(role) ? [link('fields', 'Fields', 'sliders-horizontal', PEOPLE_VIEWS.fields)] : []),
    ],
  };
}

/**
 * The schema with the «Персонал» section (before «Account», else last) when `role` is a people role (or
 * `misconfigured`); otherwise
 * the schema unchanged. Never mutates the input; replaces an earlier copy of the section.
 */
export function withPeopleSection<S extends { layouts: Layout[] }>(
  schema: S,
  role: PeopleAccessState,
  label?: Label,
): S {
  if (!role) return schema;
  const layouts = schema.layouts.filter((l) => l.name !== PEOPLE_SECTION);
  const at = layouts.findIndex((l) => l.name === 'Account');
  const section = peopleLayout(role, label);
  if (at < 0) layouts.push(section);
  else layouts.splice(at, 0, section);
  return { ...schema, layouts };
}
