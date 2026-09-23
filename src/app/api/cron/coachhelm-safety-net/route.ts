/**
 * CoachHelm safety-net cron.
 *
 * Re-runs the post-round trigger for any round whose terminal state columns
 * are still NULL — meaning the round-submit `after(postRoundTrigger)` call
 * never wrote success or failure for it.
 *
 * 2026-05-17 rewrite (Plan 04 / audit P-CRIT-2 + A-NEW-6 + Q-NEW-4):
 *   - Replaces the previous heuristic ("any active insight after
 *     round.created_at" wins → skip) with a deterministic state-column
 *     query. The heuristic could be defeated by lifecycle cron refreshes
 *     and manual acknowledgements creating unrelated newer rows.
 *   - Replaces the sequential per-player loop with chunked Promise.allSettled
 *     so 100+ pending rounds finish well inside the 300s function budget.
 *   - Calls postRoundTrigger (same wrapper the round submit uses) so the
 *     state columns get set consistently from both call sites.
 *
 * 2026-07-25 rewrite (Fix 1 of the CoachHelm remediation plan): the
 * eligibility query used to also require `created_at >= now() - 30d` on
 * top of the terminal-state gate above. That rolling window is what let
 * 112 (then 200) completed rounds go permanently unanalyzed while this
 * cron reported success on all 332 of its runs in that period — the
 * moment a stranded round aged past the window, it silently dropped out
 * of the query for good, with nothing anywhere recording that it had
 * happened. Widening the window from 24h to 30d on 2026-05-23 to drain
 * an earlier backlog didn't fix this; it only delayed the same failure
 * mode until the backlog regrew. The date filter is gone: eligibility is
 * now purely `status='completed' AND coachhelm_analyzed_at IS NULL AND
 * coachhelm_failed_at IS NULL` — deterministic and age-independent, and
 * still cheap thanks to the partial index from migration 20260517010000.
 * STALE_THRESHOLD_MS below is reporting-only now: it drives a
 * `logServerError` warning when the eligible backlog itself contains rows
 * older than the threshold, so a silent backlog can never again hide
 * behind a query window that simply stopped looking.
 *
 * 2026-07-25 companion change (Fix 3 of the same plan, layered on top of
 * the rewrite above — same file, applied second): round submits now route
 * through Inngest for durable retries when INNGEST_EVENT_KEY/
 * INNGEST_SIGNING_KEY are configured (src/app/golf/actions/golf.ts,
 * src/lib/inngest/functions.ts's onCoachHelmRoundSubmitted). This cron is
 * still the correct backstop either way — Inngest delivery isn't
 * guaranteed to be configured, and even when it is, a durable retry can
 * still exhaust its attempts. MIN_AGE_MS below adds a floor so this cron
 * doesn't fire a redundant direct call while a round is still inside its
 * first Inngest attempt's own retry backoff window; see the constant's own
 * comment for the exact math. This cron never calls Inngest itself — it
 * always calls postRoundTrigger directly, which is fine: a 30-minute
 * re-scheduled cron tick is itself already a durable retry mechanism.
 *
 * 2026-09-12 (repair plan R3 / Package 4): the engine's result is a typed
 * `AnalysisOutcome` and the round columns now carry THREE populations, not
 * two:
 *   - never processed: both timestamps NULL, reason NULL → the sweep below,
 *     unchanged (this is the only population that gets a full engine run
 *     every tick until it resolves);
 *   - PARKED: both timestamps NULL, reason = a parked code
 *     (`engine_below_round_floor`, `engine_no_recent_rounds`,
 *     `engine_no_team_membership`, `engine_no_coach`, `engine_disabled`) —
 *     an expected state, excluded from the sweep and woken only by the
 *     event its policy names (see `reconcileParkedRounds`);
 *   - FAILED: failed_at set — transient codes are retried with a per-row
 *     attempt count on the reason column up to RETRY_MAX_ATTEMPTS, then
 *     left as `<code>:exhausted` (see `retryTransientFailures`); everything
 *     else stays failed and inspectable.
 * Rounds the pre-R3 trigger stamped FAILED for expected states
 * (`engine_no_recent_rounds`, `engine_membership_missing`) are repaired by
 * the same wake rules as parked rows, one player at a time, never by a bulk
 * update.
 *
 * Schedule: every 30 min (see vercel.json).
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';
import {
  LEGACY_PARKED_FAILURE_CODES,
  PARKED_OUTCOME_CODES,
  RETRYABLE_FAILURE_CODES,
  RETRY_MAX_ATTEMPTS,
  RETRY_MIN_BACKOFF_MS,
  formatFailureReason,
  isAnalysisOutcomeCode,
  kindForCode,
  parseFailureReason,
  type AnalysisOutcomeKind,
} from '@/lib/coachhelm/v3/engine/analysis-outcome';
import { classifySoftFailure } from '@/lib/admin/observe-action-result';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const DEFAULT_STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

// Reporting-only staleness threshold — see the header comment. Not a query
// filter; only decides when the stale-backlog alarm fires. Optionally
// overridable via env for tuning alert sensitivity without a code change.
const STALE_THRESHOLD_MS = (() => {
  const raw = process.env.COACHHELM_SAFETY_NET_STALE_THRESHOLD_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_THRESHOLD_MS;
})();
const BATCH_LIMIT = 200;
const CONCURRENCY = 5;
// Reconciliation is bounded per tick: at most this many players' parked
// rounds are examined, and at most this many transient failures re-run.
const RECONCILE_PLAYER_LIMIT = 50;
const RETRY_BATCH_LIMIT = 25;
const RESPONSE_RESERVE_MS = 60_000;
const MAX_SOFT_DEADLINE_MS = maxDuration * 1000 - RESPONSE_RESERVE_MS;
const DEFAULT_SOFT_DEADLINE_MS = MAX_SOFT_DEADLINE_MS;

// Leave a full minute of the Vercel function budget for the in-flight chunk
// to settle, job-run persistence, and the HTTP response. Unprocessed rows keep
// both terminal columns NULL, so the next 30-minute tick resumes them without
// manufacturing a failure or losing work. The override exists for deterministic
// regression tests and emergency tuning. It may shorten the work window, but
// it may never consume the response reserve; invalid or over-budget values fail
// closed to the production default.
function getSoftDeadlineMs(): number {
  const raw = process.env.COACHHELM_SAFETY_NET_SOFT_DEADLINE_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_SOFT_DEADLINE_MS
    ? parsed
    : DEFAULT_SOFT_DEADLINE_MS;
}

// 2026-07-25 addition (Fix 3 of the CoachHelm remediation plan, layered on
// top of the 2026-07-25 rewrite above): a floor so this cron never
// re-triggers a round that's still inside its first Inngest attempt's own
// retry backoff window. Inngest's documented default retry backoff is a
// fixed table — 15s, 30s, 1m, 2m, ... — plus up to 30s of jitter per
// attempt (github.com/inngest/inngest pkg/backoff/backoff.go). For
// `retries: 3` (see onCoachHelmRoundSubmitted in
// src/lib/inngest/functions.ts), the worst case delay before the LAST
// retry attempt even starts is 15s+30s+60s = 105s base + up to 3*30s = 90s
// jitter = up to 195s (3m15s). The plan's starting suggestion was 5
// minutes; this uses 10 minutes instead — over 3x the 195s backoff-only
// figure, leaving ~405s of headroom for the final attempt's own execution
// time (including LLM calls) instead of the ~105s a 5-minute floor would
// leave. The extra 5 minutes costs nothing in practice: this cron only
// runs every 30 minutes, so a 5-vs-10-minute floor changes which of the
// next one or two ticks first sees a given round, not whether it's
// eventually recovered — the age-independent eligibility gate above
// guarantees that regardless. NOT required for correctness:
// postRoundTrigger's terminal write is idempotent at the column level and
// duplicate insight rows are structurally prevented by
// golf_coach_insights's unique dedup index — this floor only avoids
// wasted duplicate engine runs while an Inngest retry may still succeed.
const MIN_AGE_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  return recordJobRun('coachhelm-safety-net', () => handleSafetyNet());
}

async function handleSafetyNet(): Promise<NextResponse> {
  // Start the budget before client creation, eligibility/count queries, and
  // stale-backlog reporting. Setup time consumes the same Vercel invocation
  // budget as trigger processing and must not silently eat the response reserve.
  const runStartedAt = Date.now();
  const supabase = createAdminClient();

  // Deterministic eligibility: completed rounds where postRoundTrigger
  // never wrote a terminal state, regardless of age. The partial index
  // added in migration 20260517010000 (WHERE coachhelm_analyzed_at IS NULL
  // AND coachhelm_failed_at IS NULL AND status='completed') keeps this
  // query cheap without needing a date filter to narrow the scan.
  //
  // The `.lte('created_at', ...)` MIN_AGE_MS floor (see const above) is
  // layered on top for Fix 3: it excludes rounds still inside their first
  // Inngest attempt's own retry window so this cron doesn't race a
  // still-in-flight durable retry with a redundant direct call.
  const minAgeCutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rounds, error } = await (supabase as any)
    .from('golf_rounds')
    .select('id, player_id, created_at')
    .eq('status', 'completed')
    .is('coachhelm_analyzed_at', null)
    .is('coachhelm_failed_at', null)
    // R3: a parked round (expected state, reason set) is not "never
    // processed" — it waits for its wake-up event in reconcileParkedRounds.
    .is('coachhelm_failure_reason', null)
    .lte('created_at', minAgeCutoffIso)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    await logServerError(
      `cron.safetyNet.fetchRounds failed: ${error.message}`,
      {
        action: 'cron.coachhelm.safetyNet.fetchRounds',
        featureArea: 'coachhelm',
        extra: { code: error.code },
      },
      'error',
    );
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  const pending: Array<{ id: string; player_id: string; created_at: string }> = (rounds ?? []) as Array<{ id: string; player_id: string; created_at: string }>;

  // Honest self-reporting: the eligibility query above no longer has a date
  // window to hide behind, so if a genuinely stale backlog exists it shows
  // up right here in `pending` — flag it instead of letting a clean
  // `pending: 0`-eventually run past it in silence like the old window did.
  // Numeric comparison, not string: `r.created_at` is a Postgres timestamptz
  // string over PostgREST, which isn't guaranteed to compare the same way
  // as `Date#toISOString()`'s suffix/precision under a raw `<`.
  const staleCutoff = Date.now() - STALE_THRESHOLD_MS;
  const staleCutoffIso = new Date(staleCutoff).toISOString();
  const staleBacklog = pending.filter((r) => new Date(r.created_at).getTime() < staleCutoff);

  if (staleBacklog.length > 0) {
    const oldest = staleBacklog[0]!;

    // `staleBacklog` is a subset of a BATCH_LIMIT-capped page, so its length
    // saturates at BATCH_LIMIT and cannot distinguish a 200-round backlog from
    // a 20,000-round one — the alarm was structurally incapable of reporting
    // the number an operator needs. Count the real thing with a HEAD query on
    // the same predicate, so it rides the same partial index (20260517010000)
    // and stays cheap. Best-effort: a failure here must never suppress the
    // alarm, so fall back to the (understated) page count and say so.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: staleTotal, error: staleCountError } = await (supabase as any)
      .from('golf_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .is('coachhelm_analyzed_at', null)
      .is('coachhelm_failed_at', null)
      .is('coachhelm_failure_reason', null)
      .lte('created_at', minAgeCutoffIso)
      .lt('created_at', staleCutoffIso);

    await logServerError(
      // Count-stable message: the count used to be interpolated here, and
      // incident fingerprints hash a normalised message prefix that only
      // redacts integers of 5+ digits (lib/admin/incident-grouping.ts). So
      // every distinct backlog size minted a BRAND-NEW incident — "200" and
      // "20" from two consecutive ticks of one draining backlog arrived as two
      // unrelated warnings, neither of which could dedupe or stay resolved.
      // The numbers live in `extra` instead; same rule the gated-insight
      // emitter already follows (actions/insights.ts).
      'cron.safetyNet.staleBacklog: completed round(s) have sat unanalyzed past the staleness threshold',
      {
        action: 'cron.coachhelm.safetyNet.staleBacklog',
        featureArea: 'coachhelm',
        extra: {
          staleCount: staleCountError ? null : staleTotal ?? null,
          staleCountUnavailable: staleCountError ? staleCountError.message : undefined,
          // Kept alongside the true total so a saturated page is legible as
          // such rather than looking like the whole backlog.
          staleInThisPage: staleBacklog.length,
          batchLimit: BATCH_LIMIT,
          pageSaturated: pending.length === BATCH_LIMIT,
          thresholdDays: Math.round(STALE_THRESHOLD_MS / (24 * 60 * 60 * 1000)),
          totalPending: pending.length,
          oldestRoundId: oldest.id,
          oldestCreatedAt: oldest.created_at,
        },
      },
      'warning',
    );
  }

  let recovered = 0;
  let failed = 0;
  // Outcomes the engine itself classified as routine (an un-rostered player,
  // a player with no rounds in the lookback). They are terminal — the trigger
  // stamped coachhelm_failed_at, so they leave the eligibility query and are
  // never retried — but they are not cron failures, and counting them as such
  // made every tick that touched one report `failed > 0` forever.
  let skippedExpected = 0;
  let processed = 0;
  let deadlineReached = false;
  const softDeadlineMs = getSoftDeadlineMs();

  // Chunked Promise.allSettled — runs CONCURRENCY postRoundTrigger calls
  // in parallel. Each call writes terminal state to its round's
  // coachhelm_{analyzed,failed}_at column, so subsequent cron runs skip
  // automatically.
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    // Never begin another expensive LLM chunk once the response reserve has
    // been consumed. The current page is ordered oldest-first, and deferred
    // rows remain eligible, so this is a durable checkpoint rather than a
    // terminal failure.
    if (Date.now() - runStartedAt >= softDeadlineMs) {
      deadlineReached = true;
      break;
    }

    const chunk = pending.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((round) =>
        postRoundTrigger(supabase, {
          playerId: round.player_id,
          roundId: round.id,
          triggerReason: 'safety_net',
        }),
      ),
    );
    processed += settled.length;
    for (let j = 0; j < settled.length; j++) {
      const result = settled[j]!;
      if (result.status === 'fulfilled' && result.value.success) {
        recovered++;
      } else {
        const round = chunk[j]!;
        const reason = result.status === 'fulfilled'
          ? result.value.error
          : result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        // A rejected promise has no engine classification, so it stays a hard
        // failure. A fulfilled `{ success: false }` carries the engine's own
        // `code`, and this cron must reach the SAME verdict postRoundTrigger
        // already reached for it — otherwise the identical outcome is logged
        // twice with two different severities, which is exactly how routine
        // states ("No active team membership for player", "No completed
        // rounds in the last 90 days") kept reappearing in the Errors tab
        // at 'error' moments after being logged at 'warning'/'info'.
        const code = result.status === 'fulfilled' ? (result.value.code ?? null) : null;
        const { severity, skipSentry } = classifySoftFailure(reason ?? 'unknown failure', code);
        // R3: the typed kind decides the count. A parked round (waiting /
        // not applicable / disabled) is an expected state the trigger has
        // already recorded; only a real failure counts as one.
        const kind: AnalysisOutcomeKind | null = isAnalysisOutcomeCode(code) ? kindForCode(code) : null;
        const isFailure = kind
          ? kind === 'retryable_failure' || kind === 'permanent_failure'
          : severity === 'error';
        if (isFailure) failed++;
        else skippedExpected++;

        const message = `cron.safetyNet.postRoundTrigger failed: ${reason ?? 'unknown failure'}`;
        const logContext = {
          action: 'cron.coachhelm.safetyNet.postRoundTrigger',
          featureArea: 'coachhelm',
          playerId: round.player_id,
          ...(skipSentry ? { skipSentry: true } : {}),
          ...(code ? { errorCode: code } : {}),
          extra: { roundId: round.id },
        };
        if (severity === 'info') {
          await logServerEvent(message, logContext, 'info');
        } else {
          await logServerError(message, logContext, severity);
        }
      }
    }
  }

  // R3 reconciliation — bounded, event-driven, never a full re-run of every
  // inactive player. Runs after the never-processed sweep so a pending round
  // that just got analyzed can already cover its player's parked rows.
  const deadline = () => Date.now() - runStartedAt >= softDeadlineMs;
  const retried = deadlineReached ? emptyRetrySummary() : await retryTransientFailures(supabase, deadline);
  const reconciled = deadlineReached ? emptyReconcileSummary() : await reconcileParkedRounds(supabase, deadline);

  return NextResponse.json({
    success: true,
    pending: pending.length,
    processed,
    deferred: pending.length - processed,
    deadlineReached,
    recovered,
    failed,
    skippedExpected,
    concurrency: CONCURRENCY,
    retried,
    reconciled,
  });
}

// ---------------------------------------------------------------------------
// Transient-failure retry (`backoff_with_deadline`).
// ---------------------------------------------------------------------------

interface RetrySummary {
  examined: number;
  rerun: number;
  recovered: number;
  exhausted: number;
}

function emptyRetrySummary(): RetrySummary {
  return { examined: 0, rerun: 0, recovered: 0, exhausted: 0 };
}

interface FailedRoundRow {
  id: string;
  player_id: string;
  created_at: string;
  coachhelm_failed_at: string;
  coachhelm_failure_reason: string;
}

/**
 * Re-run rounds whose last attempt was a transient fault, one safety-net
 * tick or more ago, while they have attempts left. The attempt count lives
 * on the reason column (`engine_timeout`, `engine_timeout:r2`, …); the last
 * permitted attempt stamps `<code>:exhausted`, which this query never
 * selects again — that is the deadline, and it is operator-visible in the
 * response and the log.
 */
