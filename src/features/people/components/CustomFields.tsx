/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { draftOf, formatValue, selectOptions, type CardField, type CustomValues, type StoredField } from '../custom';
import { Choice, Field } from './fields';
import { Dash, KV } from './parts';

/** Yes / no words for boolean values. */
function useYesNo() {
  const { t } = useTranslation();
  return { yes: t('common.yes', 'Yes'), no: t('common.no', 'No') };
}

/** The markers of a stored value that the field's current definition no longer covers. */
export function FieldMarkers({ row }: { row: Pick<CardField, 'archived' | 'outOfList' | 'outOfUnits'> }) {
  const { t } = useTranslation();
  if (!row.archived && !row.outOfList && !row.outOfUnits) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
      {row.archived && <Badge variant="outline">{t('people.fields.mark.archived', 'field in archive')}</Badge>}
      {row.outOfList && <Badge variant="outline">{t('people.fields.mark.outOfList', 'not in list')}</Badge>}
      {row.outOfUnits && (
        <Badge variant="outline">{t('people.fields.mark.outOfUnits', 'outside the field’s units')}</Badge>
      )}
    </span>
  );
}

/** Read-only rows of a card block; empty values show «—». */
export function CustomFieldRows({ rows }: { rows: CardField[] }) {
  const yesNo = useYesNo();
  return (
    <>
      {rows.map((row) => (
        <KV key={row.def.id} label={row.def.label}>
          {row.hasValue ? (
            <>
              <span className={row.def.type === 'longtext' ? 'whitespace-pre-wrap' : undefined}>
                {formatValue(row.def, row.value, yesNo)}
              </span>
              <FieldMarkers row={row} />
            </>
          ) : (
            <Dash />
          )}
        </KV>
      ))}
    </>
  );
}

/** Archive entry: every stored value with its label (also of archived fields). */
export function StoredFieldRows({ rows }: { rows: StoredField[] }) {
  const { t } = useTranslation();
  const yesNo = useYesNo();
  return (
    <>
      {rows.map((r) => (
        <KV key={r.def?.id ?? r.label} label={r.label}>
          {r.def ? formatValue(r.def, r.value, yesNo) : String(r.value)}
          {r.def?.archived && (
            <span className="ml-1.5 align-middle">
              <Badge variant="outline">{t('people.fields.mark.archived', 'field in archive')}</Badge>
            </span>
          )}
        </KV>
      ))}
    </>
  );
}

/**
 * Inputs for the rows of one block inside a dialog. `drafts` holds the text of a row the user touched; a missing
 * draft means «unchanged» (shows the stored value). A boolean has a third «not set» state through the empty choice;
 * a locked row (archived field, or outside its units) shows the value and can only be cleared.
 */
export function CustomFieldInputs({
  rows,
  original,
  drafts,
  onDraft,
}: {
  rows: CardField[];
  original: CustomValues;
  drafts: Record<string, string>;
  /** undefined puts the row back to «unchanged». */
  onDraft: (id: string, draft: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const yesNo = useYesNo();
  return (
    <>
      {rows.map((row) => {
        const { def } = row;
        const stored = original[def.id];
        const draft = drafts[def.id] ?? draftOf(stored);
        const hint = def.hint || undefined;
        const label = (
          <>
            {def.label}
            <FieldMarkers row={row} />
          </>
        );
        if (row.locked) {
          const clearing = drafts[def.id] === '';
          return (
            <Field key={def.id} label={label} hint={hint}>
              {() => (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <span className={clearing ? 'text-muted-foreground line-through' : undefined}>
                    {formatValue(def, stored, yesNo)}
                  </span>
                  {clearing ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onDraft(def.id, undefined)}>
                      {t('people.fields.keep', 'Keep')}
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost-danger" size="sm" onClick={() => onDraft(def.id, '')}>
                      {t('people.fields.clear', 'Clear')}
                    </Button>
                  )}
                </div>
              )}
            </Field>
          );
        }
        return (
          <Field key={def.id} label={label} hint={hint}>
            {(id) => {
              const set = (v: string) => onDraft(def.id, v);
              switch (def.type) {
                case 'longtext':
                  return <Textarea id={id} value={draft} onChange={(e) => set(e.target.value)} />;
                case 'date':
                  return <Input id={id} type="date" value={draft} onChange={(e) => set(e.target.value)} />;
                case 'number':
                  return <Input id={id} inputMode="decimal" value={draft} onChange={(e) => set(e.target.value)} />;
                case 'boolean':
                  return (
                    <Choice
                      id={id}
                      value={draft || null}
                      onChange={(v) => set(v ?? '')}
                      noneLabel={t('people.fields.notSet', '— not set —')}
                      options={[
                        { value: 'true', label: yesNo.yes },
                        { value: 'false', label: yesNo.no },
                      ]}
                    />
                  );
                case 'select':
                  return (
                    <Choice
                      id={id}
                      value={draft || null}
                      onChange={(v) => set(v ?? '')}
                      noneLabel={t('people.fields.notSet', '— not set —')}
                      options={selectOptions(def, stored).map((o) => ({
                        value: o,
                        label: def.options?.includes(o)
                          ? o
                          : `${o} (${t('people.fields.mark.outOfList', 'not in list')})`,
                      }))}
                    />
                  );
                default:
                  return (
                    <Input
                      id={id}
                      inputMode={
                        def.type === 'phone'
                          ? 'tel'
                          : def.type === 'email'
                            ? 'email'
                            : def.type === 'url'
                              ? 'url'
                              : undefined
                      }
                      value={draft}
                      onChange={(e) => set(e.target.value)}
                    />
                  );
              }
            }}
          </Field>
        );
      })}
    </>
  );
}
