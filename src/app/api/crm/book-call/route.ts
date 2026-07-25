/**
 * Tracked redirect for the founder's booking page.
 *
 * The in-demo pricing toast used to link straight at the Google Calendar
 * appointment page, so the single highest-intent action a prospect can take
 * — asking for a call — produced ZERO database rows. Google Calendar
 * appointment pages have no webhook and no callback, so if we don't sit in
 * front of the click there is nothing to reconstruct afterwards: every
 * booking since that link shipped is unattributable.
 *
 * This route is that seat. It records the click, then 302s to the calendar.
 * Three properties matter more than anything else here.
 *
 * 1. THE DESTINATION IS A CONSTANT. There is no `?url=`, no `?to=`, no
 *    encoded payload — nothing a caller supplies can influence where the
 *    browser lands. The only caller input is an opaque campaign token,
 *    validated against a character allowlist and then written to jsonb and
 *    nowhere else. A tracked redirect that accepts a destination is an open
 *    redirect, and an open redirect on our own domain is a phishing
 *    primitive aimed at exactly the audience we cold-email.
 *
 * 2. THE REDIRECT NEVER DEPENDS ON THE LOGGING. Tracking runs inside a
 *    try/catch whose only job is to make sure a failed insert costs us a
 *    row and not a customer. Trading the booking for the log entry would be
 *    a strictly worse version of the bug this route fixes.
 *
 * 3. THE CLICK IS CLASSIFIED, NOT COUNTED. 93% of recorded link clicks in
 *    this CRM (1,133 of 1,218) fired within two minutes of delivery —
 *    corporate mail-security scanners walking every URL in our outreach,
 *    spoofing genuine Chrome user-agent strings while they do it. Raw click
 *    counts from this endpoint would be as misleading as the ones we
 *    already have, so every row carries a verdict from
 *    `classifyEngagement()`. See `referenceAt` below for why this
 *    particular surface honestly reports 'unknown' instead of manufacturing
 *    a verdict it cannot support.
 *
 * WHY `admin_events` AND NOT `crm_contact_log`
 * `crm_contact_log.coach_id` is NOT NULL and its `contact_type` is a
 * postgres enum (email | call | demo | meeting | note). This click arrives
 * from an anonymous visitor inside the shared demo account, so a coach id
 * usually cannot be resolved at all and those rows simply could not be
 * written; widening the enum would need a migration another agent owns.
 * Semantically it is also the wrong table — `crm_contact_log` records
 * touches WE made (it carries `created_by`, and `email_events` joins back
 * to it), whereas this is inbound. `admin_events` is the general
 * server-side event feed (src/lib/admin-logger.ts): `event_type` is free
 * text, `metadata` is jsonb, and the demo gate already mirrors into it via
 * `logLogin`. No schema change needed.
 *
 * The insert is open-coded rather than routed through admin-logger because
 * `logAdminEvent()` there is module-private and every exported wrapper is
 * shaped for a different event kind (signup / login / round / AI /
 * security). The persistence gate and the `runtimeEnv` metadata tag are
 * copied from it verbatim so this row behaves like every other
 * `admin_events` writer.
 *
 * INTENTIONALLY PUBLIC. This is a link destination — the visitor may or may
 * not hold a session, and requiring one would break the click for anyone we
 * ever put this URL in front of. Nothing is read from or written on behalf
 * of the caller; the only write is an append-only telemetry row, budgeted
 * per-IP below.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { classifyEngagement } from '@/lib/crm/engagement-quality';
import { logServerError, logServerException } from '@/lib/server-error-logger';
import { getRuntimeEnv, shouldPersistAdminTables } from '@/lib/telemetry-gate';
import type { Json } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The founder's booking page — the only URL this route will ever emit, and
 * now the single source of truth for it. It lives server-side deliberately:
 * DemoPricingNudge.tsx points at this route rather than at Google, so the
 * destination can move without a client rebuild and can never be swapped by
 * whoever holds the link.
 */
const DEMO_PRICING_CALL_URL = 'https://calendar.app.google/s9DBb3bKD2teLLBT7';

const ROUTE_PATH = '/api/crm/book-call';

/**
 * Opaque campaign token: a short lowercase slug, recorded verbatim and used
 * for nothing else. Anything that fails this pattern is dropped and the
 * rejection is recorded, so a malformed link shows up as a data problem
 * rather than as a missing click.
 */
