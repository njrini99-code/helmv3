'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logLogin } from '@/lib/admin-logger';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  classifyEngagement,
  countsAsHumanEngagement,
  type EngagementClassification,
} from '@/lib/crm/engagement-quality';
import { checkRateLimit, RATE_LIMITS, formatTimeRemaining } from '@/lib/auth/rate-limit';
import { isTransientAuthError, signInWithPasswordResilient } from '@/lib/auth/resilient-get-user';
import { resetSessionIdleMarker } from '@/lib/auth/session-idle-server';
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
// CRM capture: lead creation + scanner-prefetch quarantine
//
// Structurally identical to the GolfHelm gate (src/app/golf/actions/demo-access.ts)
// — same two defects, same resolution, different column name for the free-text
// organization. Keep the two in step when either changes.
//
//   1. A coach could tour the entire product and leave no trace in the
//      pipeline. Entering the gate wrote one `baseball_demo_sessions` row and
//      never created or touched a `crm_coaches` row.
//
//   2. Most recorded tours were not people. Corporate email security scanners
//      follow every link in outbound mail, and the demo-invite email carries an
//      AUTO-SUBMITTING gate link — so a scanner following it manufactures a
//      complete, entirely fake session including name, email and program. On
//      the golf side 178 of the first 220 rows fired under two minutes after
//      that coach's send timestamp. Naively fixing (1) would have converted
//      those fakes into leads a human then wastes a week chasing.
//
// The resolution: classify every entry, write the session row either way (the
// evidence is worth keeping), and only ever create or link a coach when the
// entry is NOT classified 'automated'.
// ---------------------------------------------------------------------------

/**
 * A validated, normalized gate entry as the capture path sees it.
 */
interface DemoGateVisit {
  name: string;
  email: string;
  program: string;
  /** Already defaulted to 'unknown' by the caller — the same value the rate limiter keyed on. */
  ip: string;
  /**
   * Raw `user-agent` header, `null` when absent. Deliberately NOT defaulted to
   * 'unknown' before it reaches the classifier: a missing user-agent and a
   * client that literally calls itself "unknown" are different facts, and the
   * classifier branches on the difference.
   */
  userAgent: string | null;
  referrer: string;
}

/** The subset of `crm_coaches` the capture path reads. */
interface ExistingCoach {
  id: string;
  status: string | null;
  last_contacted_at: string | null;
}

/**
 * `coach_status` ladder, lowest first. See
 * src/app/golf/admin/crm/components/automations/AutomationsSeed.ts — the CRM is
 * shared across both sports.
 */
const COACH_STATUS_RANK: Readonly<Record<string, number>> = {
  new_lead: 1,
  contacted: 2,
  engaged: 3,
  proposal: 4,
  won: 5,
  lost: 6,
  nurture: 7,
};

/**
 * Where a confirmed-human demo tour lands a coach who is still behind it.
 * `engaged` is defined by AutomationsSeed.ts as "opened or clicked our email";
 * walking the whole product is strictly stronger evidence than a click.
 */
const DEMO_TOUR_STATUS = 'engaged' as const;

/**
 * Rank on the `coach_status` ladder.
 *
 * An UNRECOGNIZED status returns `Infinity` on purpose: if someone later adds
 * a stage beyond `nurture`, the safe failure is to leave that coach alone, not
 * to rewind them to `engaged`.
 */
function coachStatusRank(status: string | null | undefined): number {
  if (!status) return 0;
  return COACH_STATUS_RANK[status] ?? Number.POSITIVE_INFINITY;
}

/**
 * Escape LIKE/ILIKE metacharacters so an address matches literally.
 *
 * `_` is a legal email character and `%` is legal in a local part, so handing a
 * raw address to `.ilike()` would turn it into a wildcard pattern that can
 * match a different coach entirely.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Human-readable justification stored next to the verdict in `quality_reason`.
 *
 * The classifier is heuristic and will be retuned, which makes a bare verdict
 * unauditable after the fact — the reason code plus the measured latency is
 * what lets someone decide whether a specific row was called correctly.
 */
