/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Org tree logic shared by «Люди» (move) and the org chart (drag and drop): the UI refuses a move that would make a
// cycle before asking the helper, which checks again (409). Pure module, tested with node --test.

export interface TreePerson {
  cardId: string;
  managerCardId: string | null;
}

export interface TreeUnit {
  id: string;
  name: string;
  parentUnitId: string | null;
  headCardId: string | null;
}

export type MoveTarget = { unitId: string } | { managerCardId: string };
export type MoveError = 'self' | 'cycle' | 'unknown';

/** Everyone below `cardId` through managerCardId (direct and indirect), without `cardId` itself. */
export function subordinatesOf(people: readonly TreePerson[], cardId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const p of people) {
    if (p.managerCardId) children.set(p.managerCardId, [...(children.get(p.managerCardId) ?? []), p.cardId]);
  }
  const seen = new Set<string>([cardId]);
  const queue = [...(children.get(cardId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  seen.delete(cardId);
  return seen;
}

/**
 * Why moving `cardId` to `target` is refused, or null. Onto a unit the person goes under the unit's head (unless
 * they are the head); under a person they go under that person. A new manager inside their own branch → cycle.
 */
export function moveError(
  people: readonly TreePerson[],
  units: readonly TreeUnit[],
  cardId: string,
  target: MoveTarget,
): MoveError | null {
  let manager: string | null;
  if ('unitId' in target) {
    const unit = units.find((u) => u.id === target.unitId);
    if (!unit) return 'unknown';
    manager = unit.headCardId && unit.headCardId !== cardId ? unit.headCardId : null;
  } else {
    if (target.managerCardId === cardId) return 'self';
    if (!people.some((p) => p.cardId === target.managerCardId)) return 'unknown';
    manager = target.managerCardId;
  }
  if (manager && subordinatesOf(people, cardId).has(manager)) return 'cycle';
  return null;
}

/** Why moving unit `unitId` under `parentUnitId` is refused, or null (null parent = top level). */
export function unitMoveError(
  units: readonly TreeUnit[],
  unitId: string,
  parentUnitId: string | null,
): MoveError | null {
  if (parentUnitId === null) return null;
  if (parentUnitId === unitId) return 'self';
  const byId = new Map(units.map((u) => [u.id, u]));
  if (!byId.has(parentUnitId)) return 'unknown';
  const seen = new Set<string>();
  for (let cur: string | null = parentUnitId; cur && !seen.has(cur); cur = byId.get(cur)?.parentUnitId ?? null) {
    if (cur === unitId) return 'cycle';
    seen.add(cur);
  }
  return null;
}

/** Units from the top down to `unitId` (empty if unknown); stops on a loop in the data. */
export function unitPath<U extends TreeUnit>(units: readonly U[], unitId: string | null): U[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const path: U[] = [];
  const seen = new Set<string>();
  for (
    let cur = unitId ? byId.get(unitId) : undefined;
    cur && !seen.has(cur.id);
    cur = cur.parentUnitId ? byId.get(cur.parentUnitId) : undefined
  ) {
    seen.add(cur.id);
    path.unshift(cur);
  }
  return path;
}
