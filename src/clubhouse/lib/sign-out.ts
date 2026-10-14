'use client';

import { createClient } from '@/lib/supabase/client';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { teardownDeviceTokenOnSignOut } from '@/lib/utils/push-registration';
import { chReport } from './track';

/** The one request that ends the session and clears the active team (src/app/api/golf/auth/sign-out). */
export const CH_SIGN_OUT_ROUTE = '/api/golf/auth/sign-out';

/**
 * Ends the session and clears the active team in one request, with no re-render of the page it is called from. The
 * active team used to go through a server action, and a server action that writes a cookie re-renders the current
 * page: signing out refreshed the dashboard and the jump to login cut that refresh short (2026-10-14). If the request
 * fails, the browser client signs out instead, so the person is never left signed in.
 */
export async function chEndSession(surface: string): Promise<void> {
  clearAllCachedResources();
  const ok = await fetch(CH_SIGN_OUT_ROUTE, { method: 'POST', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false);
  if (ok) return;
  chReport(new Error('sign-out route failed'), { surface, action: 'signOutRoute', severity: 'low' });
  // Global first (it revokes the session everywhere); if the auth server is out of reach that keeps the session, so the
  // local scope, which makes no network call, clears this device either way.
  const sb = createClient();
  const error = await sb.auth
    .signOut()
    .then((r) => r?.error ?? null)
    .catch((err: unknown) => err);
  if (error) {
    chReport(error, { surface, action: 'signOutFallback', severity: 'low' });
    await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

/**
 * Sign out, one way everywhere (Settings' Account card and the phone's More sheet): first, while still signed in, this
 * phone stops getting the person's push notifications (never awaited); then the session ends, and the login page loads.
 */
export async function chSignOut(): Promise<void> {
  teardownDeviceTokenOnSignOut();
  await chEndSession('settings.session');
  window.location.href = '/golf/login';
}
