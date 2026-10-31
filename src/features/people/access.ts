/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Who may see «Персонал»: asked once per session from the people helper (GET /api/v1/me) next to the server schema
// (src/data/session.ts). Any failure — helper not configured, unreachable, 401/403 — means no section.

import { create } from 'zustand';
import i18n from '@/i18n';
import { peopleApi, helperUrl } from './api';
import { parseRole, withPeopleSection, type PeopleRole } from './menu';

interface PeopleAccess {
  role: PeopleRole | null;
  email: string | null;
}

export const usePeopleAccess = create<PeopleAccess>(() => ({ role: null, email: null }));

const ROLE_TIMEOUT_MS = 6000;

/** Never rejects: the admin UI must load even when the helper is down. */
export async function loadPeopleRole(signal?: AbortSignal): Promise<PeopleRole | null> {
  if (!helperUrl()) return null;
  const timeout = AbortSignal.timeout(ROLE_TIMEOUT_MS);
  try {
    const me = await peopleApi.me(signal ? AbortSignal.any([signal, timeout]) : timeout);
    const role = parseRole(me.role);
    usePeopleAccess.setState({ role, email: role ? me.email : null });
    return role;
  } catch {
    usePeopleAccess.setState({ role: null, email: null });
    return null;
  }
}

/** The schema with the section for `role` (labels in the account's language, set just before). */
export function addPeopleSection<S extends Parameters<typeof withPeopleSection>[0]>(
  schema: S,
  role: PeopleRole | null,
): S {
  return withPeopleSection(schema, role, (key, fallback) => i18n.t(key, fallback));
}
