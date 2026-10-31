/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, Section } from '../components/parts';

/**
 * Import / export with Google Sheets. The helper has no sheets endpoints yet (they come with the import task), so
 * the buttons are disabled with a note instead of pretending to work.
 */
export function ExchangePage() {
  const { t } = useTranslation();
  const soon = t(
    'people.exchange.soon',
    'Not available yet: the people helper gets the Google Sheets endpoints in the next update.',
  );
  return (
    <div className="space-y-3.5">
      <PageHeader title={t('people.menu.exchange', 'Import / export')} />
      <div className="grid gap-3.5 md:grid-cols-3">
        <Section title={t('people.exchange.export', 'Export')}>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('people.exchange.exportText', 'People, units and lines into a Google Sheet (no personal fields).')}
          </p>
          <Button disabled title={soon}>
            <Download aria-hidden />
            {t('people.exchange.exportButton', 'Export')}
          </Button>
        </Section>
        <Section title={t('people.exchange.import', 'Import')}>
          <p className="mb-3 text-sm text-muted-foreground">
            {t(
              'people.exchange.importText',
              'From a sheet: review the difference, then confirm. A missing row deletes nothing.',
            )}
          </p>
          <Button disabled title={soon}>
            <Upload aria-hidden />
            {t('people.exchange.importButton', 'Review import')}
          </Button>
        </Section>
        <Section title={t('people.exchange.mirrors', 'Mirrors')}>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('people.exchange.mirrorsText', 'The existing sheets kept up to date automatically.')}
          </p>
          <Button variant="outline" disabled title={soon}>
            <RefreshCw aria-hidden />
            {t('people.exchange.mirrorsButton', 'Mirror status')}
          </Button>
        </Section>
      </div>
      <p className="px-1 text-sm text-muted-foreground" role="note">
        {soon}
      </p>
    </div>
  );
}
