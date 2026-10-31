/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// The confirmation of a drag and drop move: what exactly the helper will do (people-helper movePerson/moveUnit).
// Under a person — into that person's unit, with the subordinates who were in the same unit; onto a unit — under its
// head, or without a manager when the unit has none or the person is its head. Pure, tested with node --test.

import type { MoveTarget, TreePerson, TreeUnit } from '../tree';

export type Translate = (key: string, text: string, opts?: Record<string, unknown>) => string;

export type Move =
  { kind: 'person'; cardId: string; target: MoveTarget } | { kind: 'unit'; unitId: string; parentUnitId: string };

type P = TreePerson & { fullName: string; unitId: string | null };

export function moveText(
  move: Move,
  people: readonly P[],
  units: readonly TreeUnit[],
  t: Translate,
): { title: string; description: string } {
  const person = (id: string | null | undefined) => (id ? people.find((p) => p.cardId === id) : undefined);
  const unit = (id: string | null | undefined) => (id ? units.find((u) => u.id === id) : undefined);
  const unitLabel = (id: string | null | undefined) => unit(id)?.name ?? t('people.org.noUnit', 'No unit');
  const title = (name: string, target: string) =>
    t('people.org.confirm', 'Move {{name}} under {{target}}?', { name, target });
  const subordinates = t('people.move.text', 'Subordinates move together with the person.');

  if (move.kind === 'unit') {
    return {
      title: title(unitLabel(move.unitId), unitLabel(move.parentUnitId)),
      description: t('people.org.unitMoveText', 'Nested units and their people move with it.'),
    };
  }

  const who = person(move.cardId);
  const name = who?.fullName ?? move.cardId;
  if ('managerCardId' in move.target) {
    const manager = person(move.target.managerCardId);
    const to = manager?.unitId ?? null;
    const from = who?.unitId ?? null;
    const description =
      to === from
        ? subordinates
        : t(
            'people.org.unitChange',
            'The person moves from «{{from}}» to the unit «{{unit}}» of {{manager}}; subordinates from «{{from}}» move with them.',
            { from: unitLabel(from), unit: unitLabel(to), manager: manager?.fullName ?? '' },
          );
    return { title: title(name, manager?.fullName ?? move.target.managerCardId), description };
  }

  const target = unit(move.target.unitId);
  const head = person(target?.headCardId);
  const label = unitLabel(move.target.unitId);
  let lead: string;
  if (target?.headCardId && target.headCardId === move.cardId)
    lead = t('people.org.becomesHead', '{{name}} heads «{{unit}}»: moves into it and stays without a manager.', {
      name,
      unit: label,
    });
  else if (head) lead = t('people.org.underHead', 'Onto a unit: under its head, {{name}}.', { name: head.fullName });
  else lead = t('people.org.noHeadMove', 'The unit has no head: the person will have no manager.');
  return { title: title(name, label), description: `${lead} ${subordinates}` };
}
