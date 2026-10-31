/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Where «Персонал» may talk to the people helper. The fork's release is public and runs on other people's servers:
// the admin's Stalwart bearer goes to the helper ONLY when this page is one of the admin UIs the build names
// (VITE_PEOPLE_UI_ORIGINS) and the helper URL is https (loopback allowed for local checks). Otherwise the section
// is absent and no request is made. Pure module, tested with node --test.

export interface HelperEnv {
  /** VITE_PEOPLE_HELPER_URL */
  helperUrl?: string;
  /** VITE_PEOPLE_UI_ORIGINS: comma-separated origins of the admin UI that may use the helper */
  uiOrigins?: string;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

const trimSlash = (s: string) => s.trim().replace(/\/+$/, '');

export function resolveHelperUrl(env: HelperEnv, pageOrigin: string): string | null {
  const origins = (env.uiOrigins ?? '').split(',').map(trimSlash).filter(Boolean);
  if (!origins.includes(trimSlash(pageOrigin))) return null;
  if (!env.helperUrl?.trim()) return null;
  let url: URL;
  try {
    url = new URL(env.helperUrl.trim());
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
  if (!secure) return null;
  return trimSlash(`${url.origin}${url.pathname}`);
}
