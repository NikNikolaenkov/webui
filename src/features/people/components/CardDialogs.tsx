/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { peopleApi } from '../api';
import type { HrCard, Person, Unit } from '../model';
import { moveError, type MoveTarget } from '../tree';
import { Choice, Field, Rows } from './fields';

function FormDialog({
  title,
  description,
  busy,
  error,
  onClose,
  onSubmit,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form id="people-card-dialog" className="space-y-4" onSubmit={submit}>
          {children}
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
          <Button type="submit" form="people-card-dialog" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Move a person onto a unit (under its head) or under another person; cycles are refused before the helper. */
export function MoveDialog({
  person,
  people,
  units,
  onClose,
  onDone,
}: {
  person: Person;
  people: Person[];
  units: Unit[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<'unit' | 'manager'>('unit');
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!target) return setError(t('people.move.pick', 'Choose where to move'));
    const to: MoveTarget = kind === 'unit' ? { unitId: target } : { managerCardId: target };
    const why = moveError(people, units, person.cardId, to);
    if (why) {
      return setError(
        why === 'cycle'
          ? t('people.move.cycle', 'This would make a cycle: the new manager is in this person’s own branch')
          : why === 'self'
            ? t('people.move.self', 'A person cannot be their own manager')
            : t('people.move.unknown', 'Unknown target'),
      );
    }
    setBusy(true);
    setError(null);
    try {
      await peopleApi.movePerson(person.cardId, to);
      onDone();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      title={t('people.move.title', 'Move {{name}}', { name: person.fullName })}
      description={t('people.move.text', 'Subordinates move together with the person.')}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <Field label={t('people.move.kind', 'Move')}>
        {(id) => (
          <Choice
            id={id}
            value={kind}
            onChange={(v) => {
              setKind(v === 'manager' ? 'manager' : 'unit');
              setTarget(null);
            }}
            options={[
              { value: 'unit', label: t('people.move.toUnit', 'to a unit (under its head)') },
              { value: 'manager', label: t('people.move.toManager', 'under a person') },
            ]}
          />
        )}
      </Field>
      <Field label={kind === 'unit' ? t('people.field.unit', 'Unit') : t('people.field.manager', 'Manager')}>
        {(id) => (
          <Choice
            id={id}
            value={target}
            onChange={setTarget}
            placeholder={t('people.move.pick', 'Choose where to move')}
            options={
              kind === 'unit'
                ? units.map((u) => ({ value: u.id, label: u.name }))
                : people.filter((p) => p.cardId !== person.cardId).map((p) => ({ value: p.cardId, label: p.fullName }))
            }
          />
        )}
      </Field>
    </FormDialog>
  );
}

/** The HR card (personal fields). Rendered only for HR and admins. */
export function HrDialog({
  cardId,
  hr,
  onClose,
  onDone,
}: {
  cardId: string;
  hr: HrCard;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [birthday, setBirthday] = useState(hr.birthday ?? '');
  const [emails, setEmails] = useState(hr.personalEmails.map((value) => ({ value })));
  const [phones, setPhones] = useState(hr.personalPhones.map((value) => ({ value })));
  const [notes, setNotes] = useState(hr.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await peopleApi.putHr(cardId, {
        birthday: birthday || null,
        personalEmails: emails.map((e) => e.value.trim()).filter(Boolean),
        personalPhones: phones.map((p) => p.value.trim()).filter(Boolean),
        notes: notes.trim() || null,
      });
      onDone();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      title={t('people.section.hr', 'HR (personal)')}
      description={t('people.hr.private', 'Visible only to HR: stored in the «Personnel — HR» address book.')}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <Field label={t('people.field.birthday', 'Date of birth')}>
        {(id) => <Input id={id} type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />}
      </Field>
      <Rows
        label={t('people.field.personalEmails', 'Personal emails')}
        rows={emails}
        columns={[{ key: 'value', placeholder: t('people.field.address', 'address'), type: 'email' }]}
        onChange={setEmails}
      />
      <Rows
        label={t('people.field.personalPhones', 'Personal phones')}
        rows={phones}
        columns={[{ key: 'value', placeholder: t('people.field.number', 'number'), type: 'tel' }]}
        onChange={setPhones}
      />
      <Field label={t('people.field.notes', 'HR notes')}>
        {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
    </FormDialog>
  );
}
