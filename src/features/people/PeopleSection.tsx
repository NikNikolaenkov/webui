/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// «Персонал»: every view is CustomComponent/People*[/<id>] (registered in MainContent). The section is shown only
// to helper roles; a direct link without a role gets a notice, and the helper refuses the data anyway.

import { useTranslation } from 'react-i18next';
import { usePeopleAccess } from './access';
import { Notice } from './components/parts';
import { ArchivePage } from './pages/Archive';
import { DiscrepanciesPage } from './pages/Discrepancies';
import { ExchangePage } from './pages/Exchange';
import { LinesPage } from './pages/Lines';
import { OrgPage } from './pages/Org';
import { PeoplePage } from './pages/People';
import { PersonPage } from './pages/Person';

export function PeopleSection({ component }: { component: string }) {
  const { t } = useTranslation();
  const role = usePeopleAccess((s) => s.role);
  const [name, ...rest] = component.split('/');
  const id = rest.length ? decodeURIComponent(rest.join('/')) : null;

  if (!role)
    return <Notice>{t('people.noRole', 'The «Personnel» section is for HR, support and administrators.')}</Notice>;

  switch (name) {
    case 'People':
      return id ? <PersonPage key={id} cardId={id} /> : <PeoplePage />;
    case 'PeopleOrg':
      return <OrgPage />;
    case 'PeopleLines':
      return <LinesPage />;
    case 'PeopleArchive':
      return <ArchivePage />;
    case 'PeopleDiscrepancies':
      return <DiscrepanciesPage />;
    case 'PeopleExchange':
      return <ExchangePage />;
    default:
      return <Notice>{t('errors.unknownComponent', 'Unknown component: {{name}}', { name: component })}</Notice>;
  }
}
