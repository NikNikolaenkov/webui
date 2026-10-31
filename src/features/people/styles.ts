/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Table classes shared with the fork's lists (src/components/lists/ListTable.tsx).
export const HEADER_CELL =
  'px-3.5 py-2.5 first:pl-5 last:pr-5 text-left text-[11px] font-semibold uppercase tracking-wider text-dim';
export const BODY_CELL = 'px-3.5 py-2.5 first:pl-5 last:pr-5 align-middle';
export const ROW = 'relative border-t border-border transition-colors duration-150 hover:bg-muted/55';
export const STRETCHED_LINK =
  "font-semibold text-foreground hover:underline focus-visible:outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring";

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return withTime
    ? d.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
    : d.toLocaleDateString('uk-UA');
}
