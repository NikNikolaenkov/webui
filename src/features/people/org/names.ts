/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** «Прізвище І.» for the head line of a unit block. */
export function shortName(name: string) {
  const [last, first] = name.split(/\s+/).filter(Boolean);
  return last && first ? `${last} ${first[0]}.` : name;
}
