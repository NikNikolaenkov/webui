/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Client of the people helper's REST API (${VITE_PEOPLE_HELPER_URL}/api/v1), bound to the admin UI's token store.
// Every call carries the admin UI's own Stalwart access token; the helper verifies it (Origin allow-list + Stalwart
// introspection) and applies the person's role. «Персонал» reads and writes only through here: no direct JMAP
// writes to the registry's cards. Requests go out only from the admin UIs named in VITE_PEOPLE_UI_ORIGINS
// (config.ts). Passwords in responses (unblock, restore, reset-password, create) are returned once with no-store;
// callers show them once and keep them only in component state.

import { getBasePath } from '@/lib/basePath';
import { refreshAccessToken } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { helperRequest, PeopleApiError, type RequestOptions, type Transport } from './client';
import { resolveHelperUrl } from './config';
import type { FieldDef } from './custom';
import type { LifecycleAction, ArchivedPerson, AuditEntry, HrCard, Line, Person, Unit, WorkPatch } from './model';
import type { MoveTarget } from './tree';
import type { ExportResult, ImportPreview, ImportResult, MirrorReport, MirrorStatus, SheetsStatus } from './exchange';
import type { PeopleRole } from './menu';

export { PeopleApiError } from './client';

/**
 * Build-time settings (not secrets): VITE_PEOPLE_HELPER_URL and VITE_PEOPLE_UI_ORIGINS. Null — section off, no
 * request — unless this page (origin + base path) is one of the configured admin UIs and the helper URL is https.
 */
export function helperUrl(): string | null {
  return resolveHelperUrl(
    {
      helperUrl: import.meta.env.VITE_PEOPLE_HELPER_URL as string | undefined,
      uiOrigins: import.meta.env.VITE_PEOPLE_UI_ORIGINS as string | undefined,
    },
    window.location.origin,
    getBasePath(),
  );
}

const transport: Transport = {
  fetch: (url, init) => fetch(url, init),
  token: () => useAuthStore.getState().accessToken,
  canRefresh: () => Boolean(useAuthStore.getState().refreshToken),
  refresh: () => refreshAccessToken(),
};

export async function peopleFetch<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const base = helperUrl();
  if (!base) throw new PeopleApiError(0, 'not_configured', '');
  const auth = useAuthStore.getState();
  if (auth.refreshToken && auth.isTokenExpiringSoon()) await refreshAccessToken().catch(() => undefined);
  return helperRequest<T>(base, path, init, transport);
}

const enc = encodeURIComponent;
const LIFECYCLE_PATH: Record<LifecycleAction, string> = {
  block: 'block',
  unblock: 'unblock',
  delete: 'delete',
  restore: 'restore',
  resetPassword: 'reset-password',
};

export interface LifecycleResult {
  status?: string;
  password?: string;
  purgeAfter?: string;
}

export interface CreatePersonInput {
  account?: { login: string };
  card: WorkPatch & { unitId?: string | null; managerCardId?: string | null };
  hrCard?: Partial<Omit<HrCard, 'cardId' | 'custom'>> & { custom?: Record<string, unknown> };
}

export interface FieldInput {
  label: string;
  type: FieldDef['type'];
  visibility: FieldDef['visibility'];
  options?: string[];
  unitIds?: string[];
  hint?: string | null;
  order?: number;
}
export type FieldPatch = Partial<Pick<FieldDef, 'label' | 'hint' | 'options' | 'unitIds' | 'order' | 'archived'>>;

