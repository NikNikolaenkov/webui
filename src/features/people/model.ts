/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// What the people helper's REST API returns (people-helper lib/domain/model.ts) and the UI's own view logic: the
// edit form, which parts of a card a role sees, which lifecycle buttons apply, search. The helper owns the mapping
// to JSContact. Pure module, tested with node --test.

import type { PeopleRole } from './menu';
import type { CustomValues } from './custom';

export type Status = 'active' | 'blocked' | 'deleted' | 'archived';

export interface Person {
  cardId: string;
  fullName: string;
  title: string | null;
  emails: { address: string; label?: string }[];
  phones: { number: string; label?: string }[];
  online: { service: string; user: string }[];
  unitId: string | null;
  managerCardId: string | null;
  systems: Record<string, string>;
  status: Status;
  statusDates: Record<string, string>;
  accountId: string | null;
  accountEmail: string | null;
  /** True when the helper may act on the account (block, delete, …). */
  managed: boolean;
  /** Work custom field values by field id (as stored; may include archived fields or ones outside the unit). */
  custom: CustomValues;
}

export interface HrCard {
  cardId: string | null;
  birthday: string | null;
  personalEmails: string[];
  personalPhones: string[];
  notes: string | null;
  /** HR custom field values by field id. */
  custom: CustomValues;
}

export interface Unit {
  id: string;
  name: string;
  parentUnitId: string | null;
  headCardId: string | null;
  bitrixCode: string | null;
}

export interface LineHistoryEntry {
  holderCardId: string;
  from: string;
  to: string | null;
  by: string;
}

export interface Line {
  id: string;
  number: string;
  label: string | null;
  holderCardId: string | null;
  history: LineHistoryEntry[];
}

export interface AuditEntry {
  id: number;
  at: string;
  actorEmail: string;
  source: string;
  entity: string;
  entityId: string;
  summary: string;
  hr: boolean;
}

export interface ArchivedPerson extends Person {
  history: { at?: string; actorEmail?: string; summary?: string }[];
  hr: HrCard | null;
}

// ---------- edit form ----------

export interface PersonForm {
  fullName: string;
  title: string;
  emails: { address: string; label: string }[];
  phones: { number: string; label: string }[];
  online: { service: string; user: string }[];
  systems: { key: string; value: string }[];
}

/** PATCH /people/:id body: work fields only (unit and manager change through «move»). */
export interface WorkPatch {
  fullName: string;
  title: string | null;
  emails: { address: string; label?: string }[];
  phones: { number: string; label?: string }[];
  online: { service: string; user: string }[];
  systems: Record<string, string>;
  /** Only the custom values that changed (null clears); omitted when none. */
  custom?: Record<string, unknown>;
}

export const emptyForm = (): PersonForm => ({
  fullName: '',
  title: '',
  emails: [],
  phones: [],
  online: [],
  systems: [],
});

export function personToForm(p: Person): PersonForm {
  return {
    fullName: p.fullName,
    title: p.title ?? '',
    emails: p.emails.map((e) => ({ address: e.address, label: e.label ?? '' })),
    phones: p.phones.map((x) => ({ number: x.number, label: x.label ?? '' })),
    online: p.online.map((o) => ({ ...o })),
    systems: Object.entries(p.systems).map(([key, value]) => ({ key, value })),
  };
}

const withLabel = <T extends object>(value: T, label: string): T & { label?: string } =>
  label.trim() ? { ...value, label: label.trim() } : value;

/** Trims everything and drops empty rows; an empty title is null. */
export function formToPatch(f: PersonForm): WorkPatch {
  return {
    fullName: f.fullName.trim(),
    title: f.title.trim() || null,
    emails: f.emails.filter((e) => e.address.trim()).map((e) => withLabel({ address: e.address.trim() }, e.label)),
    phones: f.phones.filter((x) => x.number.trim()).map((x) => withLabel({ number: x.number.trim() }, x.label)),
    online: f.online
      .filter((o) => o.service.trim() && o.user.trim())
      .map((o) => ({ service: o.service.trim(), user: o.user.trim() })),
    systems: Object.fromEntries(f.systems.filter((s) => s.key.trim()).map((s) => [s.key.trim(), s.value.trim()])),
  };
}

// ---------- what a role sees ----------

export type CardSection = 'account' | 'work' | 'systems' | 'lines' | 'hr' | 'history';

/** HR fields are requested only for HR and admins: support never asks the helper (which would refuse anyway). */
export function shouldLoadHr(role: PeopleRole | null): boolean {
  return role === 'hr' || role === 'admin';
}

export function cardSections(role: PeopleRole | null): CardSection[] {
  if (!role) return [];
  return ['account', 'work', 'systems', 'lines', ...(shouldLoadHr(role) ? (['hr'] as const) : []), 'history'];
}

// ---------- lifecycle ----------

export type LifecycleAction = 'block' | 'unblock' | 'delete' | 'restore' | 'resetPassword';

/** Buttons for the card; the helper re-checks the real state and the caller's right to act on this account. */
export function lifecycleActions(p: Person): LifecycleAction[] {
  if (!p.managed || !p.accountId) return [];
  switch (p.status) {
    case 'active':
      return ['block', 'resetPassword', 'delete'];
    case 'blocked':
      return ['unblock', 'delete'];
    case 'deleted':
      return ['restore'];
    default:
      return [];
  }
}

/** Actions whose result carries a new password, shown once. */
export const RETURNS_PASSWORD: ReadonlySet<LifecycleAction> = new Set(['unblock', 'restore', 'resetPassword']);

// ---------- search ----------

export interface PeopleQuery {
  query?: string;
  unitId?: string | null;
  status?: Status | null;
}

const collator = new Intl.Collator('uk', { sensitivity: 'base' });

export function filterPeople<P extends Person>(people: readonly P[], q: PeopleQuery): P[] {
  const needle = (q.query ?? '').trim().toLocaleLowerCase('uk');
  return people
    .filter((p) => !q.unitId || p.unitId === q.unitId)
    .filter((p) => !q.status || p.status === q.status)
    .filter((p) => {
      if (!needle) return true;
      const hay = [
        p.fullName,
        p.title ?? '',
        p.accountEmail ?? '',
        ...p.emails.map((e) => e.address),
        ...p.phones.map((x) => x.number),
        ...p.online.map((o) => o.user),
      ]
        .join('\n')
        .toLocaleLowerCase('uk');
      return hay.includes(needle);
    })
    .sort((a, b) => collator.compare(a.fullName, b.fullName));
}
