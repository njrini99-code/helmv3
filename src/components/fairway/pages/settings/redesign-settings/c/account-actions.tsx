'use client';

/**
 * TEMP redesign direction C (removed before ship) — what sits below the Setup
 * card: help & legal, reporting a problem, sign out and account deletion.
 *
 * Sign-out and delete are copied from FairwaySettingsGeneral.tsx:448-491 and
 * must stay behaviour-identical to it: clearActiveTeam → clearAllCachedResources
 * → signOut (src/lib/golf/__tests__/golf-signout-clears-cache.test.ts), and the
 * same DELETE /api/account/delete, toasts, logging and redirects.
 */

import { useState } from 'react';
import Link from 'next/link';
import { haptic } from '@/lib/haptics';
import { createClient } from '@/lib/supabase/client';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { logError } from '@/lib/error-logging';
import { isNativeApp } from '@/lib/utils/capacitor';
import { Button, ConfirmAlert, ReportProblemButton, fairwayToast } from '@/components/fairway';
import { SettingsGroup, SettingsLinkRow, SettingsRow } from '@/components/fairway/settings/settings-list';
import { IconLogout } from '@/components/icons';

export function AccountActions() {
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleSignOut = async () => {
    void haptic('checkpoint');
    const supabase = createClient();
    await clearActiveTeam();
    // Cached rails/threads are per-viewer and none may outlive the session —
    // see client-resource-cache.ts. Must run BEFORE signOut.
    clearAllCachedResources();
    await supabase.auth.signOut();
    window.location.href = '/golf/login';
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
          { component: 'SettingsDirectionC', action: 'delete-account', sport: 'golf', statusCode: response.status },
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
        { component: 'SettingsDirectionC', action: 'delete-account', sport: 'golf' },
        'critical',
      );
    } finally {
      setDeletingAccount(false);
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup title="Help & legal">
        <SettingsLinkRow as={Link} href="/privacy" label="Privacy Policy" />
        <SettingsLinkRow as={Link} href="/terms" label="Terms of Service" />
        <SettingsRow label="Support" control={<ReportProblemButton size="sm" />} />
      </SettingsGroup>

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<IconLogout size={16} aria-hidden />}
          onClick={() => void handleSignOut()}
        >
          Sign out
        </Button>
        <Button
          variant="ghost"
          fullWidth
          busy={deletingAccount}
          className="text-fw-danger-ink"
          onClick={() => {
            void haptic('warning');
            setDeleteConfirmOpen(true);
          }}
        >
          Delete account
        </Button>
      </div>

      <ConfirmAlert
        open={deleteConfirmOpen}
        title="Delete account?"
        message="This will permanently delete your account and all associated data. This action cannot be undone."
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingAccount}
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
