/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Loader2, Plus, Search } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { peopleApi } from '../api';
import type { Line } from '../model';
import { personPath, useLines, usePeople, useRefreshPeople } from '../queries';
import { BODY_CELL, HEADER_CELL, formatDate } from '../styles';
import { Choice, Field } from '../components/fields';
import { ErrorNote, Loading, PageHeader } from '../components/parts';
import { describeError } from '../client';

type Filter = 'all' | 'free' | 'held';

export function LinesPage() {
  const { t } = useTranslation();
  const lines = useLines();
  const people = usePeople();
  const refresh = useRefreshPeople();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<Line | null>(null);
  const [releasing, setReleasing] = useState<Line | null>(null);
  const [creating, setCreating] = useState(false);

  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.cardId, p])), [people.data]);
  const name = (id: string) => byId.get(id)?.fullName ?? id;
  const needle = query.trim().toLocaleLowerCase('uk');
  const list = (lines.data ?? [])
    .filter((l) => filter === 'all' || (filter === 'free' ? !l.holderCardId : !!l.holderCardId))
    .filter(
      (l) =>
        !needle ||
        [l.number, l.label ?? '', l.holderCardId ? name(l.holderCardId) : '']
          .join('\n')
          .toLocaleLowerCase('uk')
          .includes(needle),
    )
    .sort((a, b) => a.number.localeCompare(b.number, 'uk', { numeric: true }));
  const freeCount = (lines.data ?? []).filter((l) => !l.holderCardId).length;

  const act = async (fn: () => Promise<unknown>, title: string) => {
    try {
      await fn();
    } catch (err) {
      toast({ variant: 'destructive', title, description: describeError(err, t) });
    } finally {
      void refresh();
    }
  };

  return (
    <div className="space-y-3.5">
      <PageHeader
        title={t('people.menu.lines', 'Phone lines')}
        subtitle={
          lines.data
            ? t('people.lines.count', 'Total: {{total}}, free: {{free}}', { total: lines.data.length, free: freeCount })
            : undefined
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t('people.lines.add', 'Line')}
          </Button>
        }
      />
      {lines.error && <ErrorNote error={lines.error} onRetry={() => void lines.refetch()} />}
      <section className="tile relative overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim"
              aria-hidden
            />
            <Input
              variant="pill"
              className="pl-9"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('people.lines.search', 'Number, name, holder')}
              aria-label={t('common.search', 'Search')}
            />
          </div>
          <div className="w-44">
            <Choice
              variant="pill"
              value={filter}
              onChange={(v) => setFilter((v as Filter) ?? 'all')}
              ariaLabel={t('people.field.status', 'Status')}
              options={[
                { value: 'all', label: t('people.lines.all', 'All lines') },
                { value: 'free', label: t('people.lines.free', 'Free') },
                { value: 'held', label: t('people.lines.held', 'Assigned') },
              ]}
            />
          </div>
        </div>
        {lines.isLoading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('people.menu.lines', 'Phone lines')}</caption>
              <thead>
                <tr>
                  <th scope="col" className={HEADER_CELL}>
                    {t('people.lines.number', 'Number')}
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    {t('people.lines.label', 'Name')}
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    {t('people.lines.holder', 'Assigned to')}
                  </th>
                  <th scope="col" className={cn(HEADER_CELL, 'text-right')}>
                    <span className="sr-only">{t('list.actions', 'Actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={4} className="border-t border-border px-3 py-12 text-center text-muted-foreground">
                      {t('list.noResults', 'No results found')}
                    </td>
                  </tr>
                )}
                {list.map((l) => {
                  const expanded = open.has(l.id);
                  const toggle = () =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(l.id)) n.delete(l.id);
                      else n.add(l.id);
                      return n;
                    });
                  return (
                    <Fragment key={l.id}>
                      <tr className="border-t border-border hover:bg-muted/55">
                        <th scope="row" className={cn(BODY_CELL, 'text-left font-semibold')}>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:underline"
                            aria-expanded={expanded}
                            onClick={toggle}
                            title={t('people.lines.history', 'History')}
                          >
                            <ChevronRight
                              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')}
                              aria-hidden
                            />
                            {l.number}
                          </button>
                        </th>
                        <td className={BODY_CELL}>{l.label ?? ''}</td>
                        <td className={BODY_CELL}>
                          {l.holderCardId ? (
                            <Link className="hover:underline" to={personPath(l.holderCardId)}>
                              {name(l.holderCardId)}
                            </Link>
                          ) : (
                            <Badge variant="secondary">{t('people.lines.freeOne', 'free')}</Badge>
                          )}
                        </td>
                        <td className={cn(BODY_CELL, 'text-right')}>
                          {l.holderCardId ? (
                            <Button variant="ghost-danger" size="sm" onClick={() => setReleasing(l)}>
                              {t('people.lines.release', 'Release')}
                            </Button>
                          ) : (
                            <Button variant="secondary" size="sm" onClick={() => setAssigning(l)}>
                              {t('people.lines.assign', 'Assign')}
                            </Button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-muted/40">
                          <td colSpan={4} className="px-5 py-2.5">
                            {l.history.length === 0 ? (
                              <span className="text-muted-foreground">
                                {t('people.lines.noHistory', 'Never assigned')}
                              </span>
                            ) : (
                              <ol className="space-y-1">
                                {[...l.history].reverse().map((h, i) => (
                                  <li key={i}>
                                    <span className="font-medium">{name(h.holderCardId)}</span>{' '}
                                    <span className="text-muted-foreground">
                                      {formatDate(h.from)} – {h.to ? formatDate(h.to) : t('people.lines.now', 'now')} ·{' '}
                                      {h.by}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {assigning && (
        <AssignDialog
          line={assigning}
          people={(people.data ?? []).filter((p) => p.status === 'active')}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            void refresh();
          }}
        />
      )}
      {releasing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setReleasing(null)}
          title={t('people.lines.releaseTitle', 'Release line {{number}}?', { number: releasing.number })}
          description={t('people.lines.releaseText', 'The line becomes free; the history keeps who held it.')}
          confirmLabel={t('people.lines.release', 'Release')}
          onConfirm={() => act(() => peopleApi.releaseLine(releasing.id), t('people.lines.release', 'Release'))}
        />
      )}
      {creating && (
        <CreateLineDialog
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function AssignDialog({
  line,
  people,
  onClose,
  onDone,
}: {
  line: Line;
  people: { cardId: string; fullName: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [cardId, setCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cardId) return;
    setBusy(true);
    try {
      await peopleApi.assignLine(line.id, cardId);
      onDone();
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('people.lines.assignTitle', 'Assign line {{number}}', { number: line.number })}</DialogTitle>
        </DialogHeader>
        <form id="people-assign-line" onSubmit={(e) => void submit(e)} className="space-y-3">
          <Field label={t('people.lines.holder', 'Assigned to')}>
            {(id) => (
              <Choice
                id={id}
                value={cardId}
                onChange={setCardId}
                placeholder={t('people.lines.pickPerson', 'Choose a person')}
                options={people.map((p) => ({ value: p.cardId, label: p.fullName }))}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form="people-assign-line" disabled={busy || !cardId}>
            {busy && <Loader2 className="animate-spin" />}
            {t('people.lines.assign', 'Assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateLineDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await peopleApi.createLine({ number: number.trim(), ...(label.trim() ? { label: label.trim() } : {}) });
      onDone();
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('people.lines.createTitle', 'New phone line')}</DialogTitle>
        </DialogHeader>
        <form id="people-create-line" onSubmit={(e) => void submit(e)} className="space-y-3">
          <Field
            label={t('people.lines.number', 'Number')}
            hint={t('people.lines.numberHint', 'SIP extension or external FMC number')}
          >
            {(id) => (
              <Input id={id} required minLength={3} value={number} onChange={(e) => setNumber(e.target.value)} />
            )}
          </Field>
          <Field label={t('people.lines.label', 'Name')}>
            {(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} />}
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" form="people-create-line" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {t('common.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