async function retryTransientFailures(
  supabase: SupabaseClient,
  pastDeadline: () => boolean,
): Promise<RetrySummary> {
  const summary = emptyRetrySummary();
  const retryableReasons: string[] = [];
  for (const code of RETRYABLE_FAILURE_CODES) {
    for (let attempt = 1; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
      retryableReasons.push(formatFailureReason(code, attempt));
    }
  }
  const backoffCutoffIso = new Date(Date.now() - RETRY_MIN_BACKOFF_MS).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('golf_rounds')
    .select('id, player_id, created_at, coachhelm_failed_at, coachhelm_failure_reason')
    .eq('status', 'completed')
    .is('coachhelm_analyzed_at', null)
    .in('coachhelm_failure_reason', retryableReasons)
    .lte('coachhelm_failed_at', backoffCutoffIso)
    .order('coachhelm_failed_at', { ascending: true })
    .limit(RETRY_BATCH_LIMIT);
  if (error) {
    await logServerError(`cron.safetyNet.retryTransient fetch failed: ${error.message}`, {
      action: 'cron.coachhelm.safetyNet.retryTransient',
      featureArea: 'coachhelm',
      extra: { code: error.code },
    }, 'warning');
    return summary;
  }
  const rows = (data ?? []) as FailedRoundRow[];
  summary.examined = rows.length;
  for (const row of rows) {
    if (pastDeadline()) break;
    const parsed = parseFailureReason(row.coachhelm_failure_reason);
    const attempt = (parsed?.attempt ?? 1) + 1;
    summary.rerun++;
    const result = await postRoundTrigger(supabase, {
      playerId: row.player_id,
      roundId: row.id,
      triggerReason: 'safety_net',
      attempt,
    });
    if (result.success) {
      summary.recovered++;
    } else if (result.outcome.kind === 'retryable_failure' && attempt >= RETRY_MAX_ATTEMPTS) {
      summary.exhausted++;
      await logServerError(
        'cron.safetyNet.retryTransient: a round exhausted its transient-failure retries and stays failed',
        {
          action: 'cron.coachhelm.safetyNet.retryExhausted',
          featureArea: 'coachhelm',
          playerId: row.player_id,
          errorCode: result.outcome.code,
          extra: { roundId: row.id, attempts: attempt, reason: result.outcome.message },
        },
        'warning',
      );
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Parked-round reconciliation (wake_on_round / wake_on_membership /
// wake_on_settings).
// ---------------------------------------------------------------------------

interface ReconcileSummary {
  playersExamined: number;
  covered: number;
  woken: number;
  stillParked: number;
}

function emptyReconcileSummary(): ReconcileSummary {
  return { playersExamined: 0, covered: 0, woken: 0, stillParked: 0 };
}

interface ParkedRoundRow {
  id: string;
  player_id: string;
  team_id: string | null;
  created_at: string;
  coachhelm_failure_reason: string;
}

type WakeEvent = 'round' | 'membership' | 'settings';

function wakeEventFor(reason: string): WakeEvent {
  const code = parseFailureReason(reason)?.code ?? reason;
  switch (code) {
    case 'engine_no_team_membership':
    case 'engine_membership_missing':
    case 'engine_no_coach':
      return 'membership';
    case 'engine_disabled':
      return 'settings';
    default:
      return 'round';
  }
}

async function stampCovered(supabase: SupabaseClient, roundId: string, nowIso: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('record_round_coachhelm_terminal_state', {
    p_round_id: roundId,
    p_analyzed_at: nowIso,
    p_failed_at: null,
    p_failure_reason: 'engine_covered_by_later_run',
  });
  if (error || !data) {
    await logServerError(
      `cron.safetyNet.reconcile: covered-stamp write failed${error ? `: ${error.message}` : ' (0 rows)'}`,
      { action: 'cron.coachhelm.safetyNet.reconcile.stampCovered', featureArea: 'coachhelm', extra: { roundId } },
      'warning',
    );
    return false;
  }
  return true;
}

/**
 * A wake-decision read failed. Log it and fail closed: the round stays
 * parked for the next tick rather than waking (or being stamped) on a read
 * that returned nothing because it errored.
 */
async function logWakeReadFailure(read: string, message: string, extra: Record<string, unknown>): Promise<void> {
  await logServerError(
    `cron.safetyNet.reconcile: ${read} read failed: ${message}`,
    { action: 'cron.coachhelm.safetyNet.reconcile.wakeRead', featureArea: 'coachhelm', extra: { read, ...extra } },
    'warning',
  );
}

/** Does the player have an active roster membership right now? */
async function hasActiveMembership(supabase: SupabaseClient, playerId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('status', 'active')
    .limit(1);
  if (error) {
    await logWakeReadFailure('golf_team_members', error.message, { playerId });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Are the team's and its coach's CoachHelm switches both on? Resolves the
 * coach exactly as the engine does (organisation → oldest coach), so the
 * wake decision matches the run that follows it.
 */
async function analysisEnabledFor(supabase: SupabaseClient, teamId: string | null): Promise<boolean> {
  if (!teamId) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const { data: teamSettings, error: teamSettingsError } = await client
    .from('golf_team_coachhelm_settings')
    .select('enabled')
    .eq('team_id', teamId)
    .maybeSingle();
  if (teamSettingsError) {
    await logWakeReadFailure('golf_team_coachhelm_settings', teamSettingsError.message, { teamId });
    return false;
  }
  if (teamSettings?.enabled === false) return false;
  const { data: team, error: teamError } = await client
    .from('golf_teams')
    .select('organization_id')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError) {
    await logWakeReadFailure('golf_teams', teamError.message, { teamId });
    return false;
  }
  const orgId = team?.organization_id as string | undefined;
  if (!orgId) return false;
  const { data: coach, error: coachError } = await client
    .from('golf_coaches')
    .select('id')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (coachError) {
    await logWakeReadFailure('golf_coaches', coachError.message, { teamId, orgId });
    return false;
  }
  if (!coach?.id) return false;
  const { data: coachSettings, error: coachSettingsError } = await client
    .from('golf_coachhelm_settings')
    .select('enabled')
    .eq('coach_id', coach.id)
    .maybeSingle();
  if (coachSettingsError) {
    await logWakeReadFailure('golf_coachhelm_settings', coachSettingsError.message, { teamId, coachId: coach.id });
    return false;
  }
  return coachSettings?.enabled !== false;
}

/**
 * Wake parked rounds by the event their policy names, never on a timer:
 *   - any parked round OLDER than the player's newest analyzed round is
 *     COVERED by that run (analysis is player-level over the window), so it
 *     is stamped analyzed with `engine_covered_by_later_run` — no engine
 *     run;
 *   - a membership-parked player who now has an active roster row gets ONE
 *     engine run on their newest parked round; a settings-parked player
 *     gets one when both switches are back on;
 *   - a data-parked player (under the floor / nothing in the window) is
 *     woken by the next completed round's own trigger, which lands in the
 *     never-processed sweep if that trigger never ran — nothing to do here
 *     beyond coverage.
 * Legacy FAILED rows carrying the pre-R3 expected-state codes go through
 * the same rules.
 */
async function reconcileParkedRounds(
  supabase: SupabaseClient,
  pastDeadline: () => boolean,
): Promise<ReconcileSummary> {
  const summary = emptyReconcileSummary();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  const select = 'id, player_id, team_id, created_at, coachhelm_failure_reason';
  const [{ data: parked, error: parkedError }, { data: legacy, error: legacyError }] = await Promise.all([
    client
      .from('golf_rounds')
      .select(select)
      .eq('status', 'completed')
      .is('coachhelm_analyzed_at', null)
      .is('coachhelm_failed_at', null)
      .in('coachhelm_failure_reason', [...PARKED_OUTCOME_CODES])
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT),
    client
      .from('golf_rounds')
      .select(select)
      .eq('status', 'completed')
      .is('coachhelm_analyzed_at', null)
      .in('coachhelm_failure_reason', [...LEGACY_PARKED_FAILURE_CODES])
      .not('coachhelm_failed_at', 'is', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT),
  ]);
  const fetchError = parkedError ?? legacyError;
  if (fetchError) {
    await logServerError(`cron.safetyNet.reconcile fetch failed: ${fetchError.message}`, {
      action: 'cron.coachhelm.safetyNet.reconcile',
      featureArea: 'coachhelm',
      extra: { code: fetchError.code },
    }, 'warning');
    return summary;
  }

  const byPlayer = new Map<string, ParkedRoundRow[]>();
  for (const row of [...((parked ?? []) as ParkedRoundRow[]), ...((legacy ?? []) as ParkedRoundRow[])]) {
    const list = byPlayer.get(row.player_id) ?? [];
    list.push(row);
    byPlayer.set(row.player_id, list);
  }

  const nowIso = new Date().toISOString();
  let playersSeen = 0;
  for (const [playerId, rows] of byPlayer) {
    if (playersSeen >= RECONCILE_PLAYER_LIMIT || pastDeadline()) {
      summary.stillParked += rows.length;
      continue;
    }
    playersSeen++;
    summary.playersExamined++;
    rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));

    // 1. Coverage by the player's newest analyzed round.
    const { data: newestAnalyzed, error: newestAnalyzedError } = await client
      .from('golf_rounds')
      .select('id, created_at')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .not('coachhelm_analyzed_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newestAnalyzedError) {
      await logWakeReadFailure('golf_rounds', newestAnalyzedError.message, { playerId });
      summary.stillParked += rows.length;
      continue;
    }
    const coveredUntil = (newestAnalyzed?.created_at as string | undefined) ?? null;
    let remaining: ParkedRoundRow[] = [];
    for (const row of rows) {
      if (coveredUntil && row.created_at < coveredUntil) {
        if (await stampCovered(supabase, row.id, nowIso)) summary.covered++;
        else remaining.push(row);
      } else {
        remaining.push(row);
      }
    }
    if (remaining.length === 0) continue;

    // 2. Event-driven wake on the newest remaining round — one engine run
    //    per player per tick, and only when the named event has happened.
    const newest = remaining[remaining.length - 1]!;
    const event = wakeEventFor(newest.coachhelm_failure_reason);
    let shouldWake = false;
    if (event === 'membership') shouldWake = await hasActiveMembership(supabase, playerId);
    else if (event === 'settings') shouldWake = await analysisEnabledFor(supabase, newest.team_id);
    if (!shouldWake) {
      summary.stillParked += remaining.length;
      continue;
    }
    const result = await postRoundTrigger(supabase, {
      playerId,
      roundId: newest.id,
      triggerReason: 'safety_net',
    });
    summary.woken++;
    remaining = remaining.slice(0, -1);
    if (result.success) {
      // The run that just completed covers the player's older parked rows.
      for (const row of remaining) {
        if (await stampCovered(supabase, row.id, nowIso)) summary.covered++;
        else summary.stillParked++;
      }
    } else {
      summary.stillParked += remaining.length;
    }
  }
  return summary;
}
