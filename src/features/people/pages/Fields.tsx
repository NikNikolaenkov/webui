/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronRight, Loader2, Pencil, Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { usePeopleAccess } from '../access';
import { peopleApi, type FieldInput } from '../api';
import { describeError } from '../client';
import { FIELD_TYPES, reorderChanges, sortDefs, unitTreeOrder, type FieldDef, type FieldType } from '../custom';
import { isHrRole } from '../menu';
import type { Unit } from '../model';
import { useFields, useRefreshPeople, useUnits } from '../queries';
import { BODY_CELL, HEADER_CELL, ROW } from '../styles';
import { Choice, Field, Rows } from '../components/fields';
import { ErrorNote, Loading, Notice, PageHeader } from '../components/parts';

function useTypeLabels(): Record<FieldType, string> {
  const { t } = useTranslation();
  return {
    text: t('people.fields.types.text', 'Text'),
    longtext: t('people.fields.types.longtext', 'Long text'),
    number: t('people.fields.types.number', 'Number'),
    date: t('people.fields.types.date', 'Date'),
    select: t('people.fields.types.select', 'Choice from a list'),
    boolean: t('people.fields.types.boolean', 'Yes / no'),
    url: t('people.fields.types.url', 'Link'),
    email: t('people.fields.types.email', 'Email'),
    phone: t('people.fields.types.phone', 'Phone'),
  };
}

