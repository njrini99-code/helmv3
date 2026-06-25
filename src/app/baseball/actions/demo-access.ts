'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logLogin } from '@/lib/admin-logger';
import { checkRateLimit, RATE_LIMITS, formatTimeRemaining } from '@/lib/auth/rate-limit';
import { BASEBALL_DEMO_LANDING_PATH } from '@/lib/demo/baseball-config';
import { getBaseballDemoCoachCredentials } from '@/lib/demo/baseball-config.server';

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
 * 2. Rate-limits by IP (the gate is public + signs into a SHARED account).
 * 3. Signs the visitor into the shared demo coach account server-side so the
 *    session cookie is set for this browser.
 * 4. Logs a 'login' admin_event so the visitor is traceable.
 * 5. Redirects to BASEBALL_DEMO_LANDING_PATH?demo=1 on success.
 *
 * The shared account holds many concurrent sessions — that is expected. The
 * seeded demo coach (scripts/seed-baseball-demo.ts) owns a fully-populated
 * program, so the visitor lands on real data, not an empty state.
 *
 * INTENTIONALLY PUBLIC / unauthenticated, and therefore NOT wrapped in
 * `withBaseballAction`: that wrapper throws 401 when there is no auth user, but
 * acquiring a session is the entire purpose of this gate. This mirrors the
 * GolfHelm `enterDemo` exception. The hard "every server action must call
 * supabase.auth.getUser()" rule is suppressed inline at the single sign-in
 * below; abuse is bounded by the per-IP rate limit (RATE_LIMITS.DEMO_GATE).
 */
export async function enterBaseballDemo(
  input: EnterBaseballDemoInput,
): Promise<EnterBaseballDemoResult> {
  // --- 1. Validate input ---------------------------------------------------
  const validationError = validateInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const email = trimmed(input.email).toLowerCase();
  const name = trimmed(input.name);
  const program = trimmed(input.program);

  // --- 2. Read request metadata + rate limit by IP -------------------------
  //    Without this, a single client could hammer signInWithPassword against
  //    the shared account.
  const headersList = await headers();
  const ip =
    headersList.get('x-forwarded-for') ??
    headersList.get('x-real-ip') ??
    'unknown';

  const rateLimit = await checkRateLimit(`baseball-demo:ip:${ip}`, RATE_LIMITS.DEMO_GATE);
  if (!rateLimit.allowed) {
    const remaining = formatTimeRemaining(rateLimit.resetAt - Date.now());
    return {
      success: false,
      error: `Too many demo attempts. Please try again in ${remaining}.`,
    };
  }

  // --- 3. Resolve demo credentials -----------------------------------------
  const creds = getBaseballDemoCoachCredentials();

  // --- 4. Sign visitor into the shared demo account server-side ------------
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

  // --- 5. Mirror into the admin_events feed (best-effort) ------------------
  //    userId is the shared demo account's real uuid; userEmail is the
  //    visitor's email so admins can identify who entered.
  await logLogin(data.user.id, email, {
    source: 'baseball_demo_gate',
    name,
    program,
    ip,
  }).catch(() => {});

  // --- 6. Redirect with ?demo=1 so the client can fire its PostHog event ---
  redirect(`${BASEBALL_DEMO_LANDING_PATH}?demo=1`);
}
