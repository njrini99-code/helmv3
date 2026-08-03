'use server';

/**
 * Server actions surfacing the CRM "intent ranking" — coaches whose real
 * buying signals (demo visits, replies, email opens) are currently invisible
 * anywhere in the CRM UI. Reads `v_crm_coach_signal_summary`
 * (supabase/migrations/20260801000000_crm_signal_spine.sql), a per-coach
 * rollup over `v_crm_coach_activity` (crm_contact_log + email_events +
 * golf_demo_sessions + crm_replies + crm_stage_transitions + crm_notes).
 *
 * CLICKS ARE NEVER SURFACED HERE. intent_score and last_intent_at are
 * computed by the view ONLY from demo_entered + reply_received +
 * email_opened — 1,073 of 1,219 all-time clicks fired in one 10-minute
 * window on 2026-06-11 (a 511-email send: 2.1 clicks/send against 233
 * opens, 8-27 clicks/recipient) — that's an email-security-gateway link
 * scanner, not a human. The view has no clicks column at all; do not add
 * one here.
 *
 * Auth / client choice: the admin GATE runs on the cookie-scoped
 * `createClient()`; the ranking QUERY must run on `createAdminClient()`.
 *
 * Both views are `WITH (security_invoker = true)`, so they execute with the
 * CALLING role's permissions. `golf_demo_sessions` — the source of the
 * `demo_entered` arm and the whole point of this panel — carries a
 * RESTRICTIVE policy `golf_demo_sessions_deny_all USING (false)` scoped to
 * PUBLIC, which includes `authenticated`. A restrictive policy ANDs against
 * every permissive one, so a cookie-scoped read returns ZERO demo rows:
 * verified live as `authenticated`, demo_visits > 0 matched 0 coaches
 * against 169 as a BYPASSRLS role. Reading this view on the session client
 * silently renders an empty intent board.
 *
 * `crm-timeline.ts` reaches the same table the same way and for the same
 * documented reason. The service-role read is safe here because
 * requireAdmin() has already proven `users.role = 'admin'` before the query
 * is built. requireAdmin() itself mirrors crm-signals.ts:72-86.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerException } from '@/lib/server-error-logger';

// ---------------------------------------------------------------------------
// Auth gate — admin role required, mirrors crm-signals.ts:72-86. Runs on the
// COOKIE-scoped client so the caller's own session is what gets verified.
// Deliberately returns nothing: the ranking query must not reuse this client
// (see the header note on golf_demo_sessions' restrictive deny-all policy).
// ---------------------------------------------------------------------------
async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden');
  }
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------
export interface IntentCoach {
  coach_id: string;
  name: string;
  school: string | null;
  /** crm_coaches.status, aliased `stage` by the view. Never 'won'/'lost' — filtered below. */
  stage: string;
  demo_visits: number;
  replies: number;
  opens: number;
  intent_score: number;
  last_intent_at: string | null;
}

export interface IntentRankingResult {
  coaches: IntentCoach[];
  /** Exact count of ALL coaches matching every filter (not just the
   *  returned page) — lets the UI honestly say "showing top N of TOTAL" if
   *  MAX_INTENT_ROWS is ever exceeded, instead of silently truncating. */
  totalQualifying: number;
}

interface SignalSummaryRow {
  coach_id: string;
  name: string | null;
  school: string | null;
  stage: string | null;
  demo_visits: number | null;
  replies: number | null;
  opens: number | null;
  intent_score: number | null;
  last_intent_at: string | null;
}

// v_crm_coach_signal_summary isn't in the generated Database type yet (the
// migration landed 2026-08-01) — widen createClient()'s strictly-typed
// `.from()` for this one view, mirroring crm-demo-sessions.ts:96-104's
// identical widening for golf_demo_sessions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WidenedFrom = { from: (table: string) => any };

