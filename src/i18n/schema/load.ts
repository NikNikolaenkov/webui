/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SchemaDictionary } from './translate.ts';

type Importer = () => Promise<{ default: unknown }>;

/** True for uk, uk-UA, uk_UA (any case). */
export function isUkrainian(locale: string | undefined): boolean {
  return /^uk([-_]|$)/i.test(locale ?? '');
}

/**
 * The schema dictionary for the account locale, or null (English schema) for any
 * other locale or when the lazily loaded chunk fails.
 */
export async function loadSchemaDictionary(
  locale: string | undefined,
  importer: Importer = () => import('./uk.json'),
): Promise<SchemaDictionary | null> {
  if (!isUkrainian(locale)) return null;
  try {
    return (await importer()).default as SchemaDictionary;
  } catch {
    return null;
  }
}
