'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLogin } from '@/lib/admin-logger';
import { checkRateLimit, RATE_LIMITS, formatTimeRemaining } from '@/lib/auth/rate-limit';
import { DEMO_LANDING_PATH } from '@/lib/demo/config';
import { getDemoCoachCredentials } from '@/lib/demo/config.server';
import { withAdminObserved } from '@/lib/admin/observed-action';

// posthog capture handled client-side via ?demo=1

// ---------------------------------------------------------------------------
// Input / result types
// ---------------------------------------------------------------------------

export interface EnterDemoInput {
  name: string;
  email: string;
  school: string;
}

export type EnterDemoResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Validation helpers (no external dep — avoids adding zod bundle to this path)
// ---------------------------------------------------------------------------

function trimmed(value: string): string {
  return value.trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput(input: EnterDemoInput): string | null {
  const name = trimmed(input.name);
  const email = trimmed(input.email);
  const school = trimmed(input.school);

  if (!name) return 'Please enter your name.';
  if (name.length > 120) return 'Name must be 120 characters or fewer.';

  if (!email) return 'Please enter your email address.';
  if (!EMAIL_RE.test(email)) return 'Please enter a valid email address.';
  if (email.length > 254) return 'Email address is too long.';

  if (!school) return 'Please enter your school or program.';
  if (school.length > 160) return 'School / Program must be 160 characters or fewer.';

  return null; // valid
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

/**
 * Public demo gate server action.
 *
 * 1. Validates name / email / school.
 * 2. Captures the visitor in `golf_demo_sessions` (fire-and-forget via admin client).
 * 3. Logs a 'login' admin_event titled "Demo entered" (fire-and-forget).
 * 4. Signs the visitor into the shared demo coach account server-side so the
 *    session cookie is set for this browser.
 * 5. Redirects to DEMO_LANDING_PATH?demo=1 on success.
 *
 * The shared account holds many concurrent sessions — that is expected.
 *
 * INTENTIONALLY PUBLIC / unauthenticated. This is the pre-auth demo gate: the
 * visitor has no session yet (acquiring one is the whole point), so the
 * "every server action must call supabase.auth.getUser()" hard rule
 * (helmv3-server-action-missing-auth-check) does not apply here and is
 * suppressed inline at the single DB write below. Abuse is bounded by the
 * per-IP rate limit above (RATE_LIMITS.DEMO_GATE).
 */
async function enterDemoImpl(input: EnterDemoInput): Promise<EnterDemoResult> {
  // --- 1. Validate input ---------------------------------------------------
  const validationError = validateInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const name = trimmed(input.name);
  const email = trimmed(input.email).toLowerCase();
  const school = trimmed(input.school);

  // --- 2. Read request metadata -------------------------------------------
  const headersList = await headers();
  const ip =
    headersList.get('x-forwarded-for') ??
    headersList.get('x-real-ip') ??
    'unknown';
  const userAgent = headersList.get('user-agent') ?? 'unknown';
  const referrer = headersList.get('referer') ?? headersList.get('referrer') ?? '';

  // --- 2b. Rate limit by IP ------------------------------------------------
  //    The gate is public and signs into a shared account, so without this a
  //    single client could flood golf_demo_sessions and hammer signInWithPassword.
  const rateLimit = await checkRateLimit(`demo:ip:${ip}`, RATE_LIMITS.DEMO_GATE);
  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());
    return {
      success: false,
      error: `Too many demo attempts. Please try again in ${remaining}.`,
    };
  }

  // --- 3. Check demo credentials are configured ----------------------------
  const creds = getDemoCoachCredentials();
  if (!creds) {
    return {
      success: false,
      error: 'The demo is not available right now. Please try again later.',
    };
  }

  // --- 4. Capture the visitor in golf_demo_sessions (authoritative "who") ---
  //    Awaited (not detached) so the write isn't dropped when the serverless
  //    function unwinds on redirect. Resilient: a tracking failure (e.g. the
  //    table not yet migrated) must never block demo entry.
  try {
    const adminDb = createAdminClient();
    // `golf_demo_sessions` isn't in the generated Database type until the
    // migration + `npm run db:types` land; cast through unknown until then.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyAdmin = adminDb as unknown as { from: (table: string) => any };
    // nosemgrep: helmv3-server-action-missing-auth-check -- public demo gate; see JSDoc above.
    await anyAdmin.from('golf_demo_sessions').insert({ // nosemgrep: helmv3-action-missing-revalidate -- redirect-terminated demo flow
      name,
      email,
      school,
      ip,
      user_agent: userAgent,
      referrer,
      metadata: {},
    });
  } catch {
    // Never block entry on a tracking failure.
  }

  // --- 5. Sign visitor into the shared demo account server-side ------------
  const supabase = await createClient();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });

  if (signInError || !data.session || !data.user) {
    return {
      success: false,
      error:
        'Unable to start the demo session. Please try again or contact support.',
    };
  }

  // --- 5b. Stamp the session as a demo session ------------------------------
  //    `user_metadata.is_demo` is readable by BOTH client and server code
  //    (unlike the demo email, which stays a server-only secret) — the shared
  //    idle-timeout flow (middleware + useSessionActivity) reads it to route
  //    an expired demo session back to /golf/demo instead of the password
  //    login (#918). Best-effort: a failure here must never block entry.
  try {
    await supabase.auth.updateUser({ data: { is_demo: true } });
  } catch {
    // Worst case the session_expired redirect falls back to /golf/login.
  }

  // --- 6. Mirror into the admin_events feed --------------------------------
  //    userId is the shared demo account's real uuid; userEmail is the
  //    visitor's email so admins can identify them. The golf_demo_sessions
  //    row above remains the source of truth. Best-effort.
  await logLogin(data.user.id, email, {
    source: 'demo_gate',
    name,
    school,
    ip,
  }).catch(() => {});

  // --- 7. Redirect with ?demo=1 so the client fires the PostHog event ------
  redirect(`${DEMO_LANDING_PATH}?demo=1`);
}

// enterDemo's redirect() throws a NEXT_REDIRECT digest, which
// isNextControlFlowError (observed-action.ts:10-15) already skips from
// logging while still rethrowing — confirmed safe to wrap (W15 plan Batch 5
// note).
const observedEnterDemo = withAdminObserved(
  'enterDemo',
  { sport: 'golf', feature: 'auth_onboarding' },
  enterDemoImpl,
);

export async function enterDemo(input: EnterDemoInput): Promise<EnterDemoResult> {
  return observedEnterDemo(input);
}
