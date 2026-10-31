/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Transport to the people helper, independent of the UI's stores (api.ts binds it to them), tested with node --test.
//  - the bearer is sent with credentials omitted and redirects refused (a redirect never carries the token on);
//  - only a 401 (invalid/expired token) triggers ONE token refresh and ONE retry;
//  - 403 `origin_not_allowed` / `client_not_allowed` are configuration errors, shown as such, never a refresh.

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

export const POLICY_CODES: ReadonlySet<string> = new Set(['origin_not_allowed', 'client_not_allowed']);

export function isPolicyError(err: unknown): err is PeopleApiError {
  return err instanceof PeopleApiError && err.status === 403 && POLICY_CODES.has(err.code);
}

export interface Transport {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  token: () => string | null;
  /** True when a refresh token exists. */
  canRefresh: () => boolean;
  /** Refreshes the access token (shared with the rest of the UI); may throw. */
  refresh: () => Promise<void>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
}

async function send(base: string, path: string, init: RequestOptions, token: string | null, t: Transport) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  try {
    return await t.fetch(`${base}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new PeopleApiError(0, 'network', String(err instanceof Error ? err.message : err));
  }
}

export async function helperRequest<T>(base: string, path: string, init: RequestOptions, t: Transport): Promise<T> {
  const token = t.token();
  let res = await send(base, path, init, token, t);
  if (res.status === 401 && t.canRefresh()) {
    await t.refresh().catch(() => undefined);
    const next = t.token();
    if (next && next !== token) res = await send(base, path, init, next, t);
  }

  const text = await res.text().catch(() => '');
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) {
    const e = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    throw new PeopleApiError(
      res.status,
      typeof e?.code === 'string' ? e.code : 'http',
      typeof e?.message === 'string' ? e.message : '',
    );
  }
  return body as T;
}

type Translate = (key: string, fallback: string) => string;

/** Codes whose text the UI owns; anything else from the helper carries its own (Ukrainian) message. */
const OWN_TEXT: Record<string, string> = {
  network: 'The people helper cannot be reached.',
  not_configured: '«Personnel» is not configured for this admin address.',
  origin_not_allowed:
    'The people helper does not accept requests from this admin address (BEARER_ORIGINS). Ask the administrator to fix the configuration.',
  client_not_allowed:
    'The people helper does not accept tokens of this OAuth client (STALWART_ADMIN_CLIENT_IDS). Ask the administrator to fix the configuration.',
  unavailable: 'The people helper is not configured or not running.',
  unauthorized: 'The session is no longer valid: sign in again.',
  not_found: 'Not found.',
};

/** A message for people: never a raw browser error. */
export function describeError(err: unknown, t: Translate): string {
  if (err instanceof PeopleApiError) {
    if (OWN_TEXT[err.code]) return t(`people.error.${err.code}`, OWN_TEXT[err.code]);
    if (err.message) return err.message;
    return t('people.error.http', 'The people helper answered with an error.');
  }
  return t('people.error.unknown', 'Something went wrong.');
}
