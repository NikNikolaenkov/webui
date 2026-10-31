/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, RefreshCw, Upload } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { peopleApi } from '../api';
import { usePeopleAccess } from '../access';
import { describeError } from '../client';
import {
  csvFileName,
  hasChanges,
  importCells,
  parseCsv,
  spreadsheetIdOf,
  toCsv,
  type ImportPreview,
  type ImportResult,
  type MirrorStatus,
} from '../exchange';
import { shouldLoadHr } from '../model';
import { useMirrors, useRefreshPeople, useSheetsStatus } from '../queries';
import { BODY_CELL, HEADER_CELL, formatDate } from '../styles';
import { Field } from '../components/fields';
import { ErrorNote, Loading, PageHeader, Section } from '../components/parts';

type Source =
  { kind: 'file'; name: string; rows: string[][] } | { kind: 'sheet'; spreadsheetId: string; sheet: string };

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Import / export with the helper's exchange table and the state of the Google Sheets mirrors. Without the Google
 * service account the table travels as a CSV file. Import is always preview → explicit confirmation → apply; the
 * table lives only in this component's state.
 */
export function ExchangePage() {
  const { t } = useTranslation();
  const role = usePeopleAccess((s) => s.role);
  const hrAllowed = shouldLoadHr(role);
  const status = useSheetsStatus();
  const google = Boolean(status.data?.sheetsConfigured);
  const refresh = useRefreshPeople();

  // Export
  const [withHr, setWithHr] = useState(false);
  const [exportLink, setExportLink] = useState('');
  const [exportSheet, setExportSheet] = useState('');
  const [exporting, setExporting] = useState(false);

  // Import
  const [source, setSource] = useState<Source | null>(null);
  const [importLink, setImportLink] = useState('');
  const [importSheet, setImportSheet] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const fail = (title: string, err: unknown) =>
    toast({ variant: 'destructive', title, description: describeError(err, t) });
  const badTarget = () =>
    toast({
      variant: 'destructive',
      title: t('people.exchange.badTarget', 'Give a Google Sheets link and a sheet name'),
    });

  const runExport = async () => {
    const id = exportLink.trim() ? spreadsheetIdOf(exportLink) : null;
    if (exportLink.trim() && (!id || !exportSheet.trim())) return badTarget();
    setExporting(true);
    try {
      const r = await peopleApi.exportSheet({
        hr: hrAllowed && withHr,
        ...(id ? { spreadsheetId: id, sheet: exportSheet.trim() } : {}),
      });
      if (r.written) {
        toast({
          title: t('people.exchange.written', 'Written to the Google sheet'),
          description: t('people.exchange.writtenText', '{{rows}} rows, sheet «{{sheet}}»', r.written),
        });
      } else {
        download(csvFileName(new Date(), r.hr), toCsv([r.headers, ...r.rows]));
      }
    } catch (err) {
      fail(t('people.exchange.exportFailed', 'Export failed'), err);
    } finally {
      setExporting(false);
    }
  };

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPreview(null);
    setResult(null);
    setFileError(null);
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('size');
      const rows = importCells(parseCsv(await file.text()));
      if (rows.length < 2) throw new Error('empty');
      setSource({ kind: 'file', name: file.name, rows });
    } catch {
      setSource(null);
      setFileError(
        t(
          'people.exchange.badFile',
          'Could not read the file: a CSV of the exchange table is expected (up to 5000 rows).',
        ),
      );
    }
  };

  const runPreview = async () => {
    let src: Source | null = source;
    if (importLink.trim()) {
      const id = spreadsheetIdOf(importLink);
      if (!id || !importSheet.trim()) return badTarget();
      src = { kind: 'sheet', spreadsheetId: id, sheet: importSheet.trim() };
      setSource(src);
    }
    if (!src) return;
    setPreviewing(true);
    setResult(null);
    try {
      setPreview(
        await peopleApi.importPreview(
          src.kind === 'file' ? { rows: src.rows } : { spreadsheetId: src.spreadsheetId, sheet: src.sheet },
        ),
      );
    } catch (err) {
      setPreview(null);
      fail(t('people.exchange.previewFailed', 'Preview failed'), err);
    } finally {
      setPreviewing(false);
    }
  };

  const apply = async () => {
    if (!preview || !source) return;
    try {
      const r = await peopleApi.importApply({
        previewId: preview.previewId,
        confirm: true,
        ...(source.kind === 'file' ? { rows: source.rows } : {}),
      });
      setResult(r);
      setPreview(null);
      toast({ title: t('people.exchange.applied', 'Import applied') });
    } catch (err) {
      fail(t('people.exchange.applyFailed', 'Import was not applied'), err);
    } finally {
      void refresh();
    }
  };

  const destructive = Boolean(preview?.items.some((i) => i.kind === 'block' || i.kind === 'delete'));

  return (
    <div className="space-y-3.5">
      <PageHeader
        title={t('people.menu.exchange', 'Import / export')}
        subtitle={
          status.data
            ? google
              ? t('people.exchange.googleOn', 'Google Sheets connected: share sheets with {{email}} as an editor.', {
                  email: status.data.serviceEmail,
                })
              : t(
                  'people.exchange.googleOff',
                  'Google Sheets are not connected yet: export and import work with a CSV file.',
                )
            : undefined
        }
      />
      {status.error && <ErrorNote error={status.error} onRetry={() => void status.refetch()} />}
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        <Section title={t('people.exchange.export', 'Export')}>
          <p className="mb-3 text-sm text-muted-foreground">
            {t(
              'people.exchange.exportText',
              'A row per person: card id, version, unit, manager, contacts, lines, account. Edit it and import it back.',
            )}
          </p>
          <div className="space-y-3">
            {hrAllowed && (
              <div className="flex items-center gap-2">
                <Checkbox id="exchange-hr" checked={withHr} onCheckedChange={(v) => setWithHr(v === true)} />
                <Label htmlFor="exchange-hr">{t('people.exchange.withHr', 'With personal (HR) columns')}</Label>
              </div>
            )}
            {google && (
              <>
                <Field
                  label={t('people.exchange.sheetLink', 'Google sheet (link), optional')}
                  hint={t('people.exchange.overwrite', 'The sheet is overwritten.')}
                >
                  {(id) => <Input id={id} value={exportLink} onChange={(e) => setExportLink(e.target.value)} />}
                </Field>
                <Field label={t('people.exchange.sheetName', 'Sheet')}>
                  {(id) => <Input id={id} value={exportSheet} onChange={(e) => setExportSheet(e.target.value)} />}
                </Field>
              </>
            )}
            <Button onClick={() => void runExport()} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              {t('people.exchange.exportButton', 'Export')}
            </Button>
          </div>
        </Section>

        <Section title={t('people.exchange.import', 'Import')}>
          <p className="mb-3 text-sm text-muted-foreground">
            {t(
              'people.exchange.importText',
              'Review the difference, then confirm. A missing row changes nothing; only «Дія» blocks or deletes. A row’s own «Підрозділ» wins over the manager’s unit; «Вищий підрозділ» only places units the import creates (existing units are not moved).',
            )}
          </p>
          <div className="space-y-3">
            <Field label={t('people.exchange.file', 'CSV file')}>
              {(id) => <Input id={id} type="file" accept=".csv,text/csv" onChange={(e) => void pickFile(e)} />}
            </Field>
            {fileError && (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            )}
            {source?.kind === 'file' && (
              <p className="text-xs text-muted-foreground">
                {t('people.exchange.fileRows', '{{name}}: {{rows}} rows', {
                  name: source.name,
                  rows: source.rows.length - 1,
                })}
              </p>
            )}
            {google && (
              <>
                <Field label={t('people.exchange.orSheet', 'or a Google sheet (link)')}>
                  {(id) => <Input id={id} value={importLink} onChange={(e) => setImportLink(e.target.value)} />}
                </Field>
                <Field label={t('people.exchange.sheetName', 'Sheet')}>
                  {(id) => <Input id={id} value={importSheet} onChange={(e) => setImportSheet(e.target.value)} />}
                </Field>
              </>
            )}
            <Button onClick={() => void runPreview()} disabled={previewing || (!source && !importLink.trim())}>
              {previewing ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {t('people.exchange.importButton', 'Review import')}
            </Button>
          </div>
        </Section>

        <MirrorsSection />
      </div>

      {preview && (
        <PreviewPanel preview={preview} onApply={() => setConfirming(true)} onCancel={() => setPreview(null)} />
      )}
      {result && <ResultPanel result={result} />}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        variant={destructive ? 'destructive' : 'default'}
        title={t('people.exchange.confirmTitle', 'Apply the import?')}
        description={
          preview
            ? t(
                'people.exchange.confirmText',
                'Create {{create}}, change {{update}}, block {{block}}, delete {{delete}}, new units {{createUnit}}. Everything goes to the log under your name.',
                preview.counts,
              )
            : undefined
        }
        confirmLabel={t('people.exchange.apply', 'Apply')}
        onConfirm={apply}
      />
    </div>
  );
}

