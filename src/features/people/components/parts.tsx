/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Status } from '../model';
import { describeError } from '../client';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 px-1 pb-1 pt-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A titled tile, like the key/value blocks of the mockup («Основне», «Контакти», «Системи»). */
export function Section({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('tile p-5', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-dim">{title}</h2>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function KV({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}

export function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  const label = {
    active: t('people.status.active', 'active'),
    blocked: t('people.status.blocked', 'blocked'),
    deleted: t('people.status.deleted', 'deleted'),
    archived: t('people.status.archived', 'archived'),
  }[status];
  return (
    <Badge
      variant={status === 'active' ? 'secondary' : status === 'archived' ? 'outline' : 'destructive'}
      className={cn(status === 'active' && 'bg-success-soft text-success')}
    >
      {label ?? status}
    </Badge>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-12" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-brand-text" aria-hidden />
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="rounded-xl bg-destructive-soft p-4 text-sm text-destructive">
      <p>{describeError(error, t)}</p>
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
          {t('common.retry', 'Retry')}
        </Button>
      )}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="mt-3 rounded-2xl bg-muted p-10 text-center text-muted-foreground">{children}</div>;
}
