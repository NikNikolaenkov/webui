/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Who may see «Персонал»: asked once per session from the people helper (GET /api/v1/me) next to the server schema
// (src/data/session.ts), and only on the admin UIs this build names (see config.ts). No role, helper not configured
// for this page, unreachable or 401 → no section. A policy refusal of the helper (403 origin_not_allowed /
// client_not_allowed) is a configuration error: the section appears and says so instead of vanishing silently.

import { create } from 'zustand';
import i18n from '@/i18n';
import { peopleApi, helperUrl } from './api';
import { isPolicyError } from './client';
import { parseRole, withPeopleSection, type PeopleAccessState, type PeopleRole } from './menu';

interface PeopleAccess {
  role: PeopleRole | null;
  email: string | null;
  /** Code of the helper's policy refusal (origin_not_allowed, client_not_allowed), if any. */
  configError: string | null;
}

export const usePeopleAccess = create<PeopleAccess>(() => ({ role: null, email: null, configError: null }));

const ROLE_TIMEOUT_MS = 6000;

/** Never rejects: the admin UI must load even when the helper is down. */
export async function loadPeopleRole(signal?: AbortSignal): Promise<PeopleAccessState> {
  usePeopleAccess.setState({ role: null, email: null, configError: null });
  if (!helperUrl()) return null;
  const timeout = AbortSignal.timeout(ROLE_TIMEOUT_MS);
  try {
    const me = await peopleApi.me(signal ? AbortSignal.any([signal, timeout]) : timeout);
    const role = parseRole(me.role);
    usePeopleAccess.setState({ role, email: role ? me.email : null });
    return role;
  } catch (err) {
    if (isPolicyError(err)) {
      console.error('«Персонал»: the people helper refused this admin UI by policy:', err.code);
      usePeopleAccess.setState({ configError: err.code });
      return 'misconfigured';
    }
    return null;
  }
}

/** The schema with the section for `access` (labels in the account's language, set just before). */
export function addPeopleSection<S extends Parameters<typeof withPeopleSection>[0]>(
  schema: S,
  access: PeopleAccessState,
): S {
  return withPeopleSection(schema, access, (key, fallback) => i18n.t(key, fallback));
}
