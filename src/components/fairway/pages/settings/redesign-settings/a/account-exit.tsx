'use client';

/**
 * Direction A · sign out and delete account.
 *
 * Copied from FairwaySettingsGeneral (handleSignOut / confirmDeleteAccount),
 * same order and same endpoints: clearActiveTeam, then clearAllCachedResources
 * BEFORE auth.signOut (a shared-device sign-out must not leave cached threads
 * behind; see client-resource-cache.ts), then a hard redirect. Delete calls
 * DELETE /api/account/delete and shows the server's own error text, which is
 * how a coach learns about the 409 "reassign recorded data first" block.
 *
 * Added on top of the original: sign-out reports a failure instead of
 * failing silently, and both actions expose a busy state to their row.
 */

import { useState } from 'react';
import { haptic } from '@/lib/haptics';
import { createClient } from '@/lib/supabase/client';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { logError } from '@/lib/error-logging';
import { isNativeApp } from '@/lib/utils/capacitor';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { ConfirmAlert } from '@/components/fairway/overlays/ConfirmAlert';

export interface AccountExit {
  signingOut: boolean;
  deletingAccount: boolean;
  signOut: () => void;
  requestDelete: () => void;
  confirm: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  };
}

export function useAccountExit(): AccountExit {
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    haptic('checkpoint');
    try {
      const supabase = createClient();
      await clearActiveTeam();
      clearAllCachedResources();
      await supabase.auth.signOut();
      window.location.href = '/golf/login';
    } catch (err) {
      setSigningOut(false);
      fairwayToast.error('Couldn’t sign out. Try again.');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'SettingsDirectionA', action: 'sign-out', sport: 'golf' },
        'high',
      );
    }
  };

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const response = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        haptic('error');
        fairwayToast.error(payload.error || 'Failed to delete account');
        logError(
          new Error(payload.error || `Failed to delete account (status ${response.status})`),
          { component: 'SettingsDirectionA', action: 'delete-account', sport: 'golf', statusCode: response.status },
          'critical',
        );
        return;
      }
      haptic('success');
      fairwayToast.success('Account deleted successfully');
      window.location.href = isNativeApp() ? '/golf/login' : '/';
    } catch (err) {
      haptic('error');
      fairwayToast.error('Failed to delete account');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'SettingsDirectionA', action: 'delete-account', sport: 'golf' },
        'critical',
      );
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmOpen(false);
    }
  };

  return {
    signingOut,
    deletingAccount,
    signOut: () => void handleSignOut(),
    requestDelete: () => {
      haptic('warning');
      setDeleteConfirmOpen(true);
    },
    confirm: {
      open: deleteConfirmOpen,
      onConfirm: () => void confirmDeleteAccount(),
      onCancel: () => setDeleteConfirmOpen(false),
    },
  };
}

export function DeleteAccountConfirm({ exit }: { exit: AccountExit }) {
  return (
    <ConfirmAlert
      open={exit.confirm.open}
      title="Delete account?"
      message="This permanently deletes your account and the data tied to it, and can’t be undone. If your account has recorded team data, an admin may need to reassign it first. You’ll see a message if so."
      confirmLabel="Delete account"
      cancelLabel="Cancel"
      variant="danger"
      isLoading={exit.deletingAccount}
      onConfirm={exit.confirm.onConfirm}
      onCancel={exit.confirm.onCancel}
    />
  );
}
