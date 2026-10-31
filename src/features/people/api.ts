/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Client of the people helper's REST API (${VITE_PEOPLE_HELPER_URL}/api/v1). Every call carries the admin UI's own
// Stalwart access token; the helper verifies it (Origin allow-list + Stalwart introspection) and applies the
// person's role. «Персонал» reads and writes only through here: no direct JMAP writes to the registry's cards.
// Passwords in responses (unblock, restore, reset-password, create) are returned once with no-store; callers show
// them once and keep them only in component state.

import { refreshAccessToken } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import type { LifecycleAction, ArchivedPerson, AuditEntry, HrCard, Line, Person, Unit, WorkPatch } from './model';
import type { MoveTarget } from './tree';
import type { PeopleRole } from './menu';

/** Build-time setting (not a secret); production: https://people.servgc.space. Empty = section off. */
export function helperUrl(): string | null {
  const url = import.meta.env.VITE_PEOPLE_HELPER_URL as string | undefined;
  return url ? url.replace(/\/+$/, '') : null;
}

export class PeopleApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PeopleApiError';
    this.status = status;
    this.code = code;
  }
}

interface Init {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
}

async function send(base: string, path: string, init: Init, token: string | null): Promise<Response> {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  try {
    return await fetch(`${base}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new PeopleApiError(0, 'network', String(err instanceof Error ? err.message : err));
  }
}

export async function peopleFetch<T>(path: string, init: Init = {}): Promise<T> {
  const base = helperUrl();
  if (!base) throw new PeopleApiError(0, 'not_configured', 'VITE_PEOPLE_HELPER_URL is not set');
  const auth = useAuthStore.getState();
  if (auth.refreshToken && auth.isTokenExpiringSoon()) await refreshAccessToken().catch(() => undefined);

  const token = useAuthStore.getState().accessToken;
  let res = await send(base, path, init, token);
  if (res.status === 401 && useAuthStore.getState().refreshToken) {
    // The token may have just expired: refresh once and retry (the refresh is shared with the rest of the UI).
    await refreshAccessToken().catch(() => undefined);
    const next = useAuthStore.getState().accessToken;
    if (next && next !== token) res = await send(base, path, init, next);
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new PeopleApiError(res.status, e?.code ?? 'http', e?.message ?? `HTTP ${res.status}`);
  }
  return body as T;
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
  hrCard?: Partial<Omit<HrCard, 'cardId'>>;
}

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
  putHr: (id: string, hr: Omit<HrCard, 'cardId'>) =>
    peopleFetch<HrCard>(`/people/${enc(id)}/hr`, { method: 'PUT', body: hr }),
  lifecycle: (id: string, action: LifecycleAction) =>
    peopleFetch<LifecycleResult>(`/people/${enc(id)}/${LIFECYCLE_PATH[action]}`, { method: 'POST' }),

  listUnits: (signal?: AbortSignal) => peopleFetch<{ units: Unit[] }>('/units', { signal }).then((r) => r.units),

  listLines: (signal?: AbortSignal) => peopleFetch<{ lines: Line[] }>('/lines', { signal }).then((r) => r.lines),
  createLine: (input: { number: string; label?: string }) =>
    peopleFetch<Line>('/lines', { method: 'POST', body: input }),
  assignLine: (lineId: string, cardId: string) =>
    peopleFetch<Line>(`/lines/${enc(lineId)}/assign`, { method: 'POST', body: { cardId } }),
  releaseLine: (lineId: string) => peopleFetch<Line>(`/lines/${enc(lineId)}/release`, { method: 'POST' }),

  audit: (entityId: string, signal?: AbortSignal) =>
    peopleFetch<{ entries: AuditEntry[] }>(`/audit?entityId=${enc(entityId)}&limit=200`, { signal }).then(
      (r) => r.entries,
    ),
  archive: (signal?: AbortSignal) =>
    peopleFetch<{ people: ArchivedPerson[] }>('/archive', { signal }).then((r) => r.people),
};