function PreviewPanel({
  preview,
  onApply,
  onCancel,
}: {
  preview: ImportPreview;
  onApply: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const kind = (k: string) =>
    ({
      create: t('people.exchange.kind.create', 'new person'),
      update: t('people.exchange.kind.update', 'change'),
      block: t('people.exchange.kind.block', 'block'),
      delete: t('people.exchange.kind.delete', 'delete'),
      createUnit: t('people.exchange.kind.createUnit', 'new unit'),
    })[k] ?? k;
  return (
    <Section
      title={t('people.exchange.preview', 'Import preview')}
      actions={
        <>
          <Button size="sm" variant="outline" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" onClick={onApply} disabled={!hasChanges(preview)}>
            {t('people.exchange.apply', 'Apply')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm">
        {t(
          'people.exchange.counts',
          'Rows {{rows}}: new {{create}}, changed {{update}}, block {{block}}, delete {{delete}}, unchanged {{unchanged}}; not in the table (untouched) {{notInSheet}}.',
          preview.counts,
        )}
      </p>
      {preview.warnings.length > 0 && (
        <ul
          className="mb-3 space-y-1 rounded-xl bg-warning-soft p-3 text-sm"
          aria-label={t('people.exchange.warnings', 'Warnings')}
        >
          {preview.warnings.map((w, i) => (
            <li key={i}>
              {w.row ? `${t('people.exchange.row', 'Row')} ${w.row}: ` : ''}
              {w.message}
            </li>
          ))}
        </ul>
      )}
      {preview.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('people.exchange.nothing', 'Nothing to change.')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('people.exchange.preview', 'Import preview')}</caption>
            <thead>
              <tr>
                <th className={HEADER_CELL}>{t('people.exchange.row', 'Row')}</th>
                <th className={HEADER_CELL}>{t('people.exchange.action', 'Action')}</th>
                <th className={HEADER_CELL}>{t('people.field.fullName', 'Full name')}</th>
                <th className={HEADER_CELL}>{t('people.exchange.changes', 'Changes')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.map((it, i) => (
                <tr key={i} className="border-t border-border">
                  <td className={BODY_CELL}>{'row' in it ? it.row : '—'}</td>
                  <td className={BODY_CELL}>
                    <Badge variant={it.kind === 'block' || it.kind === 'delete' ? 'destructive' : 'secondary'}>
                      {kind(it.kind)}
                    </Badge>
                  </td>
                  <td className={BODY_CELL}>{it.kind === 'createUnit' ? it.name : it.fullName}</td>
                  <td className={BODY_CELL}>
                    {it.kind === 'update' &&
                      it.changes.map((ch, j) => (
                        <div key={j}>
                          <span className="text-muted-foreground">{ch.header}:</span> {ch.from || '∅'} → {ch.to || '∅'}
                        </div>
                      ))}
                    {(it.kind === 'create' || it.kind === 'update') && it.lines.length > 0 && (
                      <div>
                        {t('people.exchange.lines', 'Lines')}: {it.lines.join(', ')}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function ResultPanel({ result }: { result: ImportResult }) {
  const { t } = useTranslation();
  return (
    <Section title={t('people.exchange.result', 'Import result')}>
      <p className="text-sm">
        {result.alreadyApplied
          ? t('people.exchange.already', 'This import was already applied; nothing was repeated.')
          : t('people.exchange.resultText', 'Done: {{applied}}, new people {{created}}, errors {{failed}}.', {
              applied: result.applied,
              created: result.created.length,
              failed: result.failed.length,
            })}
      </p>
      {result.failed.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-destructive">
          {result.failed.map((f, i) => (
            <li key={i}>
              {f.row ? `${t('people.exchange.row', 'Row')} ${f.row}: ` : ''}
              {f.message}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function MirrorsSection() {
  const { t } = useTranslation();
  const mirrors = useMirrors();
  const [running, setRunning] = useState(false);
  const run = async () => {
    setRunning(true);
    try {
      await peopleApi.runMirrors();
      await mirrors.refetch();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('people.exchange.mirrorsFailed', 'Mirrors did not run'),
        description: describeError(err, t),
      });
    } finally {
      setRunning(false);
    }
  };
  return (
    <Section
      title={t('people.exchange.mirrors', 'Mirrors')}
      actions={
        mirrors.data && mirrors.data.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => void run()} disabled={running}>
            {running ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            {t('people.exchange.runNow', 'Update now')}
          </Button>
        ) : undefined
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        {t(
          'people.exchange.mirrorsText',
          'The existing sheets, kept up to date: «уволен» instead of deleting rows, no personal fields; manual edits are reported, not overwritten.',
        )}
      </p>
      {mirrors.error && <ErrorNote error={mirrors.error} onRetry={() => void mirrors.refetch()} />}
      {mirrors.isLoading ? (
        <Loading />
      ) : mirrors.data && mirrors.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('people.exchange.noMirrors', 'No mirrors configured yet.')}</p>
      ) : (
        <div className="space-y-3">
          {mirrors.data?.map((m) => (
            <MirrorCard key={m.key} mirror={m} />
          ))}
        </div>
      )}
    </Section>
  );
}

function MirrorCard({ mirror }: { mirror: MirrorStatus }) {
  const { t } = useTranslation();
  const last = mirror.last;
  return (
    <div className="rounded-xl border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{mirror.title}</span>
        {last ? (
          <Badge variant={last.ok ? 'secondary' : 'destructive'}>
            {last.ok ? t('people.exchange.ok', 'ok') : t('people.exchange.error', 'error')}
          </Badge>
        ) : (
          <Badge variant="outline">{t('people.exchange.never', 'not run yet')}</Badge>
        )}
      </div>
      {last && (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(last.at, true)} ·{' '}
            {t(
              'people.exchange.mirrorCounts',
              'cells {{written}}, new rows {{appended}}, «уволен» +{{marked}}/−{{unmarked}}',
              { written: last.written, appended: last.appended, marked: last.marked, unmarked: last.unmarked },
            )}
          </p>
          {last.error && <p className="mt-1 text-destructive">{last.error}</p>}
          {last.notes.map((n, i) => (
            <p key={i} className="mt-1 text-xs text-muted-foreground">
              {n.sheet ? `${n.sheet}${n.row ? `, ${t('people.exchange.row', 'Row')} ${n.row}` : ''}: ` : ''}
              {n.message}
            </p>
          ))}
          {last.manualEdits.length > 0 && (
            <div className="mt-2">
              <p className="font-medium">
                {t('people.exchange.manualEdits', 'Manual edits (not overwritten): {{n}}', {
                  n: last.manualEdits.length,
                })}
              </p>
              <ul className="mt-1 space-y-1">
                {last.manualEdits.map((e, i) => (
                  <li key={i} className="text-xs">
                    {e.sheet}, {t('people.exchange.row', 'Row')} {e.row}, «{e.header}»: {e.sheetValue || '∅'} ·{' '}
                    {t('people.exchange.registry', 'registry')}: {e.registryValue || '∅'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
