/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// A stand-in for the three Stalwart endpoints the admin UI loads at start (/jmap/session, /api/schema,
// /api/account), so the «Персонал» section can be checked locally against the people helper's demo mode
// (people-helper: PEOPLE_HELPER_DEMO=1 npm run demo). No data, no secrets; any bearer is accepted.
//
//   node --experimental-strip-types tools/people/demo-stalwart.ts            (port 8090)
//   VITE_API_BASE_URL=http://127.0.0.1:8090 VITE_PEOPLE_HELPER_URL=http://127.0.0.1:3201 \
//     VITE_PEOPLE_UI_ORIGINS=http://localhost:5173 VITE_ACCESS_TOKEN=demo-hr npx vite
//   (tokens: demo-hr | demo-support | demo-admin | demo-none)

import { createServer } from 'node:http';

const port = Number(process.env.DEMO_STALWART_PORT ?? 8090);

const schema = {
  objects: {},
  schemas: {},
  fields: {},
  forms: {},
  lists: {},
  enums: {},
  dashboards: [],
  layouts: [
    {
      name: 'Account',
      icon: 'circle-user',
      items: [{ link: { name: 'Demo', icon: 'circle-user', viewName: 'CustomComponent/DemoAccount' } }],
    },
  ],
};

const routes: Record<string, unknown> = {
  '/jmap/session': {
    accounts: { a: { name: 'demo@localhost', isPersonal: true } },
    primaryAccounts: { 'urn:ietf:params:jmap:core': 'a' },
    apiUrl: '/jmap',
    capabilities: { 'urn:ietf:params:jmap:core': {} },
  },
  '/api/schema': schema,
  '/api/account': { permissions: [], edition: 'community', locale: 'uk' },
};

createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  const body = routes[(req.url ?? '').split('?')[0]!];
  res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body ?? { type: 'notFound' }));
}).listen(port, '127.0.0.1', () => console.log(`demo Stalwart stand-in: http://localhost:${port}`));