function buildQualityReason(classification: EngagementClassification): string {
  const latency =
    classification.latencyMs === null
      ? 'latency=n/a'
      : `latency=${Math.round(classification.latencyMs / 1000)}s`;
  return `${classification.reason} confidence=${classification.confidence} ${latency}`;
}

/**
 * Case-insensitive coach lookup.
 *
 * `crm_coaches.email` stores whatever casing an import or an admin typed, while
 * the gate lowercases the visitor's address — so an equality match misses every
 * coach whose stored address carries an uppercase character. That is the same
 * defect that makes the Gmail reply cron drop known senders.
 *
 * Returns `null` on any failure: this lookup only supplies the classifier's
 * reference timestamp and decides create-vs-link, and neither is worth failing
 * a visitor over.
 */
async function findCoachByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<ExistingCoach | null> {
  try {
    // nosemgrep: helmv3-server-action-missing-auth-check -- public demo gate; see JSDoc on enterBaseballDemoImpl.
    const { data, error } = await admin
      .from('crm_coaches')
      .select('id, status, last_contacted_at')
      .ilike('email', escapeLikePattern(email))
      // `email` carries only a plain (non-unique) index, so duplicate rows are
      // possible; oldest-first makes "which row wins" deterministic rather than
      // dependent on heap order.
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      await logServerError(`Baseball demo gate CRM coach lookup failed: ${describeError(error)}`, {
        action: 'enterBaseballDemo.findCoachByEmail',
        sport: 'baseball',
        feature: 'baseball_demo_access',
        featureArea: 'baseball-demo-access',
        errorCode: error.code,
        metadata: { email },
      });
      return null;
    }

    return data?.[0] ?? null;
  } catch (error) {
    await logServerError(`Baseball demo gate CRM coach lookup threw: ${describeError(error)}`, {
      action: 'enterBaseballDemo.findCoachByEmail',
      sport: 'baseball',
      feature: 'baseball_demo_access',
      featureArea: 'baseball-demo-access',
      metadata: { email },
    });
    return null;
  }
}

/**
 * Record the tour on a coach we already know, and return their id.
 *
 * Deliberately does NOT copy the gate's name / program over the existing row:
 * that input is unverified free text typed by whoever is at the keyboard, and
 * overwriting curated CRM data with it would be a net loss.
 *
 * The id is returned even when the update fails — the coach exists, so the
 * `crm_coach_id` link on the session row is still correct and still worth
 * writing.
 */
async function recordTourOnExistingCoach(
  admin: ReturnType<typeof createAdminClient>,
  existing: ExistingCoach,
  classification: EngagementClassification,
): Promise<string> {
  // Status only ever moves FORWARD, and only on a MEASURED human. A tour whose
  // verdict is 'unknown' still surfaces the coach (the touch below bumps them
  // in the CRM's recently-active ordering) but must not assert a buying signal
  // we could not measure — `countsAsHumanEngagement` is the module's one
  // predicate for that, and it excludes 'unknown' by design.
  const promote =
    countsAsHumanEngagement(classification) &&
    coachStatusRank(existing.status) < coachStatusRank(DEMO_TOUR_STATUS);

  // `status` is included ONLY when it actually changes: trg_crm_stage_transition
  // fires on UPDATE OF status whether or not the value differs, so sending it
  // unconditionally would write a no-op stage-history row on every tour.
  //
  // `updated_at` is immediately overwritten by trg_crm_coaches_updated_at; it is
  // in the patch so the statement always has at least one column to set and
  // therefore always bumps the row for the CRM's recently-touched ordering.
  const patch = {
    updated_at: new Date().toISOString(),
    ...(promote ? { status: DEMO_TOUR_STATUS } : {}),
  };

  try {
    // nosemgrep: helmv3-server-action-missing-auth-check -- public demo gate; see JSDoc on enterBaseballDemoImpl.
    const { error } = await admin // nosemgrep: helmv3-action-missing-revalidate -- redirect-terminated demo flow
      .from('crm_coaches')
      .update(patch)
      .eq('id', existing.id);

    if (error) {
      await logServerError(`Baseball demo gate CRM coach touch failed: ${describeError(error)}`, {
        action: 'enterBaseballDemo.recordTourOnExistingCoach',
        sport: 'baseball',
        feature: 'baseball_demo_access',
        featureArea: 'baseball-demo-access',
        errorCode: error.code,
        metadata: { coachId: existing.id, promoted: promote },
      });
    }
  } catch (error) {
    await logServerError(`Baseball demo gate CRM coach touch threw: ${describeError(error)}`, {
      action: 'enterBaseballDemo.recordTourOnExistingCoach',
      sport: 'baseball',
      feature: 'baseball_demo_access',
      featureArea: 'baseball-demo-access',
      metadata: { coachId: existing.id, promoted: promote },
    });
  }

  return existing.id;
}

