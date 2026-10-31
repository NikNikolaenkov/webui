/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeError,
  helperRequest,
  isPolicyError,
  PeopleApiError,
  type Transport,
} from '../../src/features/people/client.ts';

const BASE = 'https://helper.example.test';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A transport whose token becomes `next` after a refresh; records every call. */
function transport(responses: Response[], opts: { token?: string; next?: string | null; canRefresh?: boolean } = {}) {
  let token: string | null = opts.token ?? 'old';
  const calls: { url: string; auth: string | null; redirect?: RequestRedirect; credentials?: RequestCredentials }[] =
    [];
  let refreshes = 0;
  const t: Transport = {
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        auth: new Headers(init?.headers).get('authorization'),
        redirect: init?.redirect,
        credentials: init?.credentials,
      });
      const r = responses.shift();
      if (!r) throw new TypeError('Failed to fetch');
      return r;
    },
    token: () => token,
    canRefresh: () => opts.canRefresh ?? true,
    refresh: async () => {
      refreshes++;
      if (opts.next !== undefined) token = opts.next;
    },
  };
  return { t, calls, refreshes: () => refreshes };
}

test('401: refresh once and retry with the new token', async () => {
  const x = transport([json(401, { error: { code: 'unauthorized', message: 'x' } }), json(200, { ok: 1 })], {
    next: 'new',
  });
  assert.deepEqual(await helperRequest(BASE, '/me', {}, x.t), { ok: 1 });
  assert.equal(x.refreshes(), 1);
  assert.deepEqual(
    x.calls.map((c) => c.auth),
    ['Bearer old', 'Bearer new'],
  );
  assert.equal(x.calls[0]!.url, `${BASE}/api/v1/me`);
  assert.equal(x.calls[0]!.redirect, 'error', 'never follow redirects with the bearer');
  assert.equal(x.calls[0]!.credentials, 'omit');
});

test('401 twice: one refresh only, then the 401 surfaces', async () => {
  const x = transport([json(401, {}), json(401, { error: { code: 'unauthorized', message: 'bad' } })], { next: 'new' });
  await assert.rejects(helperRequest(BASE, '/me', {}, x.t), (e) => e instanceof PeopleApiError && e.status === 401);
  assert.equal(x.refreshes(), 1);
  assert.equal(x.calls.length, 2);
});

test('401 without a refresh token, or when the refresh yields the same token: no retry', async () => {
  const a = transport([json(401, {})], { canRefresh: false });
  await assert.rejects(helperRequest(BASE, '/me', {}, a.t), (e) => e instanceof PeopleApiError && e.status === 401);
  assert.equal(a.refreshes(), 0);
  const b = transport([json(401, {})], { next: 'old' });
  await assert.rejects(helperRequest(BASE, '/me', {}, b.t), (e) => e instanceof PeopleApiError && e.status === 401);
  assert.equal(b.calls.length, 1);
  const c = transport([json(401, {})], { next: null });
  await assert.rejects(helperRequest(BASE, '/me', {}, c.t));
  assert.equal(c.calls.length, 1);
});

test('403 policy refusals are not treated as an expired token', async () => {
  for (const code of ['origin_not_allowed', 'client_not_allowed']) {
    const x = transport([json(403, { error: { code, message: 'policy' } })]);
    await assert.rejects(
      helperRequest(BASE, '/me', {}, x.t),
      (e) => e instanceof PeopleApiError && e.status === 403 && e.code === code && isPolicyError(e),
    );
    assert.equal(x.refreshes(), 0, code);
  }
  const forbidden = new PeopleApiError(403, 'forbidden', 'no role');
  assert.equal(isPolicyError(forbidden), false);
});

test('network failure → code network; body and method are sent', async () => {
  const x = transport([]);
  await assert.rejects(helperRequest(BASE, '/me', {}, x.t), (e) => e instanceof PeopleApiError && e.code === 'network');
  let seen: RequestInit | undefined;
  const y: Transport = {
    fetch: async (_u, init) => ((seen = init), json(201, { id: 'l1' })),
    token: () => 't',
    canRefresh: () => false,
    refresh: async () => undefined,
  };
  assert.deepEqual(await helperRequest(BASE, '/lines', { method: 'POST', body: { number: '1201' } }, y), { id: 'l1' });
  assert.equal(seen?.method, 'POST');
  assert.equal(seen?.body, '{"number":"1201"}');
  assert.equal(new Headers(seen?.headers).get('content-type'), 'application/json');
});

test('error text: our codes translated, helper messages (already Ukrainian) kept', () => {
  const t = (key: string, fallback: string) => `T:${key}|${fallback}`;
  for (const code of ['network', 'not_configured', 'origin_not_allowed', 'client_not_allowed', 'unavailable']) {
    assert.match(
      describeError(new PeopleApiError(0, code, 'raw TypeError text'), t),
      new RegExp(`^T:people\\.error\\.${code}\\|`),
    );
  }
  assert.match(describeError(new PeopleApiError(401, 'unauthorized', 'x'), t), /^T:people\.error\.unauthorized\|/);
  assert.equal(
    describeError(new PeopleApiError(409, 'conflict', 'Обліковий запис уже видалено'), t),
    'Обліковий запис уже видалено',
  );
  assert.match(describeError(new PeopleApiError(500, 'http', ''), t), /^T:people\.error\.http\|/);
  assert.match(describeError(new Error('boom'), t), /^T:people\.error\.unknown\|/);
  assert.match(describeError(null, t), /^T:people\.error\.unknown\|/);
});
