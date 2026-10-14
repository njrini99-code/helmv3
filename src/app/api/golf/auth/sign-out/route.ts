import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_TEAM_COOKIE } from '@/app/golf/actions/team-switcher.constants';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Sign out in one request: the session ends and the active-team cookie goes, and the caller then loads the login page.
 *
 * It replaces a `clearActiveTeam()` server action ahead of a client `auth.signOut()`. A server action that writes a
 * cookie makes Next re-render the page it was called from, so signing out refreshed the dashboard and the jump to
 * /golf/login then cut that refresh short ("TypeError: Load failed"). A route handler sets its cookies on its own
 * response and re-renders nothing (2026-10-14, both roles).
 */

/**
 * Same-origin only: a cross-site page must not be able to sign a person out. The Origin is compared with the host the
 * request was sent to (the Host header, or the proxy's forwarded host), not `nextUrl`, which a dev server or a proxy
 * may name differently (127.0.0.1 vs localhost refused every sign out locally). A browser sends Origin on a POST; an
 * absent one is allowed, an unparseable one ("null", a sandboxed frame) is refused.
 */
export function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: 'Cross-site sign out refused.' }, { status: 403 });
  }

  let signedOut = true;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      signedOut = false;
      await logServerError(`[sign-out] auth.signOut failed: ${describeError(error)}`, { action: 'golf.auth.signOut', featureArea: 'auth' });
      // A global sign out that cannot reach the auth server keeps the session; the local scope makes no network call
      // and always clears the cookies, so the person is never left signed in on this device.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
  } catch (err) {
    signedOut = false;
    await logServerError(`[sign-out] unexpected: ${describeError(err)}`, { action: 'golf.auth.signOut', featureArea: 'auth' });
  }

  const res = NextResponse.json({ success: signedOut }, { status: signedOut ? 200 : 500 });
  res.cookies.delete(ACTIVE_TEAM_COOKIE);
  return res;
}