/**
 * Create the coach row a walk-in visitor never used to get.
 *
 * Mirrors the lead shape written by the landing-page demo-request action
 * (src/app/actions/demo-request.ts) so every inbound door produces rows the CRM
 * treats identically — `conference` / `division` / `program` are NOT NULL with
 * no usable default, so they get the same placeholders that path uses.
 * `source` is what distinguishes them.
 *
 * Note the column collision: `crm_coaches.program` is the `program_type` enum
 * (mens | womens | both), NOT the free-text program name this gate collects.
 * The visitor's program therefore goes into `school`, which is the CRM's
 * free-text organization column and is NOT NULL.
 */
async function createLeadFromGate(
  admin: ReturnType<typeof createAdminClient>,
  visit: DemoGateVisit,
): Promise<string | null> {
  try {
    // nosemgrep: helmv3-server-action-missing-auth-check -- public demo gate; see JSDoc on enterBaseballDemoImpl.
    const { data, error } = await admin // nosemgrep: helmv3-action-missing-revalidate -- redirect-terminated demo flow
      .from('crm_coaches')
      .insert({
        // name / program are guaranteed non-empty by validateInput above.
        name: visit.name,
        email: visit.email,
        school: visit.program,
        conference: 'Unknown',
        division: 'D3',
        program: 'both',
        status: 'new_lead',
        source: 'demo_gate',
        notes: 'Entered the BaseballHelm demo gate',
      })
      .select('id')
      .single();

    if (error) {
      await logServerError(`Baseball demo gate CRM lead creation failed: ${describeError(error)}`, {
        action: 'enterBaseballDemo.createLeadFromGate',
        sport: 'baseball',
        feature: 'baseball_demo_access',
        featureArea: 'baseball-demo-access',
        errorCode: error.code,
        metadata: { email: visit.email },
      });
      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    await logServerError(`Baseball demo gate CRM lead creation threw: ${describeError(error)}`, {
      action: 'enterBaseballDemo.createLeadFromGate',
      sport: 'baseball',
      feature: 'baseball_demo_access',
      featureArea: 'baseball-demo-access',
      metadata: { email: visit.email },
    });
    return null;
  }
}

/**
 * Classify a gate entry, create or link its CRM lead, and persist the
 * `baseball_demo_sessions` row.
 *
 * Fail-soft by contract: every failure path logs and returns, and the caller
 * ignores the result. A tracking or CRM failure must never stop a real coach
 * from entering the demo. What is no longer acceptable is the bare
 * `try {} catch {}` this replaces — it discarded every error silently, so a
 * broken capture path was indistinguishable from a quiet week.
 */
async function captureDemoGateVisit(visit: DemoGateVisit): Promise<void> {
  const admin = createAdminClient();

  // --- a. Resolve the coach BEFORE classifying -----------------------------
  //    `last_contacted_at` — when WE last reached out — is the reference the
  //    classifier measures entry latency against, because the prefetch we are
  //    trying to catch is a scanner walking the links in that very message.
  //    With no known coach there is no reference, and the classifier is
  //    required to answer 'unknown' rather than guess: a wrong reference
  //    produces a confident wrong answer.
  const existing = await findCoachByEmail(admin, visit.email);

  const classification = classifyEngagement({
    occurredAt: new Date(),
    referenceAt: existing?.last_contacted_at ?? null,
    userAgent: visit.userAgent,
    ip: visit.ip,
  });

  // --- b. Create or link the CRM lead --------------------------------------
  //    The gate is the one surface where 'unknown' must still produce a lead.
  //    An organic walk-in from the public /baseball/demo page has no outreach
  //    to measure against BY CONSTRUCTION, so gating on
  //    countsAsHumanEngagement() here — the module's normal advice, and correct
  //    everywhere a reference timestamp exists — would reject 100% of genuine
  //    walk-ins and re-create the exact defect this change fixes. 'automated'
  //    is the only verdict that blocks lead capture; 'unknown' is admitted at
  //    the lowest status and countsAsHumanEngagement() still gates the status
  //    promotion below.
  //
  //    Known gap, worth naming: a scanner prefetching the invite link for a
  //    coach whose `last_contacted_at` is NULL classifies 'unknown' and will
  //    create a lead. Latency cannot see that case; the batch IP fan-out
  //    helper (detectUserAgentIpFanOut) is what catches it, and it needs a
  //    sweep across rows rather than a single-request decision.
  let crmCoachId: string | null = null;
  if (classification.verdict !== 'automated') {
    crmCoachId = existing
      ? await recordTourOnExistingCoach(admin, existing, classification)
      : await createLeadFromGate(admin, visit);
  }

  // --- c. Persist the session row ------------------------------------------
  //    Written for automated entries too. They are the evidence that the
  //    invite link is being prefetched, and dropping them would only hide the
  //    problem again — they are simply never linked to a coach.
  try {
    // `baseball_demo_sessions` isn't in the generated Database type until
    // `npm run db:types` is re-run against the new migration; cast through
    // unknown until then (mirrors src/app/golf/actions/demo-access.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyAdmin = admin as unknown as { from: (table: string) => any };
    // nosemgrep: helmv3-server-action-missing-auth-check -- public demo gate; see JSDoc below.
    const { error } = await anyAdmin.from('baseball_demo_sessions').insert({ // nosemgrep: helmv3-action-missing-revalidate -- redirect-terminated demo flow
      name: visit.name,
      email: visit.email,
      program: visit.program,
      ip: visit.ip,
      user_agent: visit.userAgent ?? 'unknown',
      referrer: visit.referrer,
      traffic_quality: classification.verdict,
      quality_reason: buildQualityReason(classification),
      crm_coach_id: crmCoachId,
      // The full verdict is kept machine-readable alongside the two summary
      // columns so a retuned classifier can be re-scored against old rows.
      metadata: { engagement: classification },
    });

    if (error) {
      await logServerError(`Baseball demo gate session capture failed: ${describeError(error)}`, {
        action: 'enterBaseballDemo.captureDemoGateVisit',
        sport: 'baseball',
        feature: 'baseball_demo_access',
        featureArea: 'baseball-demo-access',
        errorCode: error.code,
        metadata: { email: visit.email, verdict: classification.verdict },
      });
    }
  } catch (error) {
    await logServerError(`Baseball demo gate session capture threw: ${describeError(error)}`, {
      action: 'enterBaseballDemo.captureDemoGateVisit',
      sport: 'baseball',
      feature: 'baseball_demo_access',
      featureArea: 'baseball-demo-access',
      metadata: { email: visit.email, verdict: classification.verdict },
    });
  }
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
 * 4. Captures the visitor: classifies the entry as human vs. security-scanner
 *    prefetch, creates or links the `crm_coaches` lead for anything not
 *    classified 'automated', and writes the `baseball_demo_sessions` row (via
 *    the admin client, fail-soft but never silent — a tracking or CRM failure
 *    must never block demo entry).
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
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown';
  // Kept nullable here: the capture path needs to tell "no header" apart from
  // a client whose user-agent is the literal string 'unknown'. The stored
  // column still falls back to 'unknown' at the insert, unchanged.
  const userAgent = headersList.get('user-agent');
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

  // --- 5. Capture + sign in concurrently -----------------------------------
  //    The CRM capture and Supabase Auth sign-in are independent network
  //    chains. Starting them together removes a full waterfall from the public
  //    gate. Capture is still awaited before redirect so serverless teardown
  //    cannot drop the write, and the outer catch preserves the fail-soft
  //    contract if even client construction unexpectedly throws.
  const capturePromise = captureDemoGateVisit({
    name,
    email,
    program,
    ip,
    userAgent,
    referrer,
  }).catch(async (error) => {
    await logServerError(
      `Baseball demo gate capture failed unexpectedly: ${describeError(error)}`,
      {
        action: 'enterBaseballDemo.captureDemoGateVisit',
        sport: 'baseball',
        feature: 'baseball_demo_access',
        featureArea: 'baseball-demo-access',
      },
    );
  });

  // --- 6. Sign visitor into the shared demo account server-side ------------
  //    Retried on 429/5xx/network — mass-send bursts funnel every sign-in
  //    through Vercel's egress IPs into Supabase's per-IP auth limits (see
  //    signInWithPasswordResilient).
  const supabase = await createClient();
  // nosemgrep: helmv3-server-action-missing-auth-check -- public demo gate; see JSDoc above.
  const [{ data, error: signInError }] = await Promise.all([
    signInWithPasswordResilient(supabase, {
      email: creds.email,
      password: creds.password,
    }),
    capturePromise,
  ]);

  if (signInError || !data.session || !data.user) {
    return {
      success: false,
      error: isTransientAuthError(signInError)
        ? 'The demo is getting a lot of traffic right now — please try again in a minute.'
        : 'The demo is not available right now. Please try again later or contact support.',
    };
  }

  await resetSessionIdleMarker();

  // --- 6b. Stamp the session as a demo session ------------------------------
  //    `user_metadata.is_demo` is readable by BOTH client and server code
  //    (unlike the demo email, which stays a server-only secret) — the shared
  //    idle-timeout flow (middleware + useSessionActivity) reads it to route
  //    an expired demo session back to /baseball/demo instead of the password
  //    login (#918). Best-effort: a failure here must never block entry.
  //    Skipped once stamped: the flag persists on the shared account and the
  //    fresh session's JWT already carries it — re-stamping per visitor is a
  //    pure extra auth-server round-trip (bad under mass-send load).
  if (data.user.user_metadata?.is_demo !== true) {
    try {
      await supabase.auth.updateUser({ data: { is_demo: true } });
    } catch {
      // Worst case the session_expired redirect falls back to /baseball/login.
    }
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
  { sport: 'baseball', feature: 'baseball_demo_access', featureArea: 'baseball-demo-access' },
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
async function isBaseballDemoSessionImpl(): Promise<{ isDemo: boolean }> {
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
async function isBaseballDemoAvailableImpl(): Promise<{ enabled: boolean }> {
  // nosemgrep: helmv3-server-action-missing-auth-check -- read-only env flag for the public demo gate; see JSDoc above.
  return { enabled: isBaseballDemoEnabled() };
}

export const isBaseballDemoSession = withAdminObserved(
  'isBaseballDemoSession',
  { sport: 'baseball', feature: 'baseball_demo_access', featureArea: 'baseball-demo-access' },
  isBaseballDemoSessionImpl,
);

export const isBaseballDemoAvailable = withAdminObserved(
  'isBaseballDemoAvailable',
  { sport: 'baseball', feature: 'baseball_demo_access', featureArea: 'baseball-demo-access' },
  isBaseballDemoAvailableImpl,
);
