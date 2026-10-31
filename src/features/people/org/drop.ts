/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// What dropping one org chart block on another means. A person onto a person goes under them; onto a unit block —
// under the unit's head; a unit onto a unit becomes its child. Cycles are refused here, before any request (the
// helper checks again and answers 409). Pure module, tested with node --test.

import { moveError, unitMoveError, type MoveError, type MoveTarget, type TreePerson, type TreeUnit } from '../tree.ts';
import { NO_UNIT, type NodeId } from './graph.ts';

export type DropPlan =
  | { kind: 'person'; cardId: string; target: MoveTarget }
  | { kind: 'unit'; unitId: string; parentUnitId: string }
  | { kind: 'refused'; reason: MoveError | 'unsupported' }
  | { kind: 'noop' };

const parse = (id: NodeId) =>
  id === NO_UNIT ? null : { kind: id.startsWith('u:') ? ('unit' as const) : ('person' as const), key: id.slice(2) };

export function planDrop(
  people: readonly (TreePerson & { unitId: string | null })[],
  units: readonly TreeUnit[],
  dragged: NodeId,
  target: NodeId,
): DropPlan {
  const from = parse(dragged);
  const to = parse(target);
  if (!from || !to) return { kind: 'refused', reason: 'unsupported' };
  if (dragged === target) return { kind: 'noop' };

  if (from.kind === 'unit') {
    if (to.kind !== 'unit') return { kind: 'refused', reason: 'unsupported' };
    if (units.find((u) => u.id === from.key)?.parentUnitId === to.key) return { kind: 'noop' };
    const why = unitMoveError(units, from.key, to.key);
    return why ? { kind: 'refused', reason: why } : { kind: 'unit', unitId: from.key, parentUnitId: to.key };
  }

  const who = people.find((p) => p.cardId === from.key);
  if (!who) return { kind: 'refused', reason: 'unknown' };
  const moveTarget: MoveTarget = to.kind === 'unit' ? { unitId: to.key } : { managerCardId: to.key };
  if (to.kind === 'person') {
    const manager = people.find((p) => p.cardId === to.key);
    if (who.managerCardId === to.key && manager && manager.unitId === who.unitId) return { kind: 'noop' };
  } else {
    const unit = units.find((u) => u.id === to.key);
    const head = unit?.headCardId && unit.headCardId !== who.cardId ? unit.headCardId : null;
    if (unit && who.unitId === unit.id && (who.managerCardId ?? null) === head) return { kind: 'noop' };
  }
  const why = moveError(people, units, who.cardId, moveTarget);
  return why ? { kind: 'refused', reason: why } : { kind: 'person', cardId: who.cardId, target: moveTarget };
}
