/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrgGraph,
  buildOrgTree,
  collapsibleNodes,
  defaultCollapsed,
  personNodeId as P,
  unitNodeId as U,
  type GraphPerson,
} from '../../src/features/people/org/graph.ts';
import { layoutOrg } from '../../src/features/people/org/layout.ts';

const person = (cardId: string, unitId: string | null, managerCardId: string | null, title = 'Менеджер') => ({
  cardId,
  fullName: `Особа ${cardId}`,
  title,
  unitId,
  managerCardId,
});

// root (head dir) ← sales (head sh) ← team (head tl) ; root ← log (head lh)
// sales: sh ← s1 ← s1a, s1b ; sh ← s2 ; team: tl ← t1..t4 (a group block «4 менеджери»)
// x in team reports to lh (another unit): cross-unit. y in log has a manager unknown to the registry.
const units = [
  { id: 'root', name: 'Компанія', parentUnitId: null, headCardId: 'dir' },
  { id: 'sales', name: 'Продажі', parentUnitId: 'root', headCardId: 'sh' },
  { id: 'team', name: 'Команда', parentUnitId: 'sales', headCardId: 'tl' },
  { id: 'log', name: 'Логістика', parentUnitId: 'root', headCardId: 'lh' },
];
const people: GraphPerson[] = [
  person('dir', 'root', null, 'Директор'),
  person('sh', 'sales', 'dir', 'РОП'),
  person('s1', 'sales', 'sh', 'Старший менеджер'),
  person('s1a', 'sales', 's1'),
  person('s1b', 'sales', 's1'),
  person('s2', 'sales', 'sh'),
  person('tl', 'team', 'sh', 'Тімлід'),
  person('t1', 'team', 'tl'),
  person('t2', 'team', 'tl'),
  person('t3', 'team', 'tl'),
  person('t4', 'team', 'tl'),
  person('x', 'team', 'lh', 'Аналітик'),
  person('lh', 'log', 'dir', 'Керівник логістики'),
  person('y', 'log', 'ghost'),
  person('nobody', null, null),
];

const ids = (g: ReturnType<typeof buildOrgGraph>) => new Set(g.nodes.map((n) => n.id));

test('collapsed branch hides descendants', () => {
  const open = buildOrgGraph(units, people, new Set());
  for (const id of [U('sales'), P('s1'), P('s1a'), U('team'), P('t1'), P('x')]) assert.ok(ids(open).has(id), id);
  // Unit heads are the unit blocks, not separate nodes.
  assert.ok(!ids(open).has(P('sh')));
  assert.equal(open.byId.get(U('sales'))!.head?.cardId, 'sh');
  // Order: managers, other people, then units (by Bitrix24 code, then name).
  assert.deepEqual(open.byId.get(U('sales'))!.children, [P('s1'), P('s2'), U('team')]);
  const coded = [
    ...units,
    { id: 'b', name: 'Б', parentUnitId: 'root', headCardId: null, bitrixCode: '1.10' },
    { id: 'a', name: 'А', parentUnitId: 'root', headCardId: null, bitrixCode: '1.9' },
  ];
  assert.deepEqual(
    buildOrgGraph(coded, people, new Set()).byId.get(U('root'))!.children.slice(-2),
    [U('a'), U('b')],
    'codes compare as numbers',
  );

  const closed = buildOrgGraph(units, people, new Set([U('sales')]));
  const visible = ids(closed);
  assert.ok(visible.has(U('sales')), 'the collapsed node itself stays');
  for (const id of [P('s1'), P('s1a'), P('s2'), U('team'), P('t1'), P('x')]) assert.ok(!visible.has(id), id);
  assert.ok(visible.has(U('log')) && visible.has(P('y')), 'other branches stay');
  const sales = closed.byId.get(U('sales'))!;
  assert.equal(sales.collapsed, true);
  assert.deepEqual(sales.children, []);
  // People below the collapsed unit (head included): sh, s1, s1a, s1b, s2, tl, t1..t4, x.
  assert.equal(sales.peopleCount, 11);
  assert.equal(sales.hiddenCount, 10, 'everything below the block');
  // No edge points into the hidden part.
  for (const e of closed.edges) assert.ok(visible.has(e.from) && visible.has(e.to), `${e.from}→${e.to}`);

  // A collapsed person hides only their own branch.
  const s1 = buildOrgGraph(units, people, new Set([P('s1')]));
  assert.ok(!ids(s1).has(P('s1a')) && ids(s1).has(P('s2')));
  assert.equal(s1.byId.get(P('s1'))!.hiddenCount, 2);
  // Collapsing a leaf changes nothing.
  assert.equal(buildOrgGraph(units, people, new Set([P('s2')])).byId.get(P('s2'))!.collapsed, false);
});

