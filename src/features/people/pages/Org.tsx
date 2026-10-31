/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Notice, PageHeader } from '../components/parts';

/** Placeholder: the Bitrix24-style org chart editor replaces this page (uses ../tree.ts for move checks). */
export function OrgPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-3.5">
      <PageHeader title={t('people.menu.org', 'Org chart')} />
      <Notice>
        {t(
          'people.org.soon',
          'The org chart editor is coming next. Units and managers can be changed from a person’s card («Move»).',
        )}
      </Notice>
    </div>
  );
}