const SOURCE_TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * Logging-only budget, per IP. Far looser than the demo gate's 10/5min
 * because campus NAT puts a whole athletics department behind one address;
 * it exists to stop a script flooding the prod event feed, not to stop a
 * person. Exceeding it drops the ROW — never the redirect.
 */
const CLICK_LOG_RATE_LIMIT = { maxAttempts: 30, windowMs: 5 * 60 * 1000 } as const;

/**
 * How far back to look for the `golf_demo_sessions` row that most likely
 * belongs to this browser. A demo tour runs minutes, so 12h is generous on
 * purpose: a coach who tours in the morning and books after lunch is still
 * the same buying signal, and over-matching here costs a label we already
 * mark as a guess.
 */
const VISITOR_HINT_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const MAX_REQUEST_METADATA_LENGTH = 1000;

/**
 * Best-effort identity for the click, resolved by matching the visitor's IP
 * against recent demo-gate entries. Explicitly a HINT: campus NAT means two
 * coaches at one school share an address, so this can name the wrong
 * person. It is never written to a column that reads as verified identity
 * (`admin_events.user_email` stays null) and the message text says
 * "likely".
 */
interface VisitorHint {
  demoSessionId: string;
  name: string;
  email: string;
  school: string | null;
  enteredAt: string;
  /** Observational only — deliberately NOT fed to classifyEngagement(). */
  msSinceDemoEntry: number;
}

function capped(value: string | null, max = MAX_REQUEST_METADATA_LENGTH): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** First hop of the x-forwarded-for chain is the client; the rest are proxies. */
function readClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return capped(first, 100);
  return capped(request.headers.get('x-real-ip'), 100);
}

function readSourceToken(url: URL): { token: string | null; rejected: boolean } {
  const raw = url.searchParams.get('src');
  if (!raw) return { token: null, rejected: false };
  if (!SOURCE_TOKEN_RE.test(raw)) return { token: null, rejected: true };
  return { token: raw, rejected: false };
}

async function resolveVisitorHint(
  admin: ReturnType<typeof createAdminClient>,
  ip: string | null,
  occurredAt: Date,
): Promise<VisitorHint | null> {
  if (!ip) return null;

  const since = new Date(occurredAt.getTime() - VISITOR_HINT_LOOKBACK_MS).toISOString();
  const { data, error } = await admin
    .from('golf_demo_sessions')
    .select('id, name, email, school, entered_at')
    .eq('ip', ip)
    .gte('entered_at', since)
    .lte('entered_at', occurredAt.toISOString())
    .order('entered_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Surfaced, not swallowed — but a failed hint must not cost us the click
    // row itself, so this returns null and the caller carries on.
    await logServerError(`book-call visitor hint lookup failed: ${error.message}`, {
      action: 'crm.book-call.visitor-hint',
      source: 'route_handler',
      route: ROUTE_PATH,
      errorCode: error.code,
    }, 'warning');
    return null;
  }
  if (!data) return null;

  return {
    demoSessionId: data.id,
    name: data.name,
    email: data.email,
    school: data.school,
    enteredAt: data.entered_at,
    msSinceDemoEntry: occurredAt.getTime() - new Date(data.entered_at).getTime(),
  };
}

