/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// The org chart as a tree of blocks, like Bitrix24's company structure: unit blocks (with their head shown inside
// the block) nest by parent unit; under a unit hang its people who report to the head (or to no one known), and
// under a person their subordinates from the same unit. Reporting to someone in another unit (other than a unit head
// reporting up the unit tree) is an extra dashed edge. Pure module, tested with node --test.
//
// buildOrgTree is the full tree (O(units + people)); visibleGraph walks only what is not inside a collapsed branch,
// so the chart renders O(visible nodes).

export interface GraphPerson {
  cardId: string;
  fullName: string;
  title: string | null;
  unitId: string | null;
  managerCardId: string | null;
}

export interface GraphUnit {
  id: string;
  name: string;
  parentUnitId: string | null;
  headCardId: string | null;
  bitrixCode?: string | null;
}

export type NodeId = string;
export const unitNodeId = (id: string): NodeId => `u:${id}`;
export const personNodeId = (cardId: string): NodeId => `p:${cardId}`;
/** The block for people whose unit is empty or unknown. */
export const NO_UNIT: NodeId = 'u:';

export interface TreeNode<U extends GraphUnit = GraphUnit, P extends GraphPerson = GraphPerson> {
  id: NodeId;
  kind: 'unit' | 'person';
  unit?: U;
  /** The person of a person block. */
  person?: P;
  /** The head of a unit block (a head working in the unit is shown in the block, not as a separate node). */
  head?: P;
  /** The «no unit» block. */
  virtual?: boolean;
  parentId: NodeId | null;
  children: NodeId[];
  /** People in this block and below (a unit's head included). */
  peopleCount: number;
  /** People below this block (what a collapsed block hides). */
  hiddenCount: number;
}

export interface OrgTree<U extends GraphUnit = GraphUnit, P extends GraphPerson = GraphPerson> {
  nodes: Map<NodeId, TreeNode<U, P>>;
  roots: NodeId[];
  /** Dashed reporting lines: [manager's block, subordinate's block]. */
  reports: [NodeId, NodeId][];
  /** The block that shows a person: their own node, or the unit they head. */
  blockOf: Map<string, NodeId>;
}

export interface OrgNode<U extends GraphUnit = GraphUnit, P extends GraphPerson = GraphPerson> extends TreeNode<U, P> {
  depth: number;
  /** Has children in the full tree. */
  hasChildren: boolean;
  /** Has children and they are hidden. */
  collapsed: boolean;
}

export interface OrgEdge {
  from: NodeId;
  to: NodeId;
  dashed: boolean;
}

export interface OrgGraph<U extends GraphUnit = GraphUnit, P extends GraphPerson = GraphPerson> {
  /** Visible nodes in depth-first order. */
  nodes: OrgNode<U, P>[];
  edges: OrgEdge[];
  roots: NodeId[];
  byId: Map<NodeId, OrgNode<U, P>>;
}

const collator = new Intl.Collator('uk', { sensitivity: 'base', numeric: true });