// A single .range() call is only safe up to PostgREST's per-request 1000-row
// cap (memory/project_golfhelm_postgrest_1000_row_cap.md — `.limit()` alone
// does not lift it; you need `.range()` and to stay under 1000, or a real
// fetchAllRowsResult loop to page past it). This is NOT the "fetch
// everything" case fetchAllRowsResult exists for (see page.tsx's
// fetchAllCoaches, which pages through ~2,300 coaches for an unbounded
// list): here we only ever want the TOP-ranked rows, and ordering by
// intent_score desc means the top of a single bounded page is always
// correct regardless of how many total rows exist below it. Verified live:
// 223 coaches currently have intent_score > 0 out of 2,382 qualifying —
// MAX_INTENT_ROWS stays well clear of both that count and the 1000-row cap.
const MAX_INTENT_ROWS = 300;

// ---------------------------------------------------------------------------
// getIntentRanking — coaches with real buying signal, ranked by intent_score.
//
// Filters (server-side, so MAX_INTENT_ROWS is spent only on qualifying rows):
//   - stage NOT IN ('won','lost')            — deal already decided
//   - email_status <> 'unsubscribed'         — never a legitimate re-approach
//   - email NOT ILIKE '%helmsportslabs.com'  — internal/staff addresses
//   - name NOT ILIKE 'nick'                  — the one known junk/seed row
//     (case-insensitive exact match, not a substring pattern — this must
//     never exclude a real coach named e.g. "Nicholas ...")
//   - intent_score > 0                       — the entire point of this
//     view is surfacing coaches who show REAL signal (opens/demo/reply); a
//     0-score row is exactly what's already visible everywhere else in the
//     CRM today.
//
// Unlike getHotSignals/getCrmDemoSessions in the neighboring action files, a
// query failure here is NOT swallowed to []: this feature exists so an
// operator can trust "no rows" means "no hot leads" — never "the query
// broke". Errors are logged AND rethrown; the caller must render a distinct
// error state, not the empty state.
// ---------------------------------------------------------------------------
export async function getIntentRanking(): Promise<IntentRankingResult> {
  // Gate on the caller's own session first...
  await requireAdmin();
  // ...then read through service-role. golf_demo_sessions' restrictive
  // deny-all policy makes the demo_entered arm of the underlying
  // security_invoker view return nothing to `authenticated`, which would
  // render an empty board rather than an error. See the header note.
  const supabase = createAdminClient();
  const widened = supabase as unknown as WidenedFrom;

  const { data, error, count } = await widened
    .from('v_crm_coach_signal_summary')
    .select(
      'coach_id, name, school, stage, demo_visits, replies, opens, intent_score, last_intent_at',
      { count: 'exact' },
    )
    .not('stage', 'in', '(won,lost)')
    .neq('email_status', 'unsubscribed')
    .not('email', 'ilike', '%helmsportslabs.com')
    .not('name', 'ilike', 'nick')
    .gt('intent_score', 0)
    .order('intent_score', { ascending: false })
    .order('last_intent_at', { ascending: false, nullsFirst: false })
    .order('coach_id', { ascending: true })
    .range(0, MAX_INTENT_ROWS - 1);

  if (error) {
    const err = error instanceof Error ? error : new Error(error.message || 'Failed to load intent ranking');
    await logServerException(err, {
      action: 'crm_intent.getIntentRanking',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw err;
  }

  const rows = (data ?? []) as SignalSummaryRow[];
  const coaches: IntentCoach[] = rows.map((r) => ({
    coach_id: r.coach_id,
    name: r.name ?? '',
    school: r.school,
    stage: r.stage ?? 'new_lead',
    demo_visits: r.demo_visits ?? 0,
    replies: r.replies ?? 0,
    opens: r.opens ?? 0,
    intent_score: r.intent_score ?? 0,
    last_intent_at: r.last_intent_at,
  }));

  return { coaches, totalQualifying: count ?? coaches.length };
}
