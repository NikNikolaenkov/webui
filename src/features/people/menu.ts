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
} as const;

const ROLES: readonly PeopleRole[] = ['hr', 'support', 'admin'];

export function parseRole(value: unknown): PeopleRole | null {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value) ? (value as PeopleRole) : null;
}

/** HR and admins see personal fields and the archive; support never does. */
export function isHrRole(role: PeopleRole | null | undefined): boolean {
  return role === 'hr' || role === 'admin';
}

const keep: Label = (_key, fallback) => fallback;

export function peopleLayout(role: PeopleRole, label: Label = keep): Layout {
  const link = (key: string, fallback: string, icon: string, viewName: string): LayoutItem => ({
    link: { name: label(`people.menu.${key}`, fallback), icon, viewName },
  });
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
    ],
  };
}

/**
 * The schema with the «Персонал» section (before «Account», else last) when `role` is a people role; otherwise
 * the schema unchanged. Never mutates the input; replaces an earlier copy of the section.
 */
export function withPeopleSection<S extends { layouts: Layout[] }>(
  schema: S,
  role: PeopleRole | null,
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
