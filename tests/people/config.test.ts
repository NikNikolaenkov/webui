/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHelperUrl } from '../../src/features/people/config.ts';

const ADMIN = 'https://admin.example.test';
const HELPER = 'https://helper.example.test';

test('section only on the configured admin UI origins (no bearer leaves other installations)', () => {
  assert.equal(resolveHelperUrl({ helperUrl: HELPER, uiOrigins: ADMIN }, ADMIN), HELPER);
  assert.equal(
    resolveHelperUrl({ helperUrl: `${HELPER}/`, uiOrigins: ` ${ADMIN}/ , https://other.test` }, ADMIN),
    HELPER,
  );
  // Another site running the same public release: no section, no request.
  assert.equal(resolveHelperUrl({ helperUrl: HELPER, uiOrigins: ADMIN }, 'https://someone-else.example'), null);
  assert.equal(
    resolveHelperUrl({ helperUrl: HELPER, uiOrigins: ADMIN }, 'http://admin.example.test'),
    null,
    'scheme matters',
  );
  assert.equal(resolveHelperUrl({ helperUrl: HELPER, uiOrigins: '' }, ADMIN), null, 'no origins = off');
  assert.equal(resolveHelperUrl({ helperUrl: HELPER }, ADMIN), null);
  assert.equal(resolveHelperUrl({ helperUrl: '', uiOrigins: ADMIN }, ADMIN), null, 'no helper = off');
  assert.equal(resolveHelperUrl({}, ADMIN), null);
});

test('helper URL must be https, except loopback for local checks', () => {
  const on = (helperUrl: string) => resolveHelperUrl({ helperUrl, uiOrigins: ADMIN }, ADMIN);
  assert.equal(on('http://helper.example.test'), null);
  assert.equal(on('ftp://helper.example.test'), null);
  assert.equal(on('not a url'), null);
  assert.equal(on('https://user:pw@helper.example.test'), null, 'no credentials in the URL');
  assert.equal(on('http://127.0.0.1:3201'), 'http://127.0.0.1:3201');
  assert.equal(on('http://localhost:3201/'), 'http://localhost:3201');
  assert.equal(on('http://[::1]:3201'), 'http://[::1]:3201');
  assert.equal(on('http://127.0.0.1.evil.test'), null);
  assert.equal(on('https://helper.example.test/base/'), 'https://helper.example.test/base');
});
