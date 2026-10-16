'use client';

import { createClient } from '@/lib/supabase/client';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { clearPrivateServiceWorkerCaches } from '@/lib/offline/private-caches';
import { teardownDeviceTokenOnSignOut } from '@/lib/utils/push-registration';
import { chReport } from './track';

/** The one request that ends the session and clears the active team (src/app/api/golf/auth/sign-out). */
export const CH_SIGN_OUT_ROUTE = '/api/golf/auth/sign-out';

/**
 * Ends the session and clears the active team in one request, with no re-render of the page it is called from. The
 * active team used to go through a server action, and a server action that writes a cookie re-renders the current
 * page: signing out refreshed the dashboard and the jump to login cut that refresh short (2026-10-14). If the request
 * fails, the browser client signs out instead, so the person is never left signed in. The service worker's cached
 * pages go at the same time (private-caches.ts), so offline the next person on this phone sees none of them.
 */
export async function chEndSession(surface: string): Promise<void> {
  clearAllCachedResources();
  const [ok] = await Promise.all([
    fetch(CH_SIGN_OUT_ROUTE, { method: 'POST', credentials: 'same-origin' })
      .then((r) => r.ok)
      .catch(() => false),
    clearPrivateServiceWorkerCaches(),
  ]);
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

/** How long sign-out waits for this phone's push token to be switched off before it ends the session anyway. */
export const CH_PUSH_TEARDOWN_WAIT_MS = 1500;

/**
 * Sign out, one way everywhere (Settings' Account card and the phone's More sheet): first, while still signed in, this
 * phone stops getting the person's push notifications; then the session ends, and the login page loads.
 *
 * The token is switched off before the session ends, waited for up to 1.5s: started and not waited for, the sign-out
 * could win, the action then refused the signed-out caller and a shared phone kept the last person's pushes (security
 * review, 2026-10-16). The login page loads in place of this one (`location.replace`) and as a full page load, never a
 * client navigation: that is what drops the router's cache, which holds the phone tabs fetched whole ahead
 * (use-prefetch-tabs), so Back cannot return to the signed-out person's pages.
 */
export async function chSignOut(): Promise<void> {
  const teardown = Promise.resolve(teardownDeviceTokenOnSignOut()).catch(() => undefined);
  await Promise.race([teardown, new Promise((done) => window.setTimeout(done, CH_PUSH_TEARDOWN_WAIT_MS))]);
  await chEndSession('settings.session');
  window.location.replace('/golf/login');
}
