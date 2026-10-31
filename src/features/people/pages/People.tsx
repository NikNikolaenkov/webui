/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePeopleAccess } from '../access';
import { isHrRole } from '../menu';
import { filterPeople, type Person, type Status } from '../model';
import { personPath, usePeople, useRefreshPeople, useUnits } from '../queries';
import { BODY_CELL, HEADER_CELL, ROW, STRETCHED_LINK } from '../styles';
import { Choice } from '../components/fields';
import { Dash, ErrorNote, Loading, PageHeader, StatusBadge } from '../components/parts';
import { PasswordDialog } from '../components/PasswordDialog';
import { PersonFormDialog } from '../components/PersonFormDialog';

export function PeoplePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = usePeopleAccess((s) => s.role);
  const people = usePeople();
  const units = useUnits();
  const refresh = useRefreshPeople();
  const [query, setQuery] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ person: Person; password: string } | null>(null);

  const unitName = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u.name])), [units.data]);
  const list = useMemo(
    () => filterPeople(people.data ?? [], { query, unitId, status }),
    [people.data, query, unitId, status],
  );

  const statuses: { value: Status; label: string }[] = [
    { value: 'active', label: t('people.status.active', 'active') },
    { value: 'blocked', label: t('people.status.blocked', 'blocked') },
    { value: 'deleted', label: t('people.status.deleted', 'deleted') },
  ];

  return (
    <div className="space-y-3.5">
      <PageHeader
        title={t('people.menu.people', 'People')}
        subtitle={people.data ? t('people.list.count', 'Total: {{count}}', { count: people.data.length }) : undefined}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t('people.list.add', 'Person')}
          </Button>
        }
      />

      {people.error && <ErrorNote error={people.error} onRetry={() => void people.refetch()} />}

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
              placeholder={t('people.list.search', 'Name, email, phone, position')}
              aria-label={t('common.search', 'Search')}
            />
          </div>
          <div className="w-48">
            <Choice
              variant="pill"
              value={unitId}
              onChange={setUnitId}
              options={(units.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
              noneLabel={t('people.list.allUnits', 'All units')}
              ariaLabel={t('people.field.unit', 'Unit')}
            />
          </div>
          <div className="w-40">
            <Choice
              variant="pill"
              value={status}
              onChange={(v) => setStatus(v as Status | null)}
              options={statuses}
              noneLabel={t('people.list.allStatuses', 'Any status')}
              ariaLabel={t('people.field.status', 'Status')}
            />
          </div>
        </div>

        {people.isLoading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('people.menu.people', 'People')}</caption>
              <thead>
                <tr>
                  <th scope="col" className={HEADER_CELL}>
                    {t('people.field.fullName', 'Full name')}
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    {t('people.field.title', 'Position')}
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    {t('people.field.unit', 'Unit')}
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    {t('people.field.account', 'Account')}
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    {t('people.field.status', 'Status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border-t border-border px-3 py-12 text-center text-muted-foreground">
                      {t('list.noResults', 'No results found')}
                    </td>
                  </tr>
                ) : (
                  list.map((p) => (
                    <tr key={p.cardId} className={ROW}>
                      <th scope="row" className={`${BODY_CELL} text-left font-normal`}>
                        <Link to={personPath(p.cardId)} className={STRETCHED_LINK}>
                          {p.fullName}
                        </Link>
                      </th>
                      <td className={BODY_CELL}>{p.title ?? <Dash />}</td>
                      <td className={BODY_CELL}>{(p.unitId && unitName.get(p.unitId)) || <Dash />}</td>
                      <td className={BODY_CELL}>{p.accountEmail ?? <Dash />}</td>
                      <td className={BODY_CELL}>
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <PersonFormDialog
          person={null}
          units={units.data ?? []}
          people={people.data ?? []}
          withHr={isHrRole(role)}
          onClose={() => setCreating(false)}
          onSaved={(person, password) => {
            setCreating(false);
            void refresh();
            if (password) setCreated({ person, password });
            else navigate(personPath(person.cardId));
          }}
        />
      )}
      <PasswordDialog
        password={created?.password ?? null}
        account={created?.person.accountEmail ?? null}
        onClose={() => {
          const id = created?.person.cardId;
          setCreated(null);
          if (id) navigate(personPath(id));
        }}
      />
    </div>
  );
}
