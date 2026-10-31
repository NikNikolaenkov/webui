/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { CopyButton } from '@/components/common/CopyButton';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Shows a password the helper returned once. The caller keeps it only in component state and drops it in onClose;
 * it is never written to storage, the query cache or the URL.
 */
export function PasswordDialog({
  password,
  account,
  onClose,
}: {
  password: string | null;
  account: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={password !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" aria-hidden />
            {t('people.password.title', 'New password')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'people.password.once',
              'Shown only once: copy it and pass it to the person. After closing it cannot be seen again.',
            )}
          </DialogDescription>
        </DialogHeader>
        {account && <p className="text-sm text-muted-foreground">{account}</p>}
        <div className="flex items-center gap-2">
          <code
            className="field-surface min-w-0 flex-1 select-all break-all rounded-lg px-3 py-2 font-mono text-sm"
            data-testid="people-password"
          >
            {password}
          </code>
          <CopyButton value={password ?? ''} label={t('people.password.label', 'password')} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t('people.password.done', 'Copied, close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
