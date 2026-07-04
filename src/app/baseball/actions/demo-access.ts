'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLogin } from '@/lib/admin-logger';
import { checkRateLimit, RATE_LIMITS, formatTimeRemaining } from '@/lib/auth/rate-limit';
import { BASEBALL_DEMO_LANDING_PATH } from '@/lib/demo/baseball-config';
import {
  getBaseballDemoCoachCredentials,
  isBaseballDemoEnabled,
  isCurrentSessionBaseballDemo,
} from '@/lib/demo/baseball-config.server';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ---------------------------------------------------------------------------
// Input / result types
// ---------------------------------------------------------------------------

export interface EnterBaseballDemoInput {
  name: string;
  email: string;
  program: string;
}

export type EnterBaseballDemoResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Validation helpers (no external dep — keeps the pre-auth path bundle small)
// ---------------------------------------------------------------------------

function trimmed(value: string): string {
  return value.trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateInput(input: EnterBaseballDemoInput): string | null {
  const name = trimmed(input.name);
  const email = trimmed(input.email);
  const program = trimmed(input.program);

  if (!name) return 'Please enter your name.';
  if (name.length > 120) return 'Name must be 120 characters or fewer.';

  if (!email) return 'Please enter your email address.';
  if (!EMAIL_RE.test(email)) return 'Please enter a valid email address.';
  if (email.length > 254) return 'Email address is too long.';

  if (!program) return 'Please enter your program or organization.';
  if (program.length > 160) return 'Program must be 160 characters or fewer.';

  return null; // valid
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

/**
 * Public BaseballHelm demo gate server action.
 *
 * 1. Validates name / email / program.
 * 2. Honors the `BASEBALL_DEMO_ENABLED` kill-switch (instant prod disable).
 * 3. Rate-limits by IP (the gate is public + signs into a SHARED account).
 * 4. Captures the visitor in `baseball_demo_sessions` (fire-and-forget via the
 *    admin client — a tracking failure must never block demo entry).
 * 5. Signs the visitor into the shared demo coach account server-side so the
 *    session cookie is set for this browser.
 * 6. Logs a 'login' admin_event so the visitor is traceable.
 * 7. Redirects to BASEBALL_DEMO_LANDING_PATH?demo=1 on success.
 *
 * The shared account holds many concurrent sessions — that is expected, and is
 * the very reason every OTHER baseball server action runs through
 * `withBaseballAction`'s demo read-only guard: this account can never mutate
 * state another visitor would see (see src/lib/baseball/with-baseball-action.ts).
 * The seeded demo coach (scripts/seed-baseball-demo.ts) owns a fully-populated
 * program, so the visitor lands on real data, not an empty state.
 *
 * INTENTIONALLY PUBLIC / unauthenticated, and therefore NOT wrapped in
 * `withBaseballAction`: that wrapper throws 401 when there is no auth user, but
 * acquiring a session is the entire purpose of this gate. This mirrors the
 * GolfHelm `enterDemo` exception. The hard "every server action must call
 * supabase.auth.getUser()" rule is suppressed inline at the single sign-in
 * below; abuse is bounded by the per-IP rate limit (RATE_LIMITS.DEMO_GATE) and
 * by the `BASEBALL_DEMO_ENABLED` kill-switch for incident response.
 */
async function enterBaseballDemoImpl(
  input: EnterBaseballDemoInput,
): Promise<EnterBaseballDemoResult> {
  // --- 1. Validate input ---------------------------------------------------
  const validationError = validateInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // --- 2. Kill-switch --------------------------------------------------------
  if (!isBaseballDemoEnabled()) {
    return {
      success: false,
      error: 'The demo is not available right now. Please check back later.',
    };
  }

  const email = trimmed(input.email).toLowerCase();
  const name = trimmed(input.name);
  const program = trimmed(input.program);

  // --- 3. Read request metadata + rate limit by IP -------------------------
  //    Without this, a single client could hammer signInWithPassword against
  //    the shared account.
  const headersList = await headers();
  const ip =
    headersList.get('x-forwarded-for') ??
    headersList.get('x-real-ip') ??
    'unknown';
  const userAgent = headersList.get('user-agent') ?? 'unknown';
  const referrer = headersList.get('referer') ?? headersList.get('referrer') ?? '';

  const rateLimit = await checkRateLimit(`baseball-demo:ip:${ip}`, RATE_LIMITS.DEMO_GATE);
  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());
    return {
      success: false,
      error: `Too many demo attempts. Please try again in ${remaining}.`,
    };
  }

  // --- 4. Resolve demo credentials -----------------------------------------
  const creds = getBaseballDemoCoachCredentials();

  // --- 5. Capture the visitor in baseball_demo_sessions (authoritative "who") ---
  //    Awaited (not detached) so the write isn't dropped when the serverless
  //    function unwinds on redirect. Resilient: a tracking failure (e.g. the
  //    table not yet migrated) must never block demo entry.
  try {
    const adminDb = createAdminClient();
    // `baseball_demo_sessions` isn't in the generated Database type until
    // `npm run db:types` is re-run against the new migration; cast through
    // unknown until then (mirrors src/app/golf/actions/demo-access.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyAdmin = adminDb as unknown as { from: (table: string) => any };
    // nosemgrep: helmv3-server-action-missing-auth-check -- public demo gate; see JSDoc above.
    await anyAdmin.from('baseball_demo_sessions').insert({ // nosemgrep: helmv3-action-missing-revalidate -- redirect-terminated demo flow
      name,
      email,
      program,
      ip,
      user_agent: userAgent,
      referrer,
      metadata: {},
    });
  } catch {
    // Never block entry on a tracking failure.
  }

  // --- 6. Sign visitor into the shared demo account server-side ------------
  const supabase = await createClient();
  // nosemgrep: helmv3-server-action-missing-auth-check -- public demo gate; see JSDoc above.
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });

  if (signInError || !data.session || !data.user) {
    return {
      success: false,
      error:
        'The demo is not available right now. Please try again later or contact support.',
    };
  }

  // --- 7. Mirror into the admin_events feed (best-effort) ------------------
  //    userId is the shared demo account's real uuid; userEmail is the
  //    visitor's email so admins can identify who entered. The
  //    baseball_demo_sessions row above remains the source of truth.
  await logLogin(data.user.id, email, {
    source: 'baseball_demo_gate',
    name,
    program,
    ip,
  }).catch(() => {});

  // --- 8. Redirect with ?demo=1 so the client can fire its PostHog event ---
  redirect(`${BASEBALL_DEMO_LANDING_PATH}?demo=1`);
}