export const peopleApi = {
  me: (signal?: AbortSignal) => peopleFetch<{ email: string; role: PeopleRole | null }>('/me', { signal }),

  listPeople: (signal?: AbortSignal) => peopleFetch<{ people: Person[] }>('/people', { signal }).then((r) => r.people),
  getPerson: (id: string, signal?: AbortSignal) => peopleFetch<Person>(`/people/${enc(id)}`, { signal }),
  createPerson: (input: CreatePersonInput) =>
    peopleFetch<{ person: Person; password?: string }>('/people', { method: 'POST', body: input }),
  updatePerson: (id: string, patch: WorkPatch) =>
    peopleFetch<Person>(`/people/${enc(id)}`, { method: 'PATCH', body: patch }),
  movePerson: (id: string, target: MoveTarget) =>
    peopleFetch<Person>(`/people/${enc(id)}/move`, { method: 'POST', body: target }),
  getHr: (id: string, signal?: AbortSignal) => peopleFetch<HrCard>(`/people/${enc(id)}/hr`, { signal }),
  putHr: (id: string, hr: Omit<HrCard, 'cardId' | 'custom'> & { custom?: Record<string, unknown> }) =>
    peopleFetch<HrCard>(`/people/${enc(id)}/hr`, { method: 'PUT', body: hr }),
  lifecycle: (id: string, action: LifecycleAction) =>
    peopleFetch<LifecycleResult>(`/people/${enc(id)}/${LIFECYCLE_PATH[action]}`, { method: 'POST' }),

  listUnits: (signal?: AbortSignal) => peopleFetch<{ units: Unit[] }>('/units', { signal }).then((r) => r.units),
  createUnit: (input: {
    name: string;
    parentUnitId?: string | null;
    headCardId?: string | null;
    bitrixCode?: string | null;
  }) => peopleFetch<Unit>('/units', { method: 'POST', body: input }),
  moveUnit: (id: string, parentUnitId: string | null) =>
    peopleFetch<Unit>(`/units/${enc(id)}/move`, { method: 'POST', body: { parentUnitId } }),

  listLines: (signal?: AbortSignal) => peopleFetch<{ lines: Line[] }>('/lines', { signal }).then((r) => r.lines),
  createLine: (input: { number: string; label?: string }) =>
    peopleFetch<Line>('/lines', { method: 'POST', body: input }),
  assignLine: (lineId: string, cardId: string) =>
    peopleFetch<Line>(`/lines/${enc(lineId)}/assign`, { method: 'POST', body: { cardId } }),
  releaseLine: (lineId: string) => peopleFetch<Line>(`/lines/${enc(lineId)}/release`, { method: 'POST' }),

  // Custom field definitions (read: every role, support gets work fields only; write: HR/admin). Archived included.
  listFields: (signal?: AbortSignal) =>
    peopleFetch<{ fields: FieldDef[] }>('/fields?archived=1', { signal }).then((r) => r.fields),
  createField: (input: FieldInput) => peopleFetch<FieldDef>('/fields', { method: 'POST', body: input }),
  updateField: (id: string, patch: FieldPatch) =>
    peopleFetch<FieldDef>(`/fields/${enc(id)}`, { method: 'PATCH', body: patch }),

  audit: (entityId: string, signal?: AbortSignal) =>
    peopleFetch<{ entries: AuditEntry[] }>(`/audit?entityId=${enc(entityId)}&limit=200`, { signal }).then(
      (r) => r.entries,
    ),
  archive: (signal?: AbortSignal) =>
    peopleFetch<{ people: ArchivedPerson[] }>('/archive', { signal }).then((r) => r.people),

  // Google Sheets exchange. Rows travel in the request body only; the HR export (hr: true) is HR/admin only.
  sheetsStatus: (signal?: AbortSignal) => peopleFetch<SheetsStatus>('/sheets/status', { signal }),
  exportSheet: (input: { hr?: boolean; spreadsheetId?: string; sheet?: string }) =>
    peopleFetch<ExportResult>('/sheets/export', { method: 'POST', body: input }),
  importPreview: (source: { rows: string[][] } | { spreadsheetId: string; sheet: string }) =>
    peopleFetch<ImportPreview>('/sheets/import/preview', { method: 'POST', body: source }),
  importApply: (input: { previewId: string; confirm: true; rows?: string[][] }) =>
    peopleFetch<ImportResult>('/sheets/import/apply', { method: 'POST', body: input }),
  mirrors: (signal?: AbortSignal) =>
    peopleFetch<{ mirrors: MirrorStatus[] }>('/sheets/mirrors', { signal }).then((r) => r.mirrors),
  runMirrors: () =>
    peopleFetch<{ reports: MirrorReport[] }>('/sheets/mirrors/run', { method: 'POST' }).then((r) => r.reports),
};
