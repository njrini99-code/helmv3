'use client';

import { createClient } from '@/lib/supabase/client';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { teardownDeviceTokenOnSignOut } from '@/lib/utils/push-registration';
import { chReport } from './track';

/**
 * Sign out, one way everywhere (Settings' Account card and the phone's More
 * sheet): first, while still signed in, this phone stops getting the person's
 * push notifications (never awaited); then the active team and cached
 * resources are cleared, the session ends, and the login page loads.
 */
export async function chSignOut(): Promise<void> {
  teardownDeviceTokenOnSignOut();
  await clearActiveTeam().catch((err: unknown) => chReport(err, { surface: 'settings.session', action: 'clearActiveTeam', severity: 'low' }));
  clearAllCachedResources();
  await createClient().auth.signOut();
  window.location.href = '/golf/login';
}
