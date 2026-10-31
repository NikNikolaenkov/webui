/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: (id: string) => ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const NONE = '__none__';

/** A select over `options`; `noneLabel` adds an empty choice (value null). */
export function Choice({
  id,
  value,
  onChange,
  options,
  noneLabel,
  placeholder,
  variant,
  ariaLabel,
  disabled,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  noneLabel?: string;
  placeholder?: string;
  variant?: 'field' | 'pill';
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    // Always controlled: '' shows the placeholder (Radix), NONE the explicit empty choice.
    <Select
      value={value ?? (noneLabel ? NONE : '')}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} variant={variant} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Editable rows of a few text columns (emails, phones, systems…). */
export function Rows<K extends string>({
  label,
  rows,
  columns,
  onChange,
}: {
  label: string;
  rows: Record<K, string>[];
  columns: { key: K; placeholder: string; type?: string }[];
  onChange: (rows: Record<K, string>[]) => void;
}) {
  const { t } = useTranslation();
  const empty = () => Object.fromEntries(columns.map((c) => [c.key, ''])) as Record<K, string>;
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {columns.map((c) => (
            <Input
              key={c.key}
              type={c.type}
              value={row[c.key]}
              placeholder={c.placeholder}
              aria-label={`${label}: ${c.placeholder}`}
              onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, [c.key]: e.target.value } : r)))}
            />
          ))}
          <Button
            type="button"
            variant="ghost-danger"
            size="icon-sm"
            aria-label={t('people.form.removeRow', 'Remove')}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...rows, empty()])}>
        <Plus aria-hidden />
        {t('people.form.addRow', 'Add')}
      </Button>
    </fieldset>
  );
}
