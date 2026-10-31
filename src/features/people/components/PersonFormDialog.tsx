/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { peopleApi, type CreatePersonInput } from '../api';
import { emptyForm, formToPatch, personToForm, type Person, type PersonForm, type Unit } from '../model';
import { Choice, Field, Rows } from './fields';

interface Props {
  /** Edit this person, or create a new one when null. */
  person: Person | null;
  units: Unit[];
  people: Person[];
  /** HR fields on creation (birthday, personal phone, notes): HR and admins only. */
  withHr: boolean;
  onClose: () => void;
  onSaved: (person: Person, password?: string) => void;
}

export function PersonFormDialog({ person, units, people, withHr, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<PersonForm>(() => (person ? personToForm(person) : emptyForm()));
  const [withAccount, setWithAccount] = useState(true);
  const [login, setLogin] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [managerCardId, setManagerCardId] = useState<string | null>(null);
  const [hr, setHr] = useState({ birthday: '', phone: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PersonForm>(key: K, value: PersonForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const patch = formToPatch(form);
      if (person) {
        onSaved(await peopleApi.updatePerson(person.cardId, patch));
      } else {
        const input: CreatePersonInput = {
          ...(withAccount && login.trim() ? { account: { login: login.trim() } } : {}),
          card: { ...patch, unitId, managerCardId },
        };
        if (withHr && (hr.birthday || hr.phone.trim() || hr.notes.trim())) {
          input.hrCard = {
            birthday: hr.birthday || null,
            personalPhones: hr.phone.trim() ? [hr.phone.trim()] : [],
            notes: hr.notes.trim() || null,
          };
        }
        const created = await peopleApi.createPerson(input);
        onSaved(created.person, created.password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const unitOptions = units.map((u) => ({ value: u.id, label: u.name }));
  const peopleOptions = people.map((p) => ({ value: p.cardId, label: p.fullName }));

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {person ? t('people.form.editTitle', 'Edit card') : t('people.form.createTitle', 'New person')}
          </DialogTitle>
        </DialogHeader>
        <form id="people-person-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('people.field.fullName', 'Full name')}>
              {(id) => (
                <Input id={id} required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
              )}
            </Field>
            <Field label={t('people.field.title', 'Position')}>
              {(id) => <Input id={id} value={form.title} onChange={(e) => set('title', e.target.value)} />}
            </Field>
          </div>

          {!person && (
            <div className="grid gap-4 rounded-xl bg-muted/60 p-4 sm:grid-cols-2">
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  id="people-with-account"
                  checked={withAccount}
                  onCheckedChange={(v) => setWithAccount(v === true)}
                />
                <Label htmlFor="people-with-account">{t('people.form.withAccount', 'Create a mail account')}</Label>
              </div>
              {withAccount && (
                <Field
                  label={t('people.field.login', 'Login')}
                  hint={t('people.form.loginHint', 'Latin letters, digits, . _ -; the password is shown once')}
                >
                  {(id) => (
                    <Input
                      id={id}
                      required
                      pattern="[a-z0-9][a-z0-9._\-]{0,63}"
                      value={login}
                      onChange={(e) => setLogin(e.target.value.toLowerCase())}
                    />
                  )}
                </Field>
              )}
              <Field label={t('people.field.unit', 'Unit')}>
                {(id) => (
                  <Choice
                    id={id}
                    value={unitId}
                    onChange={setUnitId}
                    options={unitOptions}
                    noneLabel={t('people.none', '—')}
                  />
                )}
              </Field>
              <Field label={t('people.field.manager', 'Manager')}>
                {(id) => (
                  <Choice
                    id={id}
                    value={managerCardId}
                    onChange={setManagerCardId}
                    options={peopleOptions}
                    noneLabel={t('people.none', '—')}
                  />
                )}
              </Field>
            </div>
          )}

          <Rows
            label={t('people.field.emails', 'Work emails')}
            rows={form.emails}
            columns={[
              { key: 'address', placeholder: t('people.field.address', 'address'), type: 'email' },
              { key: 'label', placeholder: t('people.field.label', 'label') },
            ]}
            onChange={(rows) => set('emails', rows)}
          />
          <Rows
            label={t('people.field.phones', 'Work phones')}
            rows={form.phones}
            columns={[
              { key: 'number', placeholder: t('people.field.number', 'number'), type: 'tel' },
              { key: 'label', placeholder: t('people.field.label', 'label') },
            ]}
            onChange={(rows) => set('phones', rows)}
          />
          <Rows
            label={t('people.field.online', 'Messengers')}
            rows={form.online}
            columns={[
              { key: 'service', placeholder: t('people.field.service', 'Telegram, WhatsApp, Zoom…') },
              { key: 'user', placeholder: t('people.field.user', 'user') },
            ]}
            onChange={(rows) => set('online', rows)}
          />
          <Rows
            label={t('people.field.systems', 'Logins in systems')}
            rows={form.systems}
            columns={[
              { key: 'key', placeholder: t('people.field.system', 'creatio, bitrix24, unitalk…') },
              { key: 'value', placeholder: t('people.field.systemLogin', 'login') },
            ]}
            onChange={(rows) => set('systems', rows)}
          />

          {!person && withHr && (
            <div className="space-y-4 rounded-xl border border-border p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                {t('people.section.hr', 'HR (personal)')}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('people.field.birthday', 'Date of birth')}>
                  {(id) => (
                    <Input
                      id={id}
                      type="date"
                      value={hr.birthday}
                      onChange={(e) => setHr({ ...hr, birthday: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={t('people.field.personalPhone', 'Personal phone')}>
                  {(id) => (
                    <Input
                      id={id}
                      type="tel"
                      value={hr.phone}
                      onChange={(e) => setHr({ ...hr, phone: e.target.value })}
                    />
                  )}
                </Field>
              </div>
              <Field label={t('people.field.notes', 'HR notes')}>
                {(id) => (
                  <Textarea id={id} value={hr.notes} onChange={(e) => setHr({ ...hr, notes: e.target.value })} />
                )}
              </Field>
            </div>
          )}

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
          <Button type="submit" form="people-person-form" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {person ? t('common.save', 'Save') : t('people.form.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
