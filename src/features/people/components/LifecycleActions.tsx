/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, KeyRound, RotateCcw, Trash2, Unlock } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { peopleApi } from '../api';
import { lifecycleActions, RETURNS_PASSWORD, type LifecycleAction, type Person } from '../model';
import { useRefreshPeople } from '../queries';
import { formatDate } from '../styles';
import { PasswordDialog } from './PasswordDialog';
import { describeError } from '../client';

const ICONS = { block: Ban, unblock: Unlock, delete: Trash2, restore: RotateCcw, resetPassword: KeyRound };

/** «Заблокувати / Розблокувати / Видалити / Відновити / Скинути пароль», each behind a confirmation. */
export function LifecycleActions({ person }: { person: Person }) {
  const { t } = useTranslation();
  const refresh = useRefreshPeople();
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const account = person.accountEmail;

  const text: Record<LifecycleAction, { label: string; title: string; description: string; confirm: string }> = {
    block: {
      label: t('people.lifecycle.block', 'Block'),
      title: t('people.lifecycle.blockTitle', 'Block {{name}}?', { name: person.fullName }),
      description: t(
        'people.lifecycle.blockText',
        'Sign-in is closed everywhere (password, apps, webmail, API): the password is replaced, app passwords and sessions are revoked. The mailbox stays and mail keeps arriving. Phone lines are released with history.',
      ),
      confirm: t('people.lifecycle.block', 'Block'),
    },
    unblock: {
      label: t('people.lifecycle.unblock', 'Unblock'),
      title: t('people.lifecycle.unblockTitle', 'Unblock {{name}}?', { name: person.fullName }),
      description: t('people.lifecycle.unblockText', 'Sign-in is allowed again with a new password, shown once.'),
      confirm: t('people.lifecycle.unblock', 'Unblock'),
    },
    delete: {
      label: t('people.lifecycle.delete', 'Delete'),
      title: t('people.lifecycle.deleteTitle', 'Delete the account of {{name}}?', { name: person.fullName }),
      description: t(
        'people.lifecycle.deleteText',
        'The account is blocked and the mailbox (mail, calendars, contacts) is archived. After 30 days the account and the mailbox archive are deleted for good; the HR data stays in the archive. Until then it can be restored.',
      ),
      confirm: t('people.lifecycle.delete', 'Delete'),
    },
    restore: {
      label: t('people.lifecycle.restore', 'Restore'),
      title: t('people.lifecycle.restoreTitle', 'Restore {{name}}?', { name: person.fullName }),
      description: t(
        'people.lifecycle.restoreText',
        'The account is unblocked with a new password (shown once) and the deletion is cancelled.',
      ),
      confirm: t('people.lifecycle.restore', 'Restore'),
    },
    resetPassword: {
      label: t('people.lifecycle.resetPassword', 'Reset password'),
      title: t('people.lifecycle.resetTitle', 'Reset the password of {{name}}?', { name: person.fullName }),
      description: t('people.lifecycle.resetText', 'The current password stops working; the new one is shown once.'),
      confirm: t('people.lifecycle.resetPassword', 'Reset password'),
    },
  };

  const run = async (action: LifecycleAction) => {
    try {
      const result = await peopleApi.lifecycle(person.cardId, action);
      if (RETURNS_PASSWORD.has(action) && result.password) setPassword(result.password);
      toast({
        variant: 'success',
        title:
          action === 'delete' && result.purgeAfter
            ? t('people.lifecycle.deleted', 'Deleted; final deletion after {{date}}', {
                date: formatDate(result.purgeAfter),
              })
            : t('people.lifecycle.done', 'Done: {{action}}', { action: text[action].label }),
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: text[action].label,
        description: describeError(err, t),
      });
    } finally {
      void refresh();
    }
  };

  const actions = lifecycleActions(person);
  return (
    <>
      {actions.map((action) => {
        const Icon = ICONS[action];
        const danger = action === 'block' || action === 'delete';
        return (
          <Button key={action} variant={danger ? 'outline' : 'secondary'} size="sm" onClick={() => setPending(action)}>
            <Icon aria-hidden className={danger ? 'text-destructive' : undefined} />
            {text[action].label}
          </Button>
        );
      })}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={text[pending].title}
          description={text[pending].description}
          confirmLabel={text[pending].confirm}
          variant={pending === 'block' || pending === 'delete' ? 'destructive' : 'default'}
          onConfirm={() => run(pending)}
        />
      )}
      <PasswordDialog password={password} account={account} onClose={() => setPassword(null)} />
    </>
  );
}
