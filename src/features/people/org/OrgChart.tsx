/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// «Оргструктура»: the Bitrix24-style chart editor (mockup org-editor-in-admin.html). Our own small renderer (no
// chart library: the fork's lock file must not change): graph.ts builds the tree, layout.ts places the blocks,
// blocks are absolutely positioned divs over one SVG of connectors; zoom and pan are a CSS transform. Big branches
// start collapsed so the page renders O(visible blocks). Drag a block onto another → confirmation → the helper's
// move endpoint → refetch; cycles are refused before any request (drop.ts), the helper's own refusal is shown.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsDownUp, ChevronsUpDown, Minus, Plus, Printer } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { peopleApi } from '../api';
import { describeError } from '../client';
import type { Person, Unit } from '../model';
import { usePeople, useRefreshPeople, useUnits } from '../queries';
import { formatDate } from '../styles';
import { MoveDialog, UnitDialog } from '../components/CardDialogs';
import { ErrorNote, Loading, Notice, PageHeader } from '../components/parts';
import { planDrop, type DropPlan } from './drop';
import { buildOrgTree, collapsibleNodes, defaultCollapsed, visibleGraph, type NodeId, type OrgGraph } from './graph';
import { layoutOrg, type OrgLayout } from './layout';
import { OrgNode, type DropState, type NodeHandlers } from './OrgNode';
import { PersonDrawer } from './PersonDrawer';
import { moveText, type Move, type Translate } from './text';
import { fitView, origin, panBy, reanchor as reanchorView, rebase, zoomAround, type AnchoredView } from './view';
import './org.css';

/** Blocks with more people below than this start collapsed (the roots never do). */
const COLLAPSE_THRESHOLD = 15;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2;
const STEP = 0.1;
/** The default view never shrinks below this to fit the width: smaller text is unreadable. */
const FIT_MIN_SCALE = 0.6;
/** Printable width of A4 landscape with 10 mm margins, in CSS px. */
const PRINT_WIDTH = 1040;
const DRAG_TYPE = 'application/x-people-org-node';

/** Set on <html> only while the chart is being printed: org.css hides the rest of the app under it. */
const PRINTING_CLASS = 'org-printing';

const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));

function OrgCanvas({
  graph,
  layout,
  selected,
  drop,
  handlers,
}: {
  graph: OrgGraph<Unit, Person>;
  layout: OrgLayout;
  selected: string | null;
  drop: { id: NodeId; state: DropState } | null;
  handlers?: NodeHandlers;
}) {
  return (
    <div className="relative" style={{ width: layout.width, height: layout.height }}>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={layout.width}
        height={layout.height}
      >
        <path d={layout.lines} fill="none" className="stroke-muted-foreground/40" strokeWidth={1.5} />
        {layout.dashed.map((e) => (
          <path
            key={`${e.from}>${e.to}`}
            d={e.d}
            fill="none"
            className="stroke-brand-text/70"
            strokeWidth={1.5}
            strokeDasharray="6 5"
          />
        ))}
      </svg>
      {graph.nodes.map((n) => (
        <OrgNode
          key={n.id}
          node={n}
          box={layout.boxes.get(n.id)!}
          selected={selected}
          drop={drop?.id === n.id ? drop.state : null}
          interactive={Boolean(handlers)}
          handlers={handlers}
        />
      ))}
    </div>
  );
}

