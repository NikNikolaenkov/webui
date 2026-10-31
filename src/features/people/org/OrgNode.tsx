/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { memo, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Person, Unit } from '../model';
import type { NodeId, OrgNode as GraphNode } from './graph';
import type { Box } from './layout';
import { initials, shortName } from './names';

export type DropState = 'ok' | 'refused' | null;

export interface NodeHandlers {
  toggle(id: NodeId): void;
  open(cardId: string): void;
  dragStart(id: NodeId, e: DragEvent): void;
  dragOver(id: NodeId, e: DragEvent): void;
  dragLeave(id: NodeId, e: DragEvent): void;
  drop(id: NodeId, e: DragEvent): void;
  dragEnd(): void;
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-highlight text-[10px] font-semibold text-highlight-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** One block of the chart, absolutely positioned at its layout box. Units carry their head; people their title. */
export const OrgNode = memo(function OrgNode({
  node,
  box,
  selected,
  drop,
  interactive,
  handlers,
}: {
  node: GraphNode<Unit, Person>;
  box: Box;
  selected: string | null;
  drop: DropState;
  /** False in the print view: no drag, no buttons. */
  interactive: boolean;
  handlers?: NodeHandlers;
}) {
  const { t } = useTranslation();
  const isUnit = node.kind === 'unit';
  const person = node.person;
  const head = node.head;
  const draggable = interactive && !node.virtual;
  const dim = person && person.status !== 'active';
  const isSelected = Boolean(selected && (person?.cardId === selected || (isUnit && head?.cardId === selected)));
  const id = node.id;
  const blockName = node.virtual ? t('people.org.noUnit', 'No unit') : (node.unit?.name ?? person?.fullName ?? '');

  return (
    <div
      data-org-node={id}
      draggable={draggable}
      onDragStart={draggable ? (e) => handlers?.dragStart(id, e) : undefined}
      onDragOver={interactive ? (e) => handlers?.dragOver(id, e) : undefined}
      onDragLeave={interactive ? (e) => handlers?.dragLeave(id, e) : undefined}
      onDrop={interactive ? (e) => handlers?.drop(id, e) : undefined}
      onDragEnd={interactive ? () => handlers?.dragEnd() : undefined}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      className={cn(
        'org-node absolute flex flex-col justify-center rounded-xl border border-border px-3 py-1.5 text-left shadow-tile transition-shadow',
        isUnit ? 'bg-secondary' : 'bg-card',
        draggable && 'cursor-grab active:cursor-grabbing',
        dim && 'opacity-60',
        isSelected && 'ring-2 ring-primary',
        drop === 'ok' && 'bg-success-soft ring-2 ring-success',
        drop === 'refused' && 'bg-destructive-soft ring-2 ring-destructive',
      )}
    >
      {isUnit ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground" title={node.unit?.name}>
              {node.virtual ? t('people.org.noUnit', 'No unit') : node.unit?.name}
            </span>
            <span
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              title={t('people.org.peopleCount', 'People in the branch')}
            >
              {node.peopleCount}
            </span>
          </div>
          {head ? (
            interactive ? (
              <button
                type="button"
                className="mt-1 flex min-w-0 items-center gap-1.5 rounded text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => handlers?.open(head.cardId)}
                title={[head.title, head.fullName].filter(Boolean).join(' · ')}
              >
                <Avatar name={head.fullName} />
                <span className="truncate">
                  {head.title ? `${head.title} · ` : ''}
                  {shortName(head.fullName)}
                </span>
              </button>
            ) : (
              <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Avatar name={head.fullName} />
                <span className="truncate">
                  {head.title ? `${head.title} · ` : ''}
                  {shortName(head.fullName)}
                </span>
              </span>
            )
          ) : (
            !node.virtual && (
              <span className="mt-1 text-xs italic text-muted-foreground">{t('people.org.noHead', 'no head')}</span>
            )
          )}
        </>
      ) : (
        person && (
          <>
            <span className="truncate text-[11px] text-muted-foreground" title={person.title ?? undefined}>
              {person.title ?? ' '}
              {dim ? ` · ${t(`people.status.${person.status}`, person.status)}` : ''}
            </span>
            {interactive ? (
              <button
                type="button"
                className="mt-0.5 flex min-w-0 items-center gap-1.5 rounded text-left text-[13px] font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => handlers?.open(person.cardId)}
                title={person.fullName}
              >
                <Avatar name={person.fullName} />
                <span className="truncate">{person.fullName}</span>
              </button>
            ) : (
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                <Avatar name={person.fullName} />
                <span className="truncate">{person.fullName}</span>
              </span>
            )}
          </>
        )
      )}
      {interactive && node.hasChildren && (
        <button
          type="button"
          aria-expanded={!node.collapsed}
          aria-label={
            node.collapsed
              ? t('people.org.expand', 'Expand «{{name}}» ({{count}} below)', {
                  name: blockName,
                  count: node.hiddenCount,
                })
              : t('people.org.collapse', 'Collapse «{{name}}»', { name: blockName })
          }
          onClick={() => handlers?.toggle(id)}
          className="absolute -bottom-3 left-1/2 flex h-6 -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-card px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground shadow-tile hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {node.collapsed ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              {node.hiddenCount}
            </>
          ) : (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}
      {!interactive && node.collapsed && (
        <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card px-1.5 text-[10px] text-muted-foreground">
          +{node.hiddenCount}
        </span>
      )}
    </div>
  );
});