async function recordBookingClick(request: Request, occurredAt: Date): Promise<void> {
  // Same gate as admin-logger.ts: off-prod runtimes hold prod Supabase creds
  // and would otherwise pollute the live feed. Unlike the ops-alert gate on
  // the demo-request form — a bare `VERCEL_ENV === 'production'` with no way
  // out — this one has documented escape hatches, so capturing preview
  // bookings is a config flip (ADMIN_EVENTS_CAPTURE_PREVIEW=1) rather than a
  // code change.
  if (!shouldPersistAdminTables()) return;

  const url = new URL(request.url);
  const ip = readClientIp(request);
  const userAgent = capped(request.headers.get('user-agent'));
  const referrer = capped(
    request.headers.get('referer') ?? request.headers.get('referrer'),
  );
  const { token: srcToken, rejected: srcRejected } = readSourceToken(url);

  const rate = await checkRateLimit(`crm:book-call:${ip ?? 'unknown'}`, CLICK_LOG_RATE_LIMIT);
  if (!rate.allowed) return;

  /**
   * `referenceAt` is null on purpose, and this is the one decision in the
   * file worth arguing with.
   *
   * classifyEngagement() measures latency against the delivery/send event
   * that CAUSED the click, and this surface genuinely has none: the pricing
   * toast is painted by client JS inside an already-authenticated demo
   * session, so there is no `emails.delivered_at` row to measure from. The
   * tempting substitute is the visitor's `golf_demo_sessions.entered_at`
   * resolved below — and it is a trap. DemoPricingNudge arms the toast 30
   * seconds after entry (DEMO_PRICING_NUDGE_DELAY_MS), which sits INSIDE the
   * 2-minute prefetch band, so a genuine coach who clicks promptly would be
   * stamped 'automated'. The module's contract is explicit that a wrong
   * reference produces a confident wrong answer and that null is the correct
   * answer when you don't have one. So we pass null.
   *
   * That leaves the user-agent check as the only discriminator that can fire
   * here, and it only ever downgrades: a client that announces itself as a
   * machine (curl, headless runners, the security-vendor proxies) comes back
   * 'automated', everything else comes back 'unknown'. `msSinceDemoEntry` is
   * recorded raw next to the verdict so a later batch pass —
   * detectUserAgentIpFanOut(), which needs many events at once and cannot run
   * per-request — can revisit these rows with the fleet-level evidence a
   * single request does not have.
   */
  const classification = classifyEngagement({
    occurredAt,
    referenceAt: null,
    userAgent,
    ip,
  });

  const admin = createAdminClient();
  const hint = await resolveVisitorHint(admin, ip, occurredAt);

  const metadata = {
    runtimeEnv: getRuntimeEnv(),
    destination: DEMO_PRICING_CALL_URL,
    srcToken,
    srcRejected,
    referrer,
    ip,
    userAgent,
    trafficQuality: classification.verdict,
    qualityReason: classification.reason,
    qualityConfidence: classification.confidence,
    // Plain-serializable by design, so the full verdict survives verbatim.
    classification,
    visitorHint: hint,
    visitorHintBasis: hint ? 'ip-window-match' : null,
  };

  const { error } = await admin.from('admin_events').insert({
    event_type: 'feature_use',
    severity: 'info',
    title: 'Demo pricing call link clicked',
    message: hint
      ? `Booking page opened — likely ${hint.name} (${hint.email}${hint.school ? `, ${hint.school}` : ''})`
      : 'Booking page opened by an unidentified visitor',
    // `user_email` stays null on purpose: everywhere else in admin_events it
    // carries an identity the request itself asserted, and an IP-window guess
    // must not masquerade as one. The hint lives in metadata and in `message`.
    // Store the stable route, not attacker-controlled query text. The only
    // accepted attribution token already lives in typed metadata above.
    url: ROUTE_PATH,
    metadata: metadata as unknown as Json,
    sport: 'golf',
    source: 'crm',
  });

  if (error) {
    await logServerError(`book-call click insert failed: ${error.message}`, {
      action: 'crm.book-call.record',
      source: 'route_handler',
      route: ROUTE_PATH,
      errorCode: error.code,
    });
  }
}

export async function GET(request: Request) {
  // Stamped before any I/O so the recorded click time is when the request
  // landed, not when the lookups happened to finish.
  const occurredAt = new Date();

  // Next serves HEAD from the GET handler when no HEAD export exists. A HEAD
  // is a probe, never a person reaching for the calendar, so it redirects
  // without leaving a row rather than inflating the count we just built.
  if (request.method !== 'HEAD') {
    try {
      await recordBookingClick(request, occurredAt);
    } catch (error) {
      await logServerException(error, {
        action: 'crm.book-call.record',
        source: 'route_handler',
        route: ROUTE_PATH,
        runtime: 'nodejs',
        handled: true,
      });
    }
  }

  // 302 rather than Next's default 307: this is a one-way GET beacon and 302
  // is what every link checker, mail client and analytics tool expects from a
  // tracked redirect.
  const response = NextResponse.redirect(DEMO_PRICING_CALL_URL, 302);
  // Without no-store a CDN or the browser can serve this redirect from cache
  // and the second, third and fourth click never reach us — the original bug
  // wearing a different hat.
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  // Keep the campaign token out of Google's referer log.
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