/** «Поля»: definitions of the custom card fields. HR and admins only (the helper refuses others too). */
export function FieldsPage() {
  const { t } = useTranslation();
  const role = usePeopleAccess((s) => s.role);
  const allowed = isHrRole(role);
  const fields = useFields();
  const units = useUnits();
  const refresh = useRefreshPeople();
  const typeLabel = useTypeLabels();
  const [dialog, setDialog] = useState<{ field: FieldDef | null } | null>(null);
  const [archiving, setArchiving] = useState<FieldDef | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const unitName = useMemo(() => new Map((units.data ?? []).map((u) => [u.id, u.name])), [units.data]);

  if (!allowed) return <Notice>{t('people.noAccess', 'This page is for HR only.')}</Notice>;

  const all = fields.data ?? [];
  const active = sortDefs(all.filter((f) => !f.archived));
  const archived = sortDefs(all.filter((f) => f.archived));

  const act = async (fn: () => Promise<unknown>, title: string) => {
    try {
      await fn();
    } catch (err) {
      toast({ variant: 'destructive', title, description: describeError(err, t) });
    } finally {
      void refresh();
    }
  };
  const move = (f: FieldDef, dir: 'up' | 'down') =>
    act(
      async () => {
        for (const c of reorderChanges(active, f.id, dir)) await peopleApi.updateField(c.id, { order: c.order });
      },
      t('people.fields.move', 'Order'),
    );

  const unitsOf = (f: FieldDef) =>
    f.unitIds.length ? f.unitIds.map((id) => unitName.get(id) ?? id).join(', ') : t('people.fields.allUnits', 'all');

  const table = (list: FieldDef[], isArchive: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {isArchive ? t('people.fields.archived', 'Archived fields') : t('people.menu.fields', 'Fields')}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={HEADER_CELL}>
              {t('people.fields.label', 'Name')}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {t('people.fields.type', 'Type')}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {t('people.fields.visibility', 'Visibility')}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {t('people.fields.units', 'Units')}
            </th>
            <th scope="col" className={HEADER_CELL}>
              {t('people.fields.hint', 'Hint')}
            </th>
            <th scope="col" className={cn(HEADER_CELL, 'text-right')}>
              <span className="sr-only">{t('list.actions', 'Actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((f, i) => (
            <tr key={f.id} className={ROW}>
              <td className={cn(BODY_CELL, 'font-semibold')}>{f.label}</td>
              <td className={BODY_CELL}>{typeLabel[f.type] ?? f.type}</td>
              <td className={BODY_CELL}>
                {f.visibility === 'hr' ? t('people.fields.visHr', 'HR only') : t('people.fields.visWork', 'work card')}
              </td>
              <td className={cn(BODY_CELL, 'max-w-[18rem] break-words')}>{unitsOf(f)}</td>
              <td className={cn(BODY_CELL, 'max-w-[18rem] break-words text-muted-foreground')}>{f.hint ?? ''}</td>
              <td className={cn(BODY_CELL, 'whitespace-nowrap text-right')}>
                {isArchive ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void act(
                        () => peopleApi.updateField(f.id, { archived: false }),
                        t('people.fields.restore', 'Restore'),
                      )
                    }
                  >
                    {t('people.fields.restore', 'Restore')}
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={i === 0}
                      aria-label={t('people.fields.up', 'Move up')}
                      onClick={() => void move(f, 'up')}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={i === list.length - 1}
                      aria-label={t('people.fields.down', 'Move down')}
                      onClick={() => void move(f, 'down')}
                    >
                      <ArrowDown />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDialog({ field: f })}>
                      <Pencil aria-hidden />
                      {t('people.card.edit', 'Edit')}
                    </Button>
                    <Button variant="ghost-danger" size="sm" onClick={() => setArchiving(f)}>
                      {t('people.fields.archive', 'Archive')}
                    </Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-3.5">
      <PageHeader
        title={t('people.menu.fields', 'Fields')}
        subtitle={t(
          'people.fields.subtitle',
          'Additional fields of the staff cards: work ones are visible to support, «HR only» ones to HR and administrators.',
        )}
        actions={
          <Button onClick={() => setDialog({ field: null })}>
            <Plus aria-hidden />
            {t('people.fields.add', 'Field')}
          </Button>
        }
      />
      {fields.error && <ErrorNote error={fields.error} onRetry={() => void fields.refetch()} />}
      <section className="tile overflow-hidden">
        {fields.isLoading ? (
          <Loading />
        ) : active.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            {t('people.fields.empty', 'No additional fields yet')}
          </p>
        ) : (
          table(active, false)
        )}
      </section>

      {archived.length > 0 && (
        <section className="tile overflow-hidden">
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
            className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold hover:bg-muted/55"
          >
            <ChevronRight
              className={cn('h-3.5 w-3.5 shrink-0 transition-transform', showArchived && 'rotate-90')}
              aria-hidden
            />
            {t('people.fields.archived', 'Archived fields')} ({archived.length})
          </button>
          {showArchived && table(archived, true)}
        </section>
      )}

      {dialog && (
        <FieldDialog
          field={dialog.field}
          units={units.data ?? []}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
      {archiving && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setArchiving(null)}
          title={t('people.fields.archiveTitle', 'Archive the field «{{label}}»?', { label: archiving.label })}
          description={t(
            'people.fields.archiveText',
            'The field disappears from cards and forms; stored values are kept and shown with the mark «field in archive». It can be restored.',
          )}
          confirmLabel={t('people.fields.archive', 'Archive')}
          variant="destructive"
          onConfirm={() => act(() => peopleApi.updateField(archiving.id, { archived: true }), archiving.label)}
        />
      )}
    </div>
  );
}

