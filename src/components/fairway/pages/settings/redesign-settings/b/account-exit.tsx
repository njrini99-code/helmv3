'use client';

/**
 * TEMP redesign direction B (removed before ship) · the end of Account.
 *
 * Sign out and Delete account, last in the Account section. Both handlers are
 * copied from FairwaySettingsGeneral (handleSignOut / confirmDeleteAccount)
 * with the same order of operations: haptic, clearActiveTeam, clear the
 * per-viewer resource cache BEFORE signOut, then /golf/login; and DELETE
 * /api/account/delete behind the same ConfirmAlert. The only additions are
 * presentational: the Sign out button shows a busy state while it works.
 */

import { useState } from 'react';
import { haptic } from '@/lib/haptics';
import { createClient } from '@/lib/supabase/client';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { isNativeApp } from '@/lib/utils/capacitor';
import { logError } from '@/lib/error-logging';
import { Button, fairwayToast } from '@/components/fairway';
import { ConfirmAlert } from '@/components/fairway/overlays/ConfirmAlert';
import { SettingsGroup, SettingsRow } from '@/components/fairway/settings/settings-list';
import { IconLogout } from '@/components/icons';

export function AccountExit({ email }: { email: string }) {
  const [signingOut, setSigningOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      void haptic('checkpoint');
      const supabase = createClient();
      await clearActiveTeam();
      // Cached rails/threads are per-viewer and none may outlive the session
      // (client-resource-cache.ts), so this runs BEFORE signOut, same as the
      // shell's useGolfSignOut.
      clearAllCachedResources();
      await supabase.auth.signOut();
      window.location.href = '/golf/login';
    } catch (err) {
      // Stay busy through the redirect; only a failure hands the button back.
      // Re-thrown so the failure surfaces exactly as it does on the old page.
      setSigningOut(false);
      throw err;
    }
  };

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const response = await fetch('/api/account/delete', { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        void haptic('error');
        fairwayToast.error(payload.error || 'Failed to delete account');
        logError(
          new Error(payload.error || `Failed to delete account (status ${response.status})`),
          { component: 'SettingsDirectionB', action: 'delete-account', sport: 'golf', statusCode: response.status },
          'critical',
        );
        return;
      }
      void haptic('success');
      fairwayToast.success('Account deleted successfully');
      window.location.href = isNativeApp() ? '/golf/login' : '/';
    } catch (err) {
      void haptic('error');
      fairwayToast.error('Failed to delete account');
      logError(
        err instanceof Error ? err : new Error(String(err)),
        { component: 'SettingsDirectionB', action: 'delete-account', sport: 'golf' },
        'critical',
      );
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          label="Signed in as"
          description={email || undefined}
          control={
            <Button
              variant="secondary"
              size="sm"
              busy={signingOut}
              leftIcon={<IconLogout size={16} aria-hidden />}
              onClick={() => void handleSignOut()}
            >
              Sign out
            </Button>
          }
        />
        <SettingsRow
          label="Delete account"
          description="Permanently remove your account and all data."
          control={
            <Button
              variant="danger"
              size="sm"
              busy={deletingAccount}
              onClick={() => {
                void haptic('warning');
                setDeleteConfirmOpen(true);
              }}
            >
              Delete
            </Button>
          }
        />
      </SettingsGroup>

      <ConfirmAlert
        open={deleteConfirmOpen}
        title="Delete account?"
        message="This will permanently delete your account and all associated data. This action cannot be undone."
        confirmLabel="Delete account"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingAccount}
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
}