test('cross-unit reporting is dashed', () => {
  const g = buildOrgGraph(units, people, new Set());
  const dashed = g.edges.filter((e) => e.dashed);
  // x sits in its own unit (team) and reports to the head of logistics, drawn from the logistics block.
  assert.equal(g.byId.get(P('x'))!.parentId, U('team'));
  assert.deepEqual(dashed, [{ from: U('log'), to: P('x'), dashed: true }]);
  // Reporting inside the unit and unit heads reporting up the unit tree are solid.
  const solid = (from: string, to: string) => g.edges.some((e) => e.from === from && e.to === to && !e.dashed);
  assert.ok(solid(U('sales'), P('s1')));
  assert.ok(solid(P('s1'), P('s1a')));
  assert.ok(solid(U('sales'), U('team')));
  assert.ok(solid(U('team'), P('t1')));
  // A manager unknown to the registry: under the unit, no dashed line.
  assert.equal(g.byId.get(P('y'))!.parentId, U('log'));
  // A head reporting sideways (to another unit, not up the unit tree) is dashed too.
  const sideways = people.map((p) => (p.cardId === 'tl' ? { ...p, managerCardId: 'lh' } : p));
  const g2 = buildOrgGraph(units, sideways, new Set());
  assert.ok(g2.edges.some((e) => e.dashed && e.from === U('log') && e.to === U('team')));
  // Hidden ends: no dashed edge when the manager's block is collapsed.
  assert.equal(buildOrgGraph(units, people, new Set([U('log')])).edges.filter((e) => e.dashed).length, 1);
  assert.equal(buildOrgGraph(units, people, new Set([U('team')])).edges.filter((e) => e.dashed).length, 0);
});

test('group block people stay separate', () => {
  // «4 менеджери: …» from the draw.io source is four people with the same title and manager: four nodes.
  const g = buildOrgGraph(units, people, new Set());
  const team = g.byId.get(U('team'))!;
  const group = team.children.filter((id) => g.byId.get(id)!.person?.title === 'Менеджер');
  assert.deepEqual([...group].sort(), [P('t1'), P('t2'), P('t3'), P('t4')]);
  for (const id of group) assert.equal(g.byId.get(id)!.kind, 'person');
  // Laid out as separate boxes (stacked, compact) with no overlaps.
  const layout = layoutOrg(g);
  const boxes = group.map((id) => layout.boxes.get(id)!);
  assert.equal(new Set(boxes.map((b) => `${b.x},${b.y}`)).size, 4);
  for (const a of layout.boxes.values()) {
    for (const b of layout.boxes.values()) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${a.id} overlaps ${b.id}`);
    }
  }
});

test('people without a unit, loops in the data and default collapsing', () => {
  const g = buildOrgGraph(units, people, new Set());
  assert.ok(g.roots.includes(U('root')));
  assert.equal(
    g.byId.get(P('nobody'))!.parentId,
    g.roots.find((r) => r !== U('root')),
  );
  // A manager loop inside a unit and a unit loop must not hang or drop anyone.
  const looped = [...people, person('l1', 'log', 'l2'), person('l2', 'log', 'l1')];
  const loopUnits = [
    ...units,
    { id: 'a', name: 'A', parentUnitId: 'b', headCardId: null },
    { id: 'b', name: 'B', parentUnitId: 'a', headCardId: null },
  ];
  const g2 = buildOrgGraph(loopUnits, looped, new Set());
  for (const id of [P('l1'), P('l2'), U('a'), U('b')]) assert.ok(g2.byId.has(id), id);

  // Big branches start collapsed; the root's children stay visible.
  const tree = buildOrgTree(units, people);
  const collapsed = defaultCollapsed(tree, 5);
  assert.ok(collapsed.has(U('sales')), 'sales has 10 below');
  assert.ok(!collapsed.has(U('root')));
  assert.ok(!collapsed.has(U('log')), 'small');
  const initial = buildOrgGraph(units, people, collapsed);
  assert.ok(ids(initial).has(U('sales')) && ids(initial).has(U('log')));
  // Everything that can collapse (except the roots).
  assert.ok(collapsibleNodes(tree).has(P('s1')));
  assert.ok(!collapsibleNodes(tree).has(P('s2')));
  assert.ok(!collapsibleNodes(tree).has(U('root')));
});
