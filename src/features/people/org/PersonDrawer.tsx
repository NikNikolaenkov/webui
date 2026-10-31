/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoveRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePeopleAccess } from '../access';
import { shouldLoadHr, type Person, type Unit } from '../model';
import { personPath, useHrCard } from '../queries';
import { unitPath } from '../tree';
import { formatDate } from '../styles';
import { Dash, StatusBadge } from '../components/parts';
import { initials } from './names';

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-xs last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-dim">{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

/** The short card on the right of the chart (as in the mockup); the full card is one click away. */
export function PersonDrawer({
  person,
  people,
  units,
  onSelect,
  onMove,
  onClose,
}: {
  person: Person;
  people: Map<string, Person>;
  units: Unit[];
  onSelect: (cardId: string) => void;
  onMove: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = usePeopleAccess((s) => s.role);
  // Birthday lives in the HR card: requested only for HR and admins (support never asks).
  const hr = useHrCard(person.cardId, shouldLoadHr(role));
  const manager = person.managerCardId ? people.get(person.managerCardId) : undefined;
  const unit = unitPath(units, person.unitId).at(-1);
  const since = person.statusDates.created;
  const systems = Object.entries(person.systems);

  return (
    <aside
      aria-label={person.fullName}
      className="absolute bottom-3 right-3 top-3 z-10 flex w-[300px] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lift print:hidden"
    >
      <div className="flex items-start gap-3 border-b border-border p-4">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-highlight text-sm font-semibold text-highlight-foreground"
        >
          {initials(person.fullName)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-snug text-foreground">{person.fullName}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[person.title, unit?.name].filter(Boolean).join(' · ') || <Dash />}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('people.org.close', 'Close')}>
          <X aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <Group title={t('people.org.main', 'Main')}>
          <Row label={t('people.field.manager', 'Manager')}>
            {manager ? (
              <button type="button" className="hover:underline" onClick={() => onSelect(manager.cardId)}>
                {manager.fullName}
              </button>
            ) : (
              <Dash />
            )}
          </Row>
          {shouldLoadHr(role) && (
            <Row label={t('people.field.birthday', 'Date of birth')}>
              {hr.data?.birthday ? formatDate(hr.data.birthday) : <Dash />}
            </Row>
          )}
          <Row label={t('people.field.status', 'Status')}>
            <span className="inline-flex items-center gap-1.5">
              <StatusBadge status={person.status} />
              {since && (
                <span className="text-muted-foreground">
                  {t('people.org.since', 'since {{date}}', { date: formatDate(since) })}
                </span>
              )}
            </span>
          </Row>
        </Group>

        <Group title={t('people.org.contacts', 'Contacts')}>
          <Row label={t('people.field.account', 'Account')}>
            {person.accountEmail ?? t('people.card.noAccount', 'no account')}
          </Row>
          {person.emails.length > 0 && (
            <Row label={t('people.field.emails', 'Work emails')}>
              {person.emails.map((e) => (
                <div key={e.address}>{e.address}</div>
              ))}
            </Row>
          )}
          {person.phones.length > 0 && (
            <Row label={t('people.field.phones', 'Work phones')}>
              {person.phones.map((p) => (
                <div key={p.number}>{p.number}</div>
              ))}
            </Row>
          )}
          {person.online.map((o) => (
            <Row key={`${o.service}:${o.user}`} label={o.service}>
              {o.user}
            </Row>
          ))}
        </Group>

        <Group title={t('people.section.systems', 'Systems')}>
          {systems.length ? (
            systems.map(([k, v]) => (
              <Row key={k} label={k}>
                {v}
              </Row>
            ))
          ) : (
            <p className="py-1.5 text-xs text-muted-foreground">{t('people.card.noSystems', 'No logins recorded')}</p>
          )}
        </Group>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border p-3">
        <Button size="sm" onClick={() => navigate(personPath(person.cardId))}>
          {t('people.org.openCard', 'Open card')}
        </Button>
        <Button size="sm" variant="outline" onClick={onMove}>
          <MoveRight aria-hidden />
          {t('people.card.move', 'Move')}
        </Button>
      </div>
    </aside>
  );
}