export function buildOrgTree<U extends GraphUnit, P extends GraphPerson>(
  units: readonly U[],
  people: readonly P[],
): OrgTree<U, P> {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const personById = new Map(people.map((p) => [p.cardId, p]));
  const nodes = new Map<NodeId, TreeNode<U, P>>();
  const blockOf = new Map<string, NodeId>();
  const reports: [NodeId, NodeId][] = [];
  const node = (id: NodeId, kind: TreeNode['kind'], extra: Partial<TreeNode<U, P>>) =>
    nodes.set(id, { id, kind, parentId: null, children: [], peopleCount: 0, hiddenCount: 0, ...extra });

  // Unit blocks; a head who works in the unit is the block itself.
  for (const u of units) {
    const head = u.headCardId ? personById.get(u.headCardId) : undefined;
    const inside = head && head.unitId === u.id ? head : undefined;
    node(unitNodeId(u.id), 'unit', { unit: u, head });
    if (inside) blockOf.set(inside.cardId, unitNodeId(u.id));
  }
  const unitOf = (p: P): string => (p.unitId && unitById.has(p.unitId) ? p.unitId : '');
  if (people.some((p) => !unitOf(p))) node(NO_UNIT, 'unit', { virtual: true });
  for (const p of people) {
    if (!blockOf.has(p.cardId)) {
      node(personNodeId(p.cardId), 'person', { person: p });
      blockOf.set(p.cardId, personNodeId(p.cardId));
    }
  }

  /** Proper ancestors of a unit (stops on a loop in the data). */
  const ancestors = (unitId: string): Set<string> => {
    const out = new Set<string>();
    for (let cur = unitById.get(unitId)?.parentUnitId ?? null; cur && unitById.has(cur) && !out.has(cur);) {
      out.add(cur);
      cur = unitById.get(cur)!.parentUnitId;
    }
    return out;
  };

  // Parents.
  for (const u of units) {
    const id = unitNodeId(u.id);
    const n = nodes.get(id)!;
    if (u.parentUnitId && u.parentUnitId !== u.id && unitById.has(u.parentUnitId))
      n.parentId = unitNodeId(u.parentUnitId);
    // A head who reports sideways (not to someone up the unit tree) gets a dashed line.
    const head = blockOf.get(u.headCardId ?? '') === id ? n.head : undefined;
    const manager = head?.managerCardId ? personById.get(head.managerCardId) : undefined;
    if (head && manager && manager !== head && !ancestors(u.id).has(manager.unitId ?? ''))
      reports.push([blockOf.get(manager.cardId)!, id]);
  }
  for (const p of people) {
    const id = blockOf.get(p.cardId)!;
    if (id !== personNodeId(p.cardId)) continue; // a unit head: placed with the unit
    const unitId = unitOf(p);
    const unitBlock = unitId ? unitNodeId(unitId) : NO_UNIT;
    const manager = p.managerCardId && p.managerCardId !== p.cardId ? personById.get(p.managerCardId) : undefined;
    const headOfUnit = unitId ? unitById.get(unitId)!.headCardId : null;
    const sameUnit = manager && unitOf(manager) === unitId;
    const n = nodes.get(id)!;
    if (manager && sameUnit && manager.cardId !== headOfUnit && blockOf.get(manager.cardId) !== unitBlock) {
      n.parentId = blockOf.get(manager.cardId)!;
    } else {
      n.parentId = unitBlock;
      if (manager && !sameUnit && manager.cardId !== headOfUnit) reports.push([blockOf.get(manager.cardId)!, id]);
    }
  }

  // Children, then roots; anything unreachable (a loop in the data) is re-attached: units become roots, people
  // hang under their unit.
  const childrenOf = (all: Iterable<TreeNode<U, P>>) => {
    for (const n of nodes.values()) n.children = [];
    for (const n of all) if (n.parentId) nodes.get(n.parentId)!.children.push(n.id);
  };
  childrenOf(nodes.values());
  const roots: NodeId[] = [];
  const reached = new Set<NodeId>();
  const walk = (start: NodeId) => {
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (reached.has(id)) continue;
      reached.add(id);
      stack.push(...nodes.get(id)!.children);
    }
  };
  for (const n of nodes.values()) {
    if (n.kind === 'unit' && n.parentId === null) {
      roots.push(n.id);
      walk(n.id);
    }
  }
  let detached = false;
  for (const n of nodes.values()) {
    if (reached.has(n.id) || n.kind !== 'unit') continue;
    n.parentId = null;
    roots.push(n.id);
    walk(n.id);
    detached = true;
  }
  // A manager loop: one person of it goes under the unit, the rest of the loop (and its branches) stay below them.
  for (const n of nodes.values()) {
    if (reached.has(n.id)) continue;
    const unitId = unitOf(n.person!);
    n.parentId = unitId ? unitNodeId(unitId) : NO_UNIT;
    walk(n.id);
    detached = true;
  }
  if (detached) childrenOf(nodes.values());

  // Order: people (managers first, then by title and name), then units (by Bitrix24 code, then name).
  const sortKey = (n: TreeNode<U, P>): [number, string, string] =>
    n.kind === 'unit'
      ? [2, n.unit?.bitrixCode ?? '', n.unit?.name ?? '']
      : [n.children.length ? 0 : 1, n.person!.title ?? '', n.person!.fullName];
  const keys = new Map([...nodes.values()].map((n) => [n.id, sortKey(n)]));
  const byKey = (a: NodeId, b: NodeId) => {
    const [x, y] = [keys.get(a)!, keys.get(b)!];
    return x[0] - y[0] || collator.compare(x[1], y[1]) || collator.compare(x[2], y[2]);
  };
  for (const n of nodes.values()) n.children.sort(byKey);
  roots.sort((a, b) => (a === NO_UNIT ? 1 : b === NO_UNIT ? -1 : byKey(a, b)));

  // Counts, bottom-up (iterative: deep trees must not overflow the stack).
  const order: NodeId[] = [];
  for (const stack = [...roots]; stack.length;) {
    const id = stack.pop()!;
    order.push(id);
    stack.push(...nodes.get(id)!.children);
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = nodes.get(order[i]!)!;
    const own = n.person || (n.head && blockOf.get(n.head.cardId) === n.id) ? 1 : 0;
    n.hiddenCount = n.children.reduce((sum, c) => sum + nodes.get(c)!.peopleCount, 0);
    n.peopleCount = own + n.hiddenCount;
  }

  return { nodes, roots, reports, blockOf };
}

