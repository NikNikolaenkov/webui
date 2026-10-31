/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// A compact top-down tree layout for the org chart, O(visible nodes): every block is centred over its children;
// a run of people without subordinates is stacked in columns along a rail (like Bitrix24's lists of
// employees) instead of one long row. Connectors are SVG paths: solid for the tree, dashed for cross-unit reporting.
// Pure module, tested with node --test.

import type { NodeId, OrgGraph } from './graph';

export const ORG_SIZES = {
  nodeW: 204,
  personH: 58,
  unitH: 70,
  gapX: 20,
  gapY: 44,
  stackGap: 8,
  indent: 22,
  maxRows: 10,
  /** Fewer leaf people than this stay in the row. */
  stackMin: 3,
  rootGap: 64,
  pad: 32,
};

export interface Box {
  id: NodeId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OrgLayout {
  boxes: Map<NodeId, Box>;
  width: number;
  height: number;
  /** One SVG path (d) with all the tree connectors. */
  lines: string;
  /** SVG paths (d) of dashed reporting lines. */
  dashed: { from: NodeId; to: NodeId; d: string }[];
}

interface Sub {
  w: number;
  h: number;
  /** Where the item hangs from the bus, relative to its left edge: a block's centre, or the rails of a stack. */
  attach: number[];
  /** A stack: its rails start at the bus (no extra drop). */
  rail?: boolean;
  place(x: number, y: number): void;
}

export function layoutOrg(graph: OrgGraph, sizes = ORG_SIZES): OrgLayout {
  const S = sizes;
  const boxes = new Map<NodeId, Box>();
  const lines: string[] = [];
  const heightOf = (id: NodeId) => (graph.byId.get(id)!.kind === 'unit' ? S.unitH : S.personH);
  const r = (n: number) => Math.round(n * 10) / 10;

  const measure = (id: NodeId): Sub => {
    const n = graph.byId.get(id)!;
    const W = S.nodeW;
    const H = heightOf(id);
    if (!n.children.length) {
      return { w: W, h: H, attach: [W / 2], place: (x, y) => void boxes.set(id, { id, x, y, w: W, h: H }) };
    }
    const leaves = n.children.filter((c) => {
      const k = graph.byId.get(c)!;
      return k.kind === 'person' && !k.hasChildren; // a collapsed manager keeps its toggle in the row
    });
    const stacked = leaves.length >= S.stackMin ? new Set(leaves) : new Set<NodeId>();
    const items: Sub[] = [];

    if (stacked.size) {
      const cols = Math.ceil(stacked.size / S.maxRows);
      const rows = Math.ceil(stacked.size / cols);
      const list = [...stacked];
      const colW = S.indent + W;
      const h = rows * (S.personH + S.stackGap) - S.stackGap;
      items.push({
        w: cols * colW + (cols - 1) * S.gapX,
        h,
        attach: Array.from({ length: cols }, (_, c) => S.indent / 2 + c * (colW + S.gapX)),
        rail: true,
        place: (x, y) => {
          for (let c = 0; c < cols; c++) {
            const colX = x + c * (colW + S.gapX);
            const railX = r(colX + S.indent / 2);
            const part = list.slice(c * rows, (c + 1) * rows);
            part.forEach((leaf, i) => {
              const by = y + i * (S.personH + S.stackGap);
              boxes.set(leaf, { id: leaf, x: colX + S.indent, y: by, w: W, h: S.personH });
              lines.push(`M${railX},${r(by + S.personH / 2)}H${r(colX + S.indent)}`);
            });
            if (part.length)
              lines.push(
                `M${railX},${r(y - S.gapY / 2)}V${r(y + (part.length - 0.5) * (S.personH + S.stackGap) - S.stackGap / 2)}`,
              );
          }
        },
      });
    }
    for (const c of n.children) if (!stacked.has(c)) items.push(measure(c));

    const rowW = items.reduce((s, it) => s + it.w, 0) + S.gapX * (items.length - 1);
    const rowH = Math.max(...items.map((it) => it.h));
    const w = Math.max(W, rowW);
    return {
      w,
      h: H + S.gapY + rowH,
      attach: [w / 2],
      place: (x, y) => {
        boxes.set(id, { id, x: x + (w - W) / 2, y, w: W, h: H });
        const px = r(x + w / 2);
        const busY = r(y + H + S.gapY / 2);
        const rowY = y + H + S.gapY;
        let ix = x + (w - rowW) / 2;
        const xs: number[] = [px];
        for (const it of items) {
          for (const a of it.attach) {
            const ax = r(ix + a);
            xs.push(ax);
            // Subtrees get a drop from the bus; a stack's rails start at the bus themselves.
            if (!it.rail) lines.push(`M${ax},${busY}V${r(rowY)}`);
          }
          it.place(ix, rowY);
          ix += it.w + S.gapX;
        }
        lines.push(`M${px},${r(y + H)}V${busY}`);
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        if (hi > lo) lines.push(`M${lo},${busY}H${hi}`);
      },
    };
  };

  let x = S.pad;
  let height = 0;
  for (const root of graph.roots) {
    if (!graph.byId.has(root)) continue;
    const sub = measure(root);
    sub.place(x, S.pad);
    x += sub.w + S.rootGap;
    height = Math.max(height, sub.h);
  }
  const width = Math.max(x - S.rootGap + S.pad, 2 * S.pad);

  const dashed = graph.edges
    .filter((e) => e.dashed)
    .map((e) => {
      const a = boxes.get(e.from)!;
      const b = boxes.get(e.to)!;
      const x1 = r(a.x + a.w / 2);
      const y1 = r(a.y + a.h);
      // Into the right side of the subordinate's block: stacked blocks have their neighbours above and below.
      const x2 = r(b.x + b.w);
      const y2 = r(b.y + b.h / 2);
      const dy = Math.max(40, Math.abs(y2 - y1) / 2);
      return { from: e.from, to: e.to, d: `M${x1},${y1}C${x1},${r(y1 + dy)} ${r(x2 + 80)},${y2} ${x2},${y2}` };
    });

  return { boxes, width, height: height + 2 * S.pad, lines: lines.join(''), dashed };
}