export function OrgChart() {
  const { t } = useTranslation();
  const people = usePeople();
  const units = useUnits();
  const refresh = useRefreshPeople();
  const peopleList = people.data;
  const unitList = units.data;

  const tree = useMemo(() => buildOrgTree(unitList ?? [], peopleList ?? []), [unitList, peopleList]);
  const defaults = useMemo(() => defaultCollapsed(tree, COLLAPSE_THRESHOLD), [tree]);
  // The user's choices on top of the defaults (survive refetches).
  const [overrides, setOverrides] = useState<ReadonlyMap<NodeId, boolean>>(new Map());
  const collapsed = useMemo(() => {
    const set = new Set(defaults);
    for (const [id, c] of overrides) {
      if (c) set.add(id);
      else set.delete(id);
    }
    return set;
  }, [defaults, overrides]);
  const graph = useMemo(() => visibleGraph(tree, collapsed), [tree, collapsed]);
  const layout = useMemo(() => layoutOrg(graph), [graph]);
  const byCard = useMemo(() => new Map((peopleList ?? []).map((p) => [p.cardId, p])), [peopleList]);

  // The view is anchored to a block: that block's top-left is at (sx, sy) on screen. Expanding or collapsing
  // re-anchors to the toggled block, so it stays under the pointer while the layout around it changes.
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [viewportW, setViewportW] = useState(0);
  const [viewState, setViewState] = useState<AnchoredView | null>(null);
  // The main root (the most people): a new empty top-level unit must not move the default view.
  const firstRoot = useMemo(
    () =>
      graph.roots.reduce<NodeId | null>(
        (best, id) =>
          best === null || graph.byId.get(id)!.peopleCount > graph.byId.get(best)!.peopleCount ? id : best,
        null,
      ),
    [graph],
  );
  // Until the user pans or zooms: the whole width on screen (no unit cut off at the left edge).
  const auto = useMemo<AnchoredView | null>(
    () => (firstRoot ? fitView(layout, firstRoot, viewportW, { min: FIT_MIN_SCALE }) : null),
    [firstRoot, layout, viewportW],
  );
  // A new layout (refetch, «collapse all») may drop the anchor block: re-anchor to its nearest visible ancestor
  // (or the main root) keeping the canvas where it was. Adjusting state while rendering, as React recommends for
  // state derived from a changed input.
  const [laidOut, setLaidOut] = useState(layout);
  if (laidOut !== layout) {
    setLaidOut(layout);
    if (viewState && !layout.boxes.has(viewState.anchor)) {
      const fallbacks: NodeId[] = [];
      for (let id = tree.nodes.get(viewState.anchor)?.parentId; id; id = tree.nodes.get(id)?.parentId)
        fallbacks.push(id);
      if (firstRoot) fallbacks.push(firstRoot);
      const next = rebase(viewState, laidOut, layout, fallbacks);
      if (next) setViewState(next);
    }
  }
  const view = viewState ?? auto;
  const scale = view?.scale ?? 1;
  const at = (view && origin(view, layout)) ?? { x: 0, y: 0 };
  const tx = at.x;
  const ty = at.y;

  const attachViewport = useCallback((el: HTMLDivElement | null) => {
    setViewport(el);
    if (el) setViewportW(el.clientWidth);
  }, []);
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: NodeId; state: DropState } | null>(null);
  const dragged = useRef<NodeId | null>(null);
  const plans = useRef(new Map<NodeId, DropPlan>());
  const [pending, setPending] = useState<Move | null>(null);
  const [dialog, setDialog] = useState<'unit' | 'move' | null>(null);
  const [printing, setPrinting] = useState(false);

  /** Keeps `id` where it is on screen whatever the next layout does. */
  const reanchor = useCallback(
    (id: NodeId) =>
      setViewState((v) => {
        const base = v ?? auto;
        return (base && reanchorView(base, layout, id)) ?? v;
      }),
    [auto, layout],
  );

  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number) =>
      setViewState((v) => {
        const base = v ?? auto;
        if (!base) return v;
        const cx = px ?? (viewport ? viewport.clientWidth / 2 : 0);
        const cy = py ?? (viewport ? viewport.clientHeight / 2 : 0);
        return zoomAround(base, clamp(base.scale * factor), cx, cy);
      }),
    [auto, viewport],
  );

  // Wheel: scroll pans, Ctrl/⌘ + wheel zooms at the pointer (a native listener: React's is passive).
  useEffect(() => {
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      // The drawer scrolls on its own.
      if ((e.target as Element).closest('[data-org-drawer]')) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = viewport.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setViewState((v) => {
          const base = v ?? auto;
          return base && panBy(base, -dx, -dy);
        });
      }
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [viewport, zoomAt, auto]);

  // Printing (the PDF button or Ctrl+P on this page): render the print sheet and set the flag org.css keys on before
  // the browser lays out the pages; clear both afterwards and when leaving the page, so other pages print normally.
  useEffect(() => {
    const html = document.documentElement;
    const before = () => {
      html.classList.add(PRINTING_CLASS);
      flushSync(() => setPrinting(true));
    };
    const after = () => {
      html.classList.remove(PRINTING_CLASS);
      setPrinting(false);
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      html.classList.remove(PRINTING_CLASS);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-org-node], [data-org-drawer], button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    setViewState((v) => {
      const base = v ?? auto;
      return base && panBy(base, dx, dy);
    });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pan.current?.id === e.pointerId) pan.current = null;
  };

  const refusal = useCallback(
    (plan: Extract<DropPlan, { kind: 'refused' }>, unit: boolean) =>
      plan.reason === 'cycle'
        ? unit
          ? t('people.org.unitCycle', 'This would make a cycle: the new parent unit is inside this one')
          : t('people.move.cycle', 'This would make a cycle: the new manager is in this person’s own branch')
        : plan.reason === 'self'
          ? t('people.move.self', 'A person cannot be their own manager')
          : t('people.move.unknown', 'Unknown target'),
    [t],
  );

  const handlers = useMemo<NodeHandlers>(() => {
    const plan = (target: NodeId): DropPlan | null => {
      const source = dragged.current;
      if (!source) return null;
      let p = plans.current.get(target);
      if (!p) {
        p = planDrop(peopleList ?? [], unitList ?? [], source, target);
        plans.current.set(target, p);
      }
      return p;
    };
    const show = (id: NodeId, state: DropState) =>
      setDrop((d) => (d?.id === id && d.state === state ? d : state ? { id, state } : d?.id === id ? null : d));
    return {
      toggle: (id) => {
        reanchor(id);
        setOverrides((prev) => new Map(prev).set(id, !collapsed.has(id)));
      },
      open: (cardId) => setSelected(cardId),
      dragStart: (id, e) => {
        dragged.current = id;
        plans.current = new Map();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(DRAG_TYPE, id);
        e.dataTransfer.setData('text/plain', id);
      },
      dragOver: (id, e) => {
        const p = plan(id);
        if (!p || p.kind === 'noop' || (p.kind === 'refused' && p.reason === 'unsupported')) return show(id, null);
        // Refused moves are still droppable: the drop explains why nothing happens.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        show(id, p.kind === 'refused' ? 'refused' : 'ok');
      },
      dragLeave: (id, e) => {
        if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) show(id, null);
      },
      drop: (id, e) => {
        e.preventDefault();
        const source = dragged.current;
        const p = plan(id);
        dragged.current = null;
        setDrop(null);
        if (!p || !source) return;
        if (p.kind === 'refused')
          toast({
            variant: 'destructive',
            title: t('people.card.move', 'Move'),
            description: refusal(p, source.startsWith('u:')),
          });
        else if (p.kind !== 'noop') setPending(p);
      },
      dragEnd: () => {
        dragged.current = null;
        setDrop(null);
      },
    };
  }, [peopleList, unitList, collapsed, reanchor, refusal, t]);

  const confirmMove = async (move: Move) => {
    try {
      if (move.kind === 'person') await peopleApi.movePerson(move.cardId, move.target);
      else await peopleApi.moveUnit(move.unitId, move.parentUnitId);
      toast({ variant: 'success', title: t('people.org.moved', 'Moved') });
    } catch (err) {
      // The helper's own refusal (409 cycle, 404, …) in its words.
      toast({ variant: 'destructive', title: t('people.card.move', 'Move'), description: describeError(err, t) });
    } finally {
      void refresh();
    }
  };

  const tr: Translate = (key, text, opts) => t(key, text, opts ?? {});

  const selectedPerson = selected ? byCard.get(selected) : undefined;
  const selectedUnitForNew = selectedPerson?.unitId ?? null;
  const printScale = Math.min(1, PRINT_WIDTH / Math.max(1, layout.width));

  const header = (
    <PageHeader
      title={t('people.menu.org', 'Org chart')}
      actions={
        <>
          <div className="flex items-center rounded-full bg-card shadow-tile">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => zoomAt((scale - STEP) / scale)}
              aria-label={t('people.org.zoomOut', 'Zoom out')}
            >
              <Minus aria-hidden />
            </Button>
            <button
              type="button"
              className="min-w-[3.25rem] text-center text-[13px] font-semibold tabular-nums text-foreground hover:underline"
              onClick={() => setViewState(null)}
              title={t('people.org.zoomReset', 'Fit to width')}
            >
              {Math.round(scale * 100)}%
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => zoomAt((scale + STEP) / scale)}
              aria-label={t('people.org.zoomIn', 'Zoom in')}
            >
              <Plus aria-hidden />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (firstRoot) reanchor(firstRoot);
              setOverrides(new Map([...collapsibleNodes(tree)].map((id) => [id, true])));
            }}
          >
            <ChevronsDownUp aria-hidden />
            {t('people.org.collapseAll', 'Collapse all')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (firstRoot) reanchor(firstRoot);
              setOverrides(new Map([...collapsibleNodes(tree)].map((id) => [id, false])));
            }}
          >
            <ChevronsUpDown aria-hidden />
            {t('people.org.expandAll', 'Expand all')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            title={t('people.org.pdfHint', 'Print or save as PDF: the chart as expanded now')}
          >
            <Printer aria-hidden />
            PDF
          </Button>
          <Button size="sm" onClick={() => setDialog('unit')}>
            <Plus aria-hidden />
            {t('people.org.addUnit', 'Unit')}
          </Button>
        </>
      }
    />
  );

  if (!peopleList || !unitList) {
    return (
      <div className="space-y-3.5">
        {header}
        {people.isLoading || units.isLoading ? (
          <Loading />
        ) : (
          <ErrorNote
            error={people.error ?? units.error}
            onRetry={() => {
              void people.refetch();
              void units.refetch();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {header}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span>
          {t(
            'people.org.hint',
            'Drag a person or a unit onto another block to move it. Drag the background to pan; Ctrl + wheel zooms.',
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="28" height="6">
            <path d="M0,3H28" className="stroke-brand-text/70" strokeWidth={1.5} strokeDasharray="6 5" />
          </svg>
          {t('people.org.dashedLegend', 'reports to someone in another unit')}
        </span>
      </p>

      {graph.nodes.length === 0 ? (
        <Notice>{t('people.org.empty', 'No units or people yet. Create the first unit.')}</Notice>
      ) : (
        <div
          ref={attachViewport}
          className="relative h-[calc(100dvh-15.5rem)] min-h-[520px] cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-border bg-card active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
          >
            <OrgCanvas graph={graph} layout={layout} selected={selected} drop={drop} handlers={handlers} />
          </div>
          {selectedPerson && (
            <PersonDrawer
              key={selectedPerson.cardId}
              person={selectedPerson}
              people={byCard}
              units={unitList}
              onSelect={setSelected}
              onMove={() => setDialog('move')}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}

      {pending &&
        (() => {
          const text = moveText(pending, peopleList, unitList, tr);
          return (
            <ConfirmDialog
              open
              onOpenChange={(open) => !open && setPending(null)}
              title={text.title}
              description={text.description}
              confirmLabel={t('people.card.move', 'Move')}
              onConfirm={() => confirmMove(pending)}
            />
          );
        })()}
      {dialog === 'unit' && (
        <UnitDialog
          units={unitList}
          people={peopleList}
          parentUnitId={selectedUnitForNew}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            toast({ variant: 'success', title: t('people.unit.created', 'Unit created') });
            void refresh();
          }}
        />
      )}
      {dialog === 'move' && selectedPerson && (
        <MoveDialog
          person={selectedPerson}
          people={peopleList}
          units={unitList}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
      {printing &&
        createPortal(
          <div className="org-print-sheet">
            <p style={{ margin: '0 0 8px', fontSize: 12 }}>
              <strong>{t('people.menu.org', 'Org chart')}</strong> · {formatDate(new Date().toISOString())}
            </p>
            <div style={{ zoom: printScale }}>
              <OrgCanvas graph={graph} layout={layout} selected={null} drop={null} />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