const observedEnterBaseballDemo = withAdminObserved(
  'enterBaseballDemo',
  { sport: 'baseball', feature: 'auth_onboarding' },
  enterBaseballDemoImpl,
);

export async function enterBaseballDemo(
  input: EnterBaseballDemoInput,
): Promise<EnterBaseballDemoResult> {
  return observedEnterBaseballDemo(input);
}

// ---------------------------------------------------------------------------
// Already-signed-in shortcut verification
// ---------------------------------------------------------------------------

/**
 * Server-verified check for the demo gate's "already signed in" shortcut.
 *
 * The gate page previously treated ANY signed-in visitor (bare client-side
 * `getUser()` truthiness) as eligible to "Continue to dashboard" — that is
 * wrong for a real coach/player who happens to already have a BaseballHelm
 * session open in the same browser; they should see the normal gate form, not
 * a demo shortcut. This resolves the session SERVER-SIDE against the actual
 * Baseball demo coach identity (via isCurrentSessionBaseballDemo) without ever
 * exposing the secret demo email to the client.
 *
 * INTENTIONALLY PUBLIC / unauthenticated for the same reason as
 * `enterBaseballDemo` above: the gate page calls this before the visitor has
 * any session, and `withBaseballAction` would 401 a not-yet-signed-in visitor.
 * It performs no DB write, so it carries no read-only-guard risk.
 */
export async function isBaseballDemoSession(): Promise<{ isDemo: boolean }> {
  // nosemgrep: helmv3-server-action-missing-auth-check -- read-only session check for the public demo gate; see JSDoc above.
  const isDemo = await isCurrentSessionBaseballDemo();
  return { isDemo };
}

/**
 * Public read of the `BASEBALL_DEMO_ENABLED` kill-switch, so the gate page can
 * surface a "demo unavailable" state up front instead of only after a visitor
 * fills out the form and submits. INTENTIONALLY PUBLIC for the same reason as
 * `enterBaseballDemo`; reads an env flag only, no DB access.
 */
export async function isBaseballDemoAvailable(): Promise<{ enabled: boolean }> {
  // nosemgrep: helmv3-server-action-missing-auth-check -- read-only env flag for the public demo gate; see JSDoc above.
  return { enabled: isBaseballDemoEnabled() };
}
