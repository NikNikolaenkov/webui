/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePeopleAccess } from '../access';
import { isHrRole } from '../menu';
import { filterPeople, type ArchivedPerson } from '../model';
import { personPath, useArchive, usePeople, useUnits } from '../queries';
import { formatDate } from '../styles';
import { Dash, ErrorNote, KV, Loading, Notice, PageHeader, Section, StatusBadge } from '../components/parts';

/** «Архів»: HR and admins only (the helper refuses others; the menu hides it from support). */
export function ArchivePage() {
  const { t } = useTranslation();
  const role = usePeopleAccess((s) => s.role);
  const allowed = isHrRole(role);
  const archive = useArchive(allowed);
  const people = usePeople();
  const units = useUnits();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const unitName = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u.name])), [units.data]);

  if (!allowed) return <Notice>{t('people.noAccess', 'This page is for HR only.')}</Notice>;

  const pending = filterPeople(people.data ?? [], { status: 'deleted', query });
  const archived = filterPeople(archive.data ?? [], { query });

  return (
    <div className="space-y-3.5">
      <PageHeader
        title={t('people.menu.archive', 'Archive')}
        subtitle={t('people.archive.subtitle', 'HR data of people whose accounts were deleted; kept forever.')}
      />
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" aria-hidden />
        <Input
          variant="pill"
          className="pl-9"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('people.list.search', 'Name, email, phone, position')}
          aria-label={t('common.search', 'Search')}
        />
      </div>

      {pending.length > 0 && (
        <Section title={t('people.archive.pending', 'Deleted, can still be restored (30 days)')}>
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <li key={p.cardId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <Link className="font-medium hover:underline" to={personPath(p.cardId)}>
                  {p.fullName}
                </Link>
                <span className="text-muted-foreground">
                  {p.statusDates.deleted ? formatDate(p.statusDates.deleted) : ''} <StatusBadge status={p.status} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {archive.error && <ErrorNote error={archive.error} onRetry={() => void archive.refetch()} />}
      {archive.isLoading ? (
        <Loading />
      ) : (
        <section className="tile overflow-hidden">
          {archived.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              {t('people.archive.empty', 'The archive is empty')}
            </p>
          ) : (
            <ul>
              {archived.map((p) => (
                <ArchivedRow
                  key={p.cardId}
                  person={p}
                  unit={p.unitId ? unitName.get(p.unitId) : undefined}
                  open={open === p.cardId}
                  onToggle={() => setOpen(open === p.cardId ? null : p.cardId)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function ArchivedRow({
  person: p,
  unit,
  open,
  onToggle,
}: {
  person: ArchivedPerson;
  unit?: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left text-sm hover:bg-muted/55"
      >
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
        <span className="font-semibold">{p.fullName}</span>
        <span className="text-muted-foreground">{[p.title, unit].filter(Boolean).join(' · ')}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {p.statusDates.purged
            ? t('people.archive.purged', 'deleted {{date}}', { date: formatDate(p.statusDates.purged) })
            : ''}
        </span>
      </button>
      {open && (
        <div className="grid gap-3.5 bg-muted/30 px-5 py-4 md:grid-cols-2">
          <dl>
            <KV label={t('people.field.account', 'Account')}>{p.accountEmail ?? <Dash />}</KV>
            {Object.entries(p.statusDates).map(([k, v]) => (
              <KV key={k} label={t(`people.dates.${k}`, k)}>
                {formatDate(v)}
              </KV>
            ))}
            <KV label={t('people.field.birthday', 'Date of birth')}>
              {p.hr?.birthday ? formatDate(p.hr.birthday) : <Dash />}
            </KV>
            <KV label={t('people.field.personalPhones', 'Personal phones')}>
              {p.hr?.personalPhones.join(', ') || <Dash />}
            </KV>
            <KV label={t('people.field.notes', 'HR notes')}>{p.hr?.notes ?? <Dash />}</KV>
          </dl>
          <div>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-dim">
              {t('people.section.history', 'History')}
            </h3>
            {p.history.length === 0 ? (
              <Dash />
            ) : (
              <ol className="space-y-1.5 text-sm">
                {p.history.map((h, i) => (
                  <li key={i}>
                    <div>{h.summary}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(h.at, true)} · {h.actorEmail}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
