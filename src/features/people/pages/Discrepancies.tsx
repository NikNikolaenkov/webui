/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Notice, PageHeader } from '../components/parts';

/** Stub until the reconciliation with external systems (project 3). */
export function DiscrepanciesPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3.5">
      <PageHeader title={t('people.menu.discrepancies', 'Discrepancies')} />
      <Notice>
        {t(
          'people.discrepancies.stub',
          'Will appear together with the reconciliation against Creatio, Bitrix24, Unitalk, Workspace and the other systems.',
        )}
      </Notice>
    </div>
  );
}