/** Blocks with something to collapse, except the roots (their children are always visible). */
export function collapsibleNodes(tree: OrgTree): Set<NodeId> {
  const roots = new Set(tree.roots);
  return new Set([...tree.nodes.values()].filter((n) => n.children.length && !roots.has(n.id)).map((n) => n.id));
}

/** Big branches start collapsed: any block (except the roots) with more than `threshold` people below. */
export function defaultCollapsed(tree: OrgTree, threshold = 15): Set<NodeId> {
  return new Set([...collapsibleNodes(tree)].filter((id) => tree.nodes.get(id)!.hiddenCount > threshold));
}

/** What is on screen: the tree without the inside of collapsed blocks, plus dashed lines with both ends visible. */
export function visibleGraph<U extends GraphUnit, P extends GraphPerson>(
  tree: OrgTree<U, P>,
  collapsed: ReadonlySet<NodeId>,
): OrgGraph<U, P> {
  const nodes: OrgNode<U, P>[] = [];
  const edges: OrgEdge[] = [];
  const byId = new Map<NodeId, OrgNode<U, P>>();
  const stack: [NodeId, number][] = tree.roots.map((id) => [id, 0] as [NodeId, number]).reverse();
  while (stack.length) {
    const [id, depth] = stack.pop()!;
    const full = tree.nodes.get(id)!;
    const isCollapsed = collapsed.has(id) && full.children.length > 0;
    const n: OrgNode<U, P> = {
      ...full,
      depth,
      hasChildren: full.children.length > 0,
      collapsed: isCollapsed,
      children: isCollapsed ? [] : full.children,
    };
    nodes.push(n);
    byId.set(id, n);
    if (n.parentId) edges.push({ from: n.parentId, to: id, dashed: false });
    for (let i = n.children.length - 1; i >= 0; i--) stack.push([n.children[i]!, depth + 1]);
  }
  for (const [from, to] of tree.reports) if (byId.has(from) && byId.has(to)) edges.push({ from, to, dashed: true });
  return { nodes, edges, roots: tree.roots, byId };
}

export function buildOrgGraph<U extends GraphUnit, P extends GraphPerson>(
  units: readonly U[],
  people: readonly P[],
  collapsed: ReadonlySet<NodeId>,
): OrgGraph<U, P> {
  return visibleGraph(buildOrgTree(units, people), collapsed);
}
