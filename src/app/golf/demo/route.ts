/**
 * Shared demo auto-login link — GET /golf/demo[?ref=<who>]
 *
 * One reusable link emailed to prospective coaches. Hitting it server-side
 * signs the shared demo coach in (credentials live ONLY in server env) and
 * redirects straight to the dashboard — no password typing. Reusable by
 * unlimited people, no expiry (unlike a single-use magic link).
 *
 * SECURITY: this endpoint can ONLY ever authenticate the demo account. The
 * email is fixed server-side (DEMO_ACCOUNT_EMAIL) and the password comes from
 * DEMO_COACH_PASSWORD — the request cannot specify a different account, so it
 * can never be coerced into logging anyone in as a real user. If the password
 * env is missing or sign-in fails, it falls back to the normal login page.
 *
 * TRACING: each emailed link should carry a per-prospect ?ref=<slug> so the
 * admin_events login row records who clicked. Capture is fire-and-forget.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logLogin } from '@/lib/admin-logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_ACCOUNT_EMAIL =
  (process.env.DEMO_ACCOUNT_EMAIL ?? 'demo@golfhelmdemo.com').toLowerCase().trim();

/** Sanitize a demo ref param: trim, cap at 80 chars, strip control characters. */
function sanitizeRef(raw: string | null): string | undefined {
  if (!raw) return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 80);
  return cleaned || undefined;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const ref = sanitizeRef(url.searchParams.get('ref'));
  const dashboard = new URL('/golf/dashboard', url.origin);
  const loginFallback = new URL('/golf/login', url.origin);

  const password = process.env.DEMO_COACH_PASSWORD;
  if (!password) {
    // Misconfigured (no server-side demo password) — degrade to normal login.
    return NextResponse.redirect(loginFallback);
  }

  // Server cookie client — signInWithPassword writes the session cookies, which
  // Next.js attaches to the redirect response.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: DEMO_ACCOUNT_EMAIL,
    password,
  });

  if (error || !data?.user) {
    return NextResponse.redirect(loginFallback);
  }

  // Fire-and-forget tracing — never block the redirect on logging.
  const ip =
    req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  const country = req.headers.get('x-vercel-ip-country') ?? undefined;
  const city = req.headers.get('x-vercel-ip-city') ?? undefined;
  logLogin(data.user.id, DEMO_ACCOUNT_EMAIL, {
    ip,
    userAgent,
    ref,
    country,
    city,
    is_demo: true,
    via: 'auto_link',
  }).catch(() => {});

  return NextResponse.redirect(dashboard);
}
