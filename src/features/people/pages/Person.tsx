/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MoveRight, Pencil, Phone } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { usePeopleAccess } from '../access';
import { peopleApi } from '../api';
import { isHrRole, PEOPLE_VIEWS } from '../menu';
import { cardSections, shouldLoadHr, type Line } from '../model';
import {
  personPath,
  sectionPath,
  useAudit,
  useFields,
  useHrCard,
  useLines,
  usePeople,
  usePerson,
  useRefreshPeople,
  useUnits,
} from '../queries';
import { cardFields, customBlock } from '../custom';
import { unitPath } from '../tree';
import { formatDate } from '../styles';
import { Choice } from '../components/fields';
import { HrDialog, MoveDialog } from '../components/CardDialogs';
import { CustomFieldRows } from '../components/CustomFields';
import { LifecycleActions } from '../components/LifecycleActions';
import { Dash, ErrorNote, KV, Loading, PageHeader, Section, StatusBadge } from '../components/parts';
import { PersonFormDialog } from '../components/PersonFormDialog';
import { describeError, PeopleApiError } from '../client';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function PersonPage({ cardId }: { cardId: string }) {
  const { t } = useTranslation();
  const role = usePeopleAccess((s) => s.role);
  const person = usePerson(cardId);
  const people = usePeople();
  const units = useUnits();
  const lines = useLines();
  const fields = useFields();
  // A failed refetch keeps the definitions already loaded; only a list that never loaded is an error.
  const fieldsFailed = !!fields.error && !fields.data;
  const audit = useAudit(cardId);
  // Support never requests the HR card (the helper would refuse anyway): no HR widget is rendered for it.
  const hr = useHrCard(cardId, shouldLoadHr(role));
  const refresh = useRefreshPeople();
  const [dialog, setDialog] = useState<'edit' | 'move' | 'hr' | null>(null);
  const [releasing, setReleasing] = useState<Line | null>(null);
  const [lineToAssign, setLineToAssign] = useState<string | null>(null);

  const sections = cardSections(role);
  const p = person.data;
  const nameOf = useMemo(() => new Map((people.data ?? []).map((x) => [x.cardId, x])), [people.data]);
  const path = p ? unitPath(units.data ?? [], p.unitId) : [];
  // Custom fields: work block for everyone, the HR block (own definitions) for HR and admins only.
  const workFields = p ? cardFields(fields.data ?? [], 'work', p.unitId, units.data ?? [], p.custom ?? {}) : [];
  const hrFields =
    p && hr.data ? cardFields(fields.data ?? [], 'hr', p.unitId, units.data ?? [], hr.data.custom ?? {}) : [];
  const held = (lines.data ?? []).filter((l) => l.holderCardId === cardId);
  const free = (lines.data ?? []).filter((l) => !l.holderCardId);

  // The card stays mounted while it has data, also when a refetch fails: the lifecycle buttons (and a password just
  // returned by the helper, shown once in their dialog) must not be unmounted by a transient error.
  if (!p) {
    if (person.isLoading) return <Loading />;
    return (
      <ErrorNote
        error={person.error ?? new PeopleApiError(404, 'not_found', '')}
        onRetry={() => void person.refetch()}
      />
    );
  }

  const done = () => {
    setDialog(null);
    void refresh();
  };
  const assign = async () => {
    if (!lineToAssign) return;
    try {
      await peopleApi.assignLine(lineToAssign, cardId);
      setLineToAssign(null);
    } catch (err) {
      toast({ variant: 'destructive', title: t('people.lines.assign', 'Assign'), description: describeError(err, t) });
    } finally {
      void refresh();
    }
  };
  const release = async (line: Line) => {
    try {
      await peopleApi.releaseLine(line.id);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('people.lines.release', 'Release'),
        description: describeError(err, t),
      });
    } finally {
      void refresh();
    }
  };
  const manager = p.managerCardId ? nameOf.get(p.managerCardId) : undefined;
  const dates = Object.entries(p.statusDates);

  return (
    <div className="space-y-3.5">
      <Link
        to={sectionPath(PEOPLE_VIEWS.people)}
        className="inline-flex items-center gap-1 px-1 pt-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('people.menu.people', 'People')}
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-highlight text-base font-semibold text-highlight-foreground"
            >
              {initials(p.fullName)}
            </span>
            <span className="min-w-0">
              {p.fullName} <StatusBadge status={p.status} />
            </span>
          </span>
        }
        subtitle={[p.title, path.map((u) => u.name).join(' › ')].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setDialog('edit')}>
              <Pencil aria-hidden />
              {t('people.card.edit', 'Edit')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDialog('move')}>
              <MoveRight aria-hidden />
              {t('people.card.move', 'Move')}
            </Button>
            <LifecycleActions person={p} />
          </>
        }
      />

      {person.error && <ErrorNote error={person.error} onRetry={() => void person.refetch()} />}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <div className="space-y-3.5">
          {sections.includes('account') && (
            <Section title={t('people.section.account', 'Account')}>
              <dl>
                <KV label={t('people.field.accountEmail', 'Address')}>
                  {p.accountEmail ?? t('people.card.noAccount', 'no account')}
                </KV>
                <KV label={t('people.field.status', 'Status')}>
                  <StatusBadge status={p.status} />
                </KV>
                {dates.map(([k, v]) => (
                  <KV key={k} label={t(`people.dates.${k}`, k)}>
                    {formatDate(v, true)}
                  </KV>
                ))}
              </dl>
              {p.accountId && !p.managed && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t(
                    'people.card.notManaged',
                    'The account is not managed by the helper: lifecycle actions are unavailable until an administrator adopts it.',
                  )}
                </p>
              )}
            </Section>
          )}

          {sections.includes('work') && (
            <Section title={t('people.section.work', 'Work card')}>
              <dl>
                <KV label={t('people.field.title', 'Position')}>{p.title ?? <Dash />}</KV>
                <KV label={t('people.field.unit', 'Unit')}>{path.map((u) => u.name).join(' › ') || <Dash />}</KV>
                <KV label={t('people.field.manager', 'Manager')}>
                  {manager ? (
                    <Link className="hover:underline" to={personPath(manager.cardId)}>
                      {manager.fullName}
                    </Link>
                  ) : (
                    <Dash />
                  )}
                </KV>
                <KV label={t('people.field.emails', 'Work emails')}>
                  {p.emails.length ? (
                    p.emails.map((e) => (
                      <div key={e.address}>
                        {e.address}
                        {e.label ? ` (${e.label})` : ''}
                      </div>
                    ))
                  ) : (
                    <Dash />
                  )}
                </KV>
                <KV label={t('people.field.phones', 'Work phones')}>
                  {p.phones.length ? (
                    p.phones.map((x) => (
                      <div key={x.number}>
                        {x.number}
                        {x.label ? ` (${x.label})` : ''}
                      </div>
                    ))
                  ) : (
                    <Dash />
                  )}
                </KV>
                <KV label={t('people.field.online', 'Messengers')}>
                  {p.online.length ? (
                    p.online.map((o) => (
                      <div key={`${o.service}:${o.user}`}>
                        {o.service}: {o.user}
                      </div>
                    ))
                  ) : (
                    <Dash />
                  )}
                </KV>
              </dl>
            </Section>
          )}

          {sections.includes('work') && customBlock(fieldsFailed, workFields.length) !== 'none' && (
            <Section title={t('people.section.custom', 'Additional fields')}>
              {fieldsFailed ? (
                <ErrorNote error={fields.error} onRetry={() => void fields.refetch()} />
              ) : (
                <dl>
                  <CustomFieldRows rows={workFields} />
                </dl>
              )}
            </Section>
          )}

          {sections.includes('systems') && (
            <Section title={t('people.section.systems', 'Systems')}>
              {Object.keys(p.systems).length ? (
                <dl>
                  {Object.entries(p.systems).map(([k, v]) => (
                    <KV key={k} label={k}>
                      {v || <Dash />}
                    </KV>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">{t('people.card.noSystems', 'No logins recorded')}</p>
              )}
            </Section>
          )}
        </div>

        <div className="space-y-3.5">
          {sections.includes('lines') && (
            <Section title={t('people.menu.lines', 'Phone lines')}>
              {held.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('people.lines.none', 'No lines')}</p>
              )}
              <ul className="divide-y divide-border">
                {held.map((l) => {
                  const since = l.history.find((h) => h.holderCardId === cardId && !h.to)?.from;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <span className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-dim" aria-hidden />
                        <span className="font-medium">{l.number}</span>
                        {l.label && <span className="text-muted-foreground">{l.label}</span>}
                        {since && (
                          <span className="text-xs text-muted-foreground">
                            {t('people.lines.since', 'since {{date}}', { date: formatDate(since) })}
                          </span>
                        )}
                      </span>
                      <Button variant="ghost-danger" size="sm" onClick={() => setReleasing(l)}>
                        {t('people.lines.release', 'Release')}
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {p.status === 'active' && free.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1">
                    <Choice
                      value={lineToAssign}
                      onChange={setLineToAssign}
                      placeholder={t('people.lines.pickFree', 'Free line…')}
                      ariaLabel={t('people.lines.pickFree', 'Free line…')}
                      options={free.map((l) => ({
                        value: l.id,
                        label: l.label ? `${l.number} · ${l.label}` : l.number,
                      }))}
                    />
                  </div>
                  <Button size="sm" disabled={!lineToAssign} onClick={() => void assign()}>
                    {t('people.lines.assign', 'Assign')}
                  </Button>
                </div>
              )}
            </Section>
          )}

          {sections.includes('hr') && isHrRole(role) && (
            <Section
              title={t('people.section.hr', 'HR (personal)')}
              actions={
                hr.data && (
                  <Button variant="ghost" size="sm" onClick={() => setDialog('hr')}>
                    <Pencil aria-hidden />
                    {t('people.card.edit', 'Edit')}
                  </Button>
                )
              }
            >
              {hr.isLoading ? (
                <Loading />
              ) : hr.error ? (
                <ErrorNote error={hr.error} />
              ) : (
                hr.data && (
                  <dl>
                    <KV label={t('people.field.birthday', 'Date of birth')}>
                      {hr.data.birthday ? formatDate(hr.data.birthday) : <Dash />}
                    </KV>
                    <KV label={t('people.field.personalEmails', 'Personal emails')}>
                      {hr.data.personalEmails.join(', ') || <Dash />}
                    </KV>
                    <KV label={t('people.field.personalPhones', 'Personal phones')}>
                      {hr.data.personalPhones.join(', ') || <Dash />}
                    </KV>
                    <KV label={t('people.field.notes', 'HR notes')}>{hr.data.notes ?? <Dash />}</KV>
                    <CustomFieldRows rows={hrFields} />
                  </dl>
                )
              )}
              {hr.data && fieldsFailed && (
                <div className="mt-3">
                  <ErrorNote error={fields.error} onRetry={() => void fields.refetch()} />
                </div>
              )}
            </Section>
          )}

          {sections.includes('history') && (
            <Section title={t('people.section.history', 'History')}>
              {audit.isLoading ? (
                <Loading />
              ) : audit.error ? (
                <ErrorNote error={audit.error} />
              ) : (audit.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('people.card.noHistory', 'No changes recorded')}</p>
              ) : (
                <ol className="space-y-2">
                  {(audit.data ?? []).map((e) => (
                    <li key={e.id} className="text-sm">
                      <div>{e.summary}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(e.at, true)} · {e.actorEmail} · {e.source}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          )}
        </div>
      </div>

      {dialog === 'edit' && (
        <PersonFormDialog
          person={p}
          units={units.data ?? []}
          people={people.data ?? []}
          withHr={false}
          onClose={() => setDialog(null)}
          onSaved={done}
        />
      )}
      {dialog === 'move' && (
        <MoveDialog
          person={p}
          people={people.data ?? []}
          units={units.data ?? []}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog === 'hr' && hr.data && (
        <HrDialog
          cardId={cardId}
          hr={hr.data}
          fields={fields.data ?? []}
          fieldsFailed={fieldsFailed}
          unitId={p.unitId}
          units={units.data ?? []}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {releasing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setReleasing(null)}
          title={t('people.lines.releaseTitle', 'Release line {{number}}?', { number: releasing.number })}
          description={t('people.lines.releaseText', 'The line becomes free; the history keeps who held it.')}
          confirmLabel={t('people.lines.release', 'Release')}
          onConfirm={() => release(releasing)}
        />
      )}
    </div>
  );
}