function FieldDialog({
  field,
  units,
  onClose,
  onDone,
}: {
  /** Edit this field, or create a new one when null. */
  field: FieldDef | null;
  units: Unit[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const typeLabel = useTypeLabels();
  const [label, setLabel] = useState(field?.label ?? '');
  const [type, setType] = useState<FieldType>(field?.type ?? 'text');
  const [visibility, setVisibility] = useState<FieldDef['visibility']>(field?.visibility ?? 'work');
  const [options, setOptions] = useState((field?.options ?? []).map((value) => ({ value })));
  const [unitIds, setUnitIds] = useState<string[]>(field?.unitIds ?? []);
  const [hint, setHint] = useState(field?.hint ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tree = useMemo(() => unitTreeOrder(units), [units]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const opts = options.map((o) => o.value.trim()).filter(Boolean);
    if (type === 'select' && opts.length === 0) {
      return setError(t('people.fields.optionsRequired', 'Add at least one choice'));
    }
    setBusy(true);
    setError(null);
    try {
      if (field) {
        await peopleApi.updateField(field.id, {
          label: label.trim(),
          hint: hint.trim() || null,
          unitIds,
          ...(field.type === 'select' ? { options: opts } : {}),
        });
      } else {
        const input: FieldInput = {
          label: label.trim(),
          type,
          visibility,
          unitIds,
          ...(hint.trim() ? { hint: hint.trim() } : {}),
          ...(type === 'select' ? { options: opts } : {}),
        };
        await peopleApi.createField(input);
      }
      onDone();
    } catch (err) {
      setError(describeError(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {field ? t('people.fields.editTitle', 'Edit the field') : t('people.fields.createTitle', 'New field')}
          </DialogTitle>
        </DialogHeader>
        <form id="people-field-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
          <Field label={t('people.fields.label', 'Name')}>
            {(id) => (
              <Input
                id={id}
                required
                maxLength={80}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('people.fields.type', 'Type')}
              hint={field ? t('people.fields.fixed', 'Cannot be changed after creation') : undefined}
            >
              {(id) => (
                <Choice
                  id={id}
                  value={type}
                  onChange={(v) => v && setType(v as FieldType)}
                  options={FIELD_TYPES.map((v) => ({ value: v, label: typeLabel[v] }))}
                  disabled={!!field}
                />
              )}
            </Field>
            <Field label={t('people.fields.visibility', 'Visibility')}>
              {(id) => (
                <Choice
                  id={id}
                  value={visibility}
                  onChange={(v) => v && setVisibility(v as FieldDef['visibility'])}
                  options={[
                    { value: 'work', label: t('people.fields.visWork', 'work card') },
                    { value: 'hr', label: t('people.fields.visHr', 'HR only') },
                  ]}
                  disabled={!!field}
                />
              )}
            </Field>
          </div>

          {type === 'select' && (
            <Rows
              label={t('people.fields.options', 'Choices')}
              rows={options}
              columns={[{ key: 'value', placeholder: t('people.fields.option', 'choice') }]}
              onChange={setOptions}
            />
          )}

          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">{t('people.fields.units', 'Units')}</legend>
            <p className="text-xs text-muted-foreground">
              {unitIds.length === 0
                ? t('people.fields.unitsAll', 'Not chosen: the field concerns everyone.')
                : t('people.fields.unitsSome', 'The field concerns these units and the ones below them.')}
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {tree.map(({ unit, depth }) => (
                <div key={unit.id} className="flex items-center gap-2" style={{ paddingLeft: depth * 16 }}>
                  <Checkbox
                    id={`field-unit-${unit.id}`}
                    checked={unitIds.includes(unit.id)}
                    onCheckedChange={(v) =>
                      setUnitIds((ids) => (v === true ? [...ids, unit.id] : ids.filter((x) => x !== unit.id)))
                    }
                  />
                  <Label htmlFor={`field-unit-${unit.id}`} className="font-normal">
                    {unit.name}
                  </Label>
                </div>
              ))}
              {/* Units in the field that no longer exist stay listed so they can be removed. */}
              {unitIds
                .filter((id) => !units.some((u) => u.id === id))
                .map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <Checkbox
                      id={`field-unit-${id}`}
                      checked
                      onCheckedChange={() => setUnitIds((ids) => ids.filter((x) => x !== id))}
                    />
                    <Label htmlFor={`field-unit-${id}`} className="font-normal text-muted-foreground">
                      {id}
                    </Label>
                  </div>
                ))}
            </div>
          </fieldset>

          <Field
            label={t('people.fields.hint', 'Hint')}
            hint={t('people.fields.hintHelp', 'Shown under the input; up to 200 characters')}
          >
            {(id) => <Input id={id} maxLength={200} value={hint} onChange={(e) => setHint(e.target.value)} />}
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
          <Button type="submit" form="people-field-form" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {field ? t('common.save', 'Save') : t('people.form.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
