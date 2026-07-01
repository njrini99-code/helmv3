import 'server-only';

// =============================================================================
// src/lib/baseball/coachhelm/engine-run.ts
//
// V12 — the CoachHelm baseball ENGINE RUN core (source -> signal -> action loop).
//
// This is the single, client-agnostic implementation of "load the team's facts,
// run the V10 rules engine, persist insights, promote signals, write the AI
// audit ledger, and reconcile stale rows". It is deliberately NOT a server
// action: it accepts an already-resolved Supabase client + a fully-resolved run
// context (team / coach / created-by user / AI policy / now) so the SAME honesty
// + dedupe logic can be driven from THREE entry points without duplication:
//
//   1. runBaseballEngine (src/app/baseball/actions/coachhelm.ts) — the manual /
//      capability-gated server action (RLS client, session-resolved context).
//      This is the "Run engine" button + post-import + insights.ts delegate.
//   2. The SCHEDULED EVALUATOR (src/lib/inngest/functions.ts) — the daily durable
//      heartbeat over every active team (service-role admin client). This is the
//      piece that makes "Signals are the heartbeat of BaseballHelm" TRUE: time-
//      relative conditions (next-event proximity, stale source, overdue, dev-goal
//      not trained) are re-evaluated every day so a coach who never clicks the
//      button still has a live inbox.
//   3. Any future event-driven trigger (game finalized, lift published) that
//      wants a fresh team evaluation can call this with its RLS client.
//
// WHY A SHARED CORE (and not "let the cron call the server action")
//   The server action resolves auth + active team + capability from the request
//   COOKIE session. A cron / Inngest job has NO session, so it cannot call the
//   action. The established pattern in this codebase (outcome-sweep.ts) is to
//   lift the body into a client-agnostic core that BOTH the RLS server action and
//   the service-role cron drive. This file is that lift for the engine itself.
//
// HONESTY + SAFETY CONTRACT (identical to the server action that used to inline
// this — moving it here changes NOTHING about the contract):
//   - Confidence comes from the loaders (fidelity-capped, roster-recalibrated)
//     and priority runs through the SHARED priority/confidence gate inside the
//     generators. This layer never inflates either.
//   - NO DESTRUCTIVE WRITES: insights + signals reconcile by a stable per-
//     generator dedupe_key via upsert(onConflict). A re-run UPDATES the same row.
//     Stale engine rows (no longer emitted) are soft-archived / soft-resolved,
//     never deleted — coach-acknowledgement history is preserved.
//   - The AI policy is consulted ONCE; the master ai_enabled switch OFF short-
//     circuits the entire run (nothing generated). The policy is passed IN so the
//     caller reads it with the right client (RLS for the action, admin for cron).
//   - The admin (service-role) client is ONLY ever used by the trusted scheduled
//     evaluator, which scopes every query by team_id itself, so cross-team
//     leakage is impossible. RLS still applies to the RLS client path.
//   - NO schema changes here. Columns come from the existing migrations; types
//     are hand-mirrored where the generated db types lag (migrations unapplied).
// =============================================================================

import type { BaseballInsightCandidate } from '@/lib/coachhelm/baseball/generators';
import {
  generateAllBaseballCandidates,
  BASEBALL_ALL_INSIGHT_TYPES,
  type BaseballV10EngineInputs,
} from '@/lib/coachhelm/baseball/engine';
import { rankBaseballCandidates } from '@/lib/coachhelm/baseball/ranking';
import type { VideoCoverageInput } from '@/lib/coachhelm/baseball/generators/v10';
import {
  loadAllPlayerMetrics,
  type BoxScoreRow,
  type ScheduleEventRow,
} from '@/lib/coachhelm/baseball/loaders';
import {
  mergeV10PlayerMetrics,
  type ReadinessRow,
  type LiftSessionRow,
  type LiftSetResultRow,
  type ImportRunSummary,
} from '@/lib/coachhelm/baseball/loaders-v10';
import {
  mergeEventPlayerMetrics,
  type EventLoaderInputs,
  type PitchEventRow,
  type BattedBallEventRow,
  type CatchingEventRow,
  type FieldingEventRow,
  type BaserunningEventRow,
} from '@/lib/coachhelm/baseball/loaders-events';
import type { RankingContext } from '@/lib/coachhelm/baseball/ranking';
import type { BaseballInsightSourceRef } from '@/lib/types/baseball-coachhelm';
import { MATURED_RETRACT_AFTER_DAYS } from '@/lib/coachhelm/shared/base-generator';
import { signalFromInsightWithAudit } from '@/lib/baseball/signal-from-insight';
import { OPEN_SIGNAL_DISPOSITIONS, type BaseballSignalInsert } from '@/lib/types/baseball-signals';
import { decideAiGenerationAllowed, type AiPolicy } from '@/lib/baseball/ai-policy';
import type { BaseballAiAuditInsert } from '@/lib/types/baseball-ai-audit';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';

// Engine provenance stamps for the v4 AI-audit row. The baseball CoachHelm engine
// is a deterministic rules engine (not an LLM), so we record it honestly: the
// "model" is the rules engine version, the "provider" is our own engine, and the
// "prompt_version" is the engine version tag.
const AI_ENGINE_MODEL = 'baseball-coachhelm-rules-v10';
const AI_ENGINE_PROVIDER = 'baseballhelm-engine';
const AI_ENGINE_PROMPT_VERSION = 'v10';

const EVENT_LOOKAHEAD_DAYS = 30;

// MATURITY promotion thresholds (lifecycle_state -> 'matured'). A signal is
// "matured" once it has re-fired across enough runs OR persisted long enough that
// it is a validated, recurring problem rather than a one-run blip. Both gates use
// the SAME ladder the ranker promotes on (ranking.ts: lifecycleState === 'matured'
// → +10), and the shared lifecycle window the golf engine already uses, so the two
// sports mature on one constant. NOTE: 'matured' is reached only while the row is
// still active and the coach has NOT already addressed/resolved it.
const MATURED_MIN_OBSERVATIONS = 3;
const MATURED_MIN_AGE_DAYS = MATURED_RETRACT_AFTER_DAYS;

/**
 * `baseball_coach_insights.status` values that represent a COACH decision (as
 * opposed to the engine's own 'active' default). A re-firing candidate whose
 * prior row carries one of these must NEVER be upserted back to 'active' — the
 * coach already triaged it. Mirrors the same "coach dismissed/resolved this
 * insight — respect it, do not recreate" contract generateTeamInsights()
 * already enforces above.
 */
const COACH_TRIAGED_STATUSES = new Set(['dismissed', 'addressed', 'resolved']);

/**
 * `baseball_signals.disposition` values that represent a terminal COACH
 * decision on the SIGNAL side (as distinct from `OPEN_SIGNAL_DISPOSITIONS`,
 * which is what the table's partial unique index covers). Used by the #473
 * cross-surface fix below: a candidate whose paired signal already carries one
 * of these, with no open row left for the same dedupe_key, must not be
 * re-emitted as a fresh 'new' row.
 */
const SIGNAL_COACH_TRIAGED_DISPOSITIONS = new Set(['dismissed', 'resolved', 'converted']);

/** Prior persisted state of an insight row, keyed by dedupe_key, used to (a) feed
 *  lifecycleState into the ranker, (b) carry the maturity counters forward on a
 *  re-fire (so a re-run INCREMENTS observation_count rather than resetting it),
 *  and (c) preserve a coach-set disposition (dismissed/addressed/resolved) across
 *  re-runs so the engine can never resurrect a triaged insight back to 'active'. */
export interface PriorInsightState {
  /** The prior row's primary key, when one exists (undefined in pure unit tests). */
  id?: string | null;
  lifecycle_state: string | null;
  observation_count: number | null;
  first_detected_at: string | null;
  status: string | null;
}

/**
 * PURE maturity decision (extracted so it is unit-testable without a DB). Given a
 * candidate's freshly-gated priority + the row's PRIOR persisted state + the run
 * clock, decide the carried-forward maturity counters and the engine-owned
 * lifecycle_state. The engine owns the DATA-derived ladder; coach_status is
 * orthogonal and untouched here.
 *
 * Rules (mirror the spec's "repeated trend (matured)" PROMOTE term):
 *   - observation_count: prior + 1 on a re-fire, 1 on a genuine first insert.
 *   - first_detected_at: STABLE — the prior value is kept; only a first insert
 *     stamps `nowIso` (the "how long has this persisted" clock).
 *   - lifecycle:
 *       * a prior 'resolved' (set by the outcome sweep) is TERMINAL — preserved,
 *         never re-opened by a re-firing detection;
 *       * otherwise 'matured' once observation_count ≥ MATURED_MIN_OBSERVATIONS
 *         OR the signal has persisted ≥ MATURED_MIN_AGE_DAYS, or it was already
 *         matured (never demoted back down);
 *       * else the base detection ladder: 'detected' for high/urgent, else
 *         'tentative'.
 */
export function computeMaturityState(
  priority: BaseballInsightCandidate['priority'],
  prior: PriorInsightState | undefined,
  nowIso: string,
): { observationCount: number; firstDetectedAt: string; lifecycle: string } {
  const priorCount = prior?.observation_count ?? 0;
  const observationCount = priorCount > 0 ? priorCount + 1 : 1;
  const firstDetectedAt = prior?.first_detected_at ?? nowIso;
  const ageDays = (Date.parse(nowIso) - Date.parse(firstDetectedAt)) / 86400_000;

  const baseLifecycle = priority === 'high' || priority === 'urgent' ? 'detected' : 'tentative';
  const isMatured =
    prior?.lifecycle_state === 'matured' ||
    observationCount >= MATURED_MIN_OBSERVATIONS ||
    (Number.isFinite(ageDays) && ageDays >= MATURED_MIN_AGE_DAYS);
  const lifecycle =
    prior?.lifecycle_state === 'resolved'
      ? 'resolved'
      : isMatured
        ? 'matured'
        : baseLifecycle;

  return { observationCount, firstDetectedAt, lifecycle };
}

// -----------------------------------------------------------------------------
// Minimally-typed client so the core runs against either the RLS server client
// or the service-role admin client (both expose `.from`). RLS applies to the RLS
// client; the admin client is only ever driven by the trusted scheduled
// evaluator, which scopes every query by team_id. This matches the OutcomeSweep
// client pattern in outcome-sweep.ts and the LooseClient cast in the actions.
// -----------------------------------------------------------------------------

export type EngineRunClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// -----------------------------------------------------------------------------
// Run context — everything the core needs that the SESSION used to provide. The
// caller resolves these with the correct client BEFORE calling the core:
//   - server action: from withBaseballAction ctx (targetTeamId / activeCoachId /
//     user.id) + readAiPolicy (RLS).
//   - scheduled evaluator: resolve the team's primary coach + its user_id +
//     readAiPolicyWithClient (admin).
// -----------------------------------------------------------------------------

export interface EngineRunContext {
  teamId: string;
  /** Coach that OWNS the generated insight rows (baseball_coach_insights.coach_id NOT NULL). */
  coachId: string;
  /** auth.users id stamped as created_by on signals + audit rows. */
  createdByUserId: string;
  /** Team AI-governance gates, already read with the caller's client. */
  policy: AiPolicy;
  /** Single run clock; pass a stable ISO so all rows in a run agree. */
  nowIso?: string;
}

export interface BaseballEngineRunResult {
  success: boolean;
  generated: number;
  archivedStale: number;
  /** Triage signals emitted into baseball_signals (medium+ priority subset). */
  signalsEmitted: number;
  /** Open engine signals soft-resolved this run because they were not re-emitted. */
  signalsResolved: number;
  /** Open engine signals soft-expired this run because their expires_at passed. */
  signalsExpired: number;
  /**
   * Candidates the AI policy WITHHELD this run (below confidence / missing source
   * refs / player-visible gated / staff-AI off). Recorded in the AI audit log.
   */
  aiWithheld: number;
  /** Audit rows written this run (one per candidate that ran through the policy). */
  aiAudited: number;
  /**
   * True when the master AI switch (ai_enabled) is OFF — the entire run is
   * short-circuited and NOTHING is generated.
   */
  aiDisabled?: boolean;
  byGenerator?: Record<string, number>;
  error?: string;
}

function emptyResult(over: Partial<BaseballEngineRunResult>): BaseballEngineRunResult {
  return {
    success: false,
    generated: 0,
    archivedStale: 0,
    signalsEmitted: 0,
    signalsResolved: 0,
    signalsExpired: 0,
    aiWithheld: 0,
    aiAudited: 0,
    ...over,
  };
}

// -----------------------------------------------------------------------------
// runBaseballEngineCore — load + run + persist + reconcile for ONE team.
//
// Client-agnostic. Never throws on a normal data miss — it degrades to an honest
// empty/partial result. A hard read failure returns { success:false, error }.
// -----------------------------------------------------------------------------

export async function runBaseballEngineCore(
  client: EngineRunClient,
  context: EngineRunContext,
): Promise<BaseballEngineRunResult> {
  const { teamId, coachId, createdByUserId, policy } = context;
  const nowIso = context.nowIso ?? new Date().toISOString();

  if (!teamId) return emptyResult({ error: 'No team context.' });
  if (!coachId) return emptyResult({ error: 'No active coach context.' });

  // 0. AI POLICY master switch — OFF short-circuits the ENTIRE run.
  if (!decideAiGenerationAllowed(policy)) {
    return emptyResult({ success: true, aiDisabled: true });
  }

  const db = client;

  // 1. LOAD — roster + box scores + upcoming events (all team-scoped).
  const { data: members, error: membersErr } = await db
    .from('baseball_team_members')
    .select('player_id')
    .eq('team_id', teamId);
  if (membersErr) return emptyResult({ error: 'Could not load the roster.' });

  const playerIds = ((members ?? []) as Array<{ player_id: string | null }>)
    .map((m) => m.player_id)
    .filter((id): id is string => !!id);
  if (playerIds.length === 0) {
    // No roster -> nothing to evaluate, but STILL sweep expired signals so an
    // emptied team's inbox drains. Honest success.
    const expired = await sweepExpiredSignals(db, teamId, nowIso);
    return emptyResult({ success: true, signalsExpired: expired });
  }

  // Box scores: a full-roster season can exceed the PostgREST 1000-row cap, so the
  // old `.limit(2000)` silently truncated to the most-recent 1000 (PostgREST caps
  // every response at max_rows = 1000) — better than the unordered event reads, but
  // still a partial season. We paginate the full set, keeping newest-first ordering
  // with a stable tiebreak on `id` so page boundaries are deterministic when many
  // rows share a session_date.
  const { data: statRows, error: statsErr } = await fetchAllRowsResult<BoxScoreRow>(
    (from, to) =>
      db
        .from('baseball_player_stats')
        .select(
          'id, player_id, stat_type, session_date, at_bats, hits, doubles, triples, home_runs, walks, strikeouts, innings_pitched, earned_runs, walks_allowed, strikeouts_thrown, exit_velocity, pitch_velocity',
        )
        .eq('team_id', teamId)
        .in('player_id', playerIds)
        .order('session_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
  );
  if (statsErr) return emptyResult({ error: 'Could not load box-score stats.' });

  const horizonIso = new Date(Date.parse(nowIso) + EVENT_LOOKAHEAD_DAYS * 86400_000).toISOString();
  const { data: eventRows } = await db
    .from('baseball_events')
    .select('id, title, event_type, start_time, end_time, is_mandatory')
    .eq('team_id', teamId)
    .gte('start_time', nowIso)
    .lte('start_time', horizonIso)
    .order('start_time', { ascending: true });

  // V10 facts: readiness, lift compliance/RPE, recent imports.
  const readinessSinceIso = new Date(Date.parse(nowIso) - 14 * 86400_000).toISOString().slice(0, 10);
  const { data: readinessRows } = await db
    .from('baseball_readiness_checkins')
    .select('id, player_id, check_date, sleep_hours, energy_level, soreness_level, arm_status')
    .eq('team_id', teamId)
    .in('player_id', playerIds)
    .gte('check_date', readinessSinceIso);

  const { data: liftSessionRows } = await db
    .from('baseball_lift_sessions')
    .select('id, player_id, scheduled_date, status')
    .eq('team_id', teamId)
    .in('player_id', playerIds);

  const liftRpeSinceIso = new Date(Date.parse(nowIso) - 14 * 86400_000).toISOString();
  const { data: liftSetResultRows } = await db
    .from('baseball_lift_set_results')
    .select('id, player_id, completed_at, rpe')
    .eq('team_id', teamId)
    .in('player_id', playerIds)
    .gte('completed_at', liftRpeSinceIso);

  const importSinceIso = new Date(Date.parse(nowIso) - 14 * 86400_000).toISOString();
  const { data: importRunRows } = await db
    .from('baseball_import_runs')
    .select('id, import_type, source_label, status, row_count, warning_count, error_count, created_at')
    .eq('team_id', teamId)
    .gte('created_at', importSinceIso)
    .order('created_at', { ascending: false })
    .limit(50);

  // V6/V10 deepened event-grain catalog (catching/defense/baserunning + deepened
  // hitting/pitching). Each read is team-scoped + bounded to the 60-day window; an
  // absent table / no rows yields no signals (loaders degrade honestly — no false
  // flags).
  //
  // WHY PAGINATION (not .limit): these are stat-EVENT grain tables (TrackMan /
  // Rapsodo / scoring app). A single weekend of pitch data for one team exceeds
  // 1000 pitches, and PostgREST hard-caps every response at max_rows = 1000
  // (supabase/config.toml) — so the old `.limit(20000)` / `.limit(10000)` were
  // dead numbers (the server never returns more than 1000) AND, with NO `.order`,
  // the 1000 returned were an ARBITRARY slice. The engine then computed
  // pitch-mix / whiff / exit-velo over a random partial subset and emitted
  // silently-wrong insights. fetchAllRowsResult walks every page so the engine
  // sees the COMPLETE window; the mandatory stable `.order('id')` keeps page
  // boundaries from drifting (and makes the read fully deterministic run-to-run).
  const eventSinceIso = new Date(Date.parse(nowIso) - 60 * 86400_000).toISOString();
  const [
    { data: pitchEventRows },
    { data: battedBallRows },
    { data: catchingRows },
    { data: fieldingRows },
    { data: baserunningRows },
  ] = await Promise.all([
    fetchAllRowsResult<PitchEventRow>((from, to) =>
      db
        .from('baseball_pitch_events')
        .select(
          'id, pitcher_id, batter_id, data_context, pitch_number, pitch_type, pitch_type_classified, velocity, is_swing, is_whiff, is_in_zone, is_called_strike, pitch_call, count_state, batter_handedness, measured_at',
        )
        .eq('team_id', teamId)
        // GAP 5 — only the current (non-superseded) value powers the engine.
        .is('superseded_by_run_id', null)
        .gte('measured_at', eventSinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult<BattedBallEventRow>((from, to) =>
      db
        .from('baseball_batted_ball_events')
        .select('id, batter_id, data_context, exit_velocity, spray_angle, batted_ball_type, is_hard_hit, measured_at')
        .eq('team_id', teamId)
        .is('superseded_by_run_id', null)
        .gte('measured_at', eventSinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult<CatchingEventRow>((from, to) =>
      db
        .from('baseball_catching_events')
        .select('id, catcher_id, data_context, event_type, pop_time, throw_accuracy, block_result, steal_result, measured_at')
        .eq('team_id', teamId)
        .gte('measured_at', eventSinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult<FieldingEventRow>((from, to) =>
      db
        .from('baseball_fielding_events')
        .select('id, player_id, data_context, position, event_type, chance_difficulty, result, error_type, arm_accuracy, measured_at')
        .eq('team_id', teamId)
        .gte('measured_at', eventSinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRowsResult<BaserunningEventRow>((from, to) =>
      db
        .from('baseball_baserunning_events')
        .select('id, runner_id, data_context, event_type, result, decision_quality, measured_at')
        .eq('team_id', teamId)
        .gte('measured_at', eventSinceIso)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  const eventInputs: EventLoaderInputs = {
    pitchEvents: (pitchEventRows ?? []) as PitchEventRow[],
    battedBallEvents: (battedBallRows ?? []) as BattedBallEventRow[],
    catchingEvents: (catchingRows ?? []) as CatchingEventRow[],
    fieldingEvents: (fieldingRows ?? []) as FieldingEventRow[],
    baserunningEvents: (baserunningRows ?? []) as BaserunningEventRow[],
  };

  // 2. RUN — pure V10 engine over the loaded data.
  const boxScorePlayers = loadAllPlayerMetrics(
    playerIds,
    (statRows ?? []) as unknown as BoxScoreRow[],
  );
  const players = boxScorePlayers.map((p) =>
    mergeEventPlayerMetrics(
      mergeV10PlayerMetrics(
        p,
        (readinessRows ?? []) as ReadinessRow[],
        (liftSessionRows ?? []) as LiftSessionRow[],
        (liftSetResultRows ?? []) as LiftSetResultRow[],
      ),
      eventInputs,
    ),
  );
  const events = (eventRows ?? []) as ScheduleEventRow[];

  // 2b. PRIOR INSIGHT STATE + VIDEO EVIDENCE — fetched BEFORE ranking so the
  //     ranker's matured/has-video promotions operate against the team's TRUE
  //     state. Previously the existing-rows fetch happened AFTER persist and only
  //     selected (id, dedupe_key), so lifecycleState + hasVideo were never fed
  //     and those promotions were dead (the spec's "repeated trend (matured)" +
  //     evidence-backed PROMOTE terms). Both reads degrade honestly: a missing
  //     table / no rows simply yields an empty context (no false promotions).
  //
  //     NOT filtered to status='active': a coach-dismissed/addressed/resolved
  //     row must still be visible here so step 3 below can see its status and
  //     refuse to upsert it back to 'active' on a re-fire (#473). Filtering to
  //     'active' only, as this used to, made every triaged row invisible to the
  //     dedupe-key lookup, so the next run's upsert always overwrote it.
  const { data: priorInsightRows } = await db
    .from('baseball_coach_insights')
    .select('id, dedupe_key, lifecycle_state, observation_count, first_detected_at, status')
    .eq('team_id', teamId)
    .in('insight_type', BASEBALL_ALL_INSIGHT_TYPES);
  const priorByKey = new Map<string, PriorInsightState>();
  for (const r of (priorInsightRows ?? []) as Array<{ dedupe_key: string | null } & PriorInsightState>) {
    if (r.dedupe_key) {
      priorByKey.set(r.dedupe_key, {
        id: r.id ?? null,
        lifecycle_state: r.lifecycle_state ?? null,
        observation_count: r.observation_count ?? null,
        first_detected_at: r.first_detected_at ?? null,
        status: r.status ?? null,
      });
    }
  }

  // Video evidence: a clip is linked to a signal (linked_signal_id) OR tags the
  // subject player (players_tagged). We resolve BOTH so a per-player candidate is
  // "evidence-backed" when the team has a recent clip of that player even before a
  // specific signal link exists. Active clips only (dismissed/archived don't
  // count). Honest: an absent table yields no coverage (hasVideo defaults false).
  const playersWithVideo = new Set<string>();
  let videoActiveDiagnosticInsights = 0;
  let videoInsightsWithClip = 0;
  const { data: videoRows } = await db
    .from('baseball_video_events')
    .select('linked_signal_id, players_tagged, owner_player_id, disposition')
    .eq('team_id', teamId)
    .in('disposition', ['active', 'reviewed', 'approved']);
  for (const v of (videoRows ?? []) as Array<{
    players_tagged: string[] | null;
    owner_player_id: string | null;
  }>) {
    for (const pid of v.players_tagged ?? []) if (pid) playersWithVideo.add(pid);
    if (v.owner_player_id) playersWithVideo.add(v.owner_player_id);
  }
  // Coverage = share of active diagnostic insights with at least one linked clip.
  // Computed from the prior active set (the snapshot the engine is refreshing) so
  // the video_evidence generator can flag low coverage HONESTLY (real numerator/
  // denominator), replacing the hardcoded null that suppressed it entirely.
  // priorByKey now carries EVERY prior status (see #473 fix above), so this must
  // filter back down to 'active' itself to keep the coverage ratio meaning "share
  // of currently-active diagnostic insights" — a dismissed/resolved insight was
  // never part of this denominator.
  {
    const linkedSignalIds = new Set<string>();
    for (const v of (videoRows ?? []) as Array<{ linked_signal_id: string | null }>) {
      if (v.linked_signal_id) linkedSignalIds.add(v.linked_signal_id);
    }
    // Map active insights -> their promoted signal ids to know which have a clip.
    const { data: activeSignalRows } = await db
      .from('baseball_signals')
      .select('id, dedupe_key')
      .eq('team_id', teamId)
      .eq('source_kind', 'ai')
      .in('disposition', ['new', 'acknowledged', 'sample_too_small']);
    const signalIdByKey = new Map<string, string>();
    for (const s of (activeSignalRows ?? []) as Array<{ id: string; dedupe_key: string | null }>) {
      if (s.dedupe_key) signalIdByKey.set(s.dedupe_key, s.id);
    }
    const activePriorKeys = Array.from(priorByKey.entries())
      .filter(([, v]) => v.status === 'active')
      .map(([key]) => key);
    videoActiveDiagnosticInsights = activePriorKeys.length;
    for (const key of activePriorKeys) {
      const sigId = signalIdByKey.get(key);
      if (sigId && linkedSignalIds.has(sigId)) videoInsightsWithClip += 1;
    }
  }
  const videoCoverage: VideoCoverageInput | null =
    videoActiveDiagnosticInsights > 0
      ? {
          diagnosticCount: videoActiveDiagnosticInsights,
          withVideoCount: videoInsightsWithClip,
        }
      : null;

  // Ranking context: days-to-next team event drives proximity promotion. This is
  // a TIME-RELATIVE condition — re-running the engine on a later day moves the
  // same flag UP as the event approaches. The scheduled evaluator is what makes
  // that re-evaluation actually happen every day.
  const nextEventMs = events.length > 0 ? Date.parse(events[0]!.start_time) : null;
  const daysToNextEvent =
    nextEventMs != null && Number.isFinite(nextEventMs)
      ? Math.max(0, Math.round((nextEventMs - Date.parse(nowIso)) / 86400_000))
      : null;
  const defaultRankingContext: RankingContext = { daysToNextEvent };

  // GENERATE the full candidate set ONCE (base + V10 families + composites). We
  // split generate-then-rank (instead of runBaseballEngineV10's combined call) so
  // the ranking context can be keyed off the ACTUAL emitted candidates — feeding
  // each its prior lifecycle_state + whether its subject player has supporting
  // video. This is the runtime feed the gap doc flagged as missing (ranking.ts
  // read lifecycleState/hasVideo but nothing ever supplied them, so the matured
  // and evidence-backed PROMOTE terms were dead).
  const engineInputs: BaseballV10EngineInputs = {
    players,
    events,
    importRuns: (importRunRows ?? []) as ImportRunSummary[],
    videoCoverage,
    defaultRankingContext,
  };
  const generated_ = generateAllBaseballCandidates(engineInputs);

  const rankingContextByKey: Record<string, RankingContext> = {};
  for (const c of generated_) {
    const key = `${c.generator}:${c.playerId ?? 'team'}`;
    const prior = priorByKey.get(key);
    rankingContextByKey[key] = {
      // Prior persisted lifecycle so a matured (recurring) problem ranks UP, and
      // a still-tentative one ranks slightly down — exactly as ranking.ts weighs.
      lifecycleState: prior?.lifecycle_state ?? null,
      // Player-scoped candidates are evidence-backed when the team has a clip of
      // that player; team-level signals (schedule/import) are never video-gated.
      hasVideo: c.playerId ? playersWithVideo.has(c.playerId) : false,
    };
  }

  const ranked = rankBaseballCandidates(generated_, (c) => {
    const key = `${c.generator}:${c.playerId ?? 'team'}`;
    const keyed = rankingContextByKey[key] ?? {};
    // Team-scoped candidates ignore the team-wide proximity default (it is about
    // a player's next event) but still honor explicit per-key context.
    const base: RankingContext = c.playerId ? defaultRankingContext : {};
    return { ...base, ...keyed };
  });
  const candidates = ranked.map((r) => r.candidate);
  const rankByKey = new Map<string, number>(
    ranked.map((r) => [`${r.candidate.generator}:${r.candidate.playerId ?? 'team'}`, r.rankScore]),
  );

  // 3. PERSIST — upsert by dedupe_key (NO delete-then-insert).
  //
  // #473: a re-firing candidate whose PRIOR row carries a coach-set disposition
  // (dismissed / addressed / resolved) must NEVER be upserted — that would flip
  // status back to 'active' and resurrect an insight the coach already triaged.
  // This mirrors the identical "coach dismissed/resolved this insight — respect
  // it, do not recreate" rule generateTeamInsights() already applies in
  // src/app/baseball/actions/insights.ts. The candidate is still counted in
  // byGenerator/emittedKeys (the underlying condition DID re-fire this run —
  // we are only refusing to write over the coach's decision), it is simply
  // excluded from the write batch.
  const byGenerator: Record<string, number> = {};
  const emittedKeys = new Set<string>();
  const rows: ReturnType<typeof buildInsightRow>[] = [];
  for (const c of candidates) {
    const dedupeKey = `${c.generator}:${c.playerId ?? 'team'}`;
    emittedKeys.add(dedupeKey);
    byGenerator[c.generator] = (byGenerator[c.generator] ?? 0) + 1;
    const prior = priorByKey.get(dedupeKey);
    if (prior?.status && COACH_TRIAGED_STATUSES.has(prior.status)) {
      continue;
    }
    rows.push(
      buildInsightRow(c, teamId, coachId, dedupeKey, nowIso, rankByKey.get(dedupeKey) ?? null, prior),
    );
  }

  let generated = 0;
  const insightIdByKey = new Map<string, string>();
  if (rows.length > 0) {
    const { data: upserted, error: upsertErr } = await db
      .from('baseball_coach_insights')
      .upsert(rows, { onConflict: 'team_id,dedupe_key', ignoreDuplicates: false })
      .select('id, dedupe_key');
    if (upsertErr) return emptyResult({ error: 'Could not save generated insights.' });
    generated = rows.length;
    for (const u of (upserted ?? []) as Array<{ id: string; dedupe_key: string | null }>) {
      if (u.dedupe_key) insightIdByKey.set(u.dedupe_key, u.id);
    }
  }

  // 4. RECONCILE STALE INSIGHTS — soft-archive engine rows not re-emitted.
  let archivedStale = 0;
  const { data: existingActiveRaw } = await db
    .from('baseball_coach_insights')
    .select('*')
    .eq('team_id', teamId)
    .in('insight_type', BASEBALL_ALL_INSIGHT_TYPES)
    .eq('status', 'active');

  const existingActive = (existingActiveRaw ?? []) as Array<{ id: string; dedupe_key: string | null }>;
  const staleIds = existingActive
    .filter((r) => !!r.dedupe_key && !emittedKeys.has(r.dedupe_key))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    const { error: archiveErr } = await db
      .from('baseball_coach_insights')
      .update({ status: 'dismissed', lifecycle_state: 'archived', resolved_at: nowIso })
      .in('id', staleIds);
    if (!archiveErr) archivedStale = staleIds.length;
  }

  // 5. EMIT SIGNALS — promote medium+ ranked candidates into baseball_signals.
  //
  // Cross-surface companion to the #473 insight-skip above: `baseball_signals`
  // only has a PARTIAL unique index on (team_id, dedupe_key) that covers OPEN
  // dispositions (OPEN_SIGNAL_DISPOSITIONS: new/acknowledged/sample_too_small —
  // see migration 20260624000092). Once a coach sets a signal to a terminal
  // disposition (dismissed/resolved/converted) and NO open row remains for that
  // dedupe_key, that row falls outside the upsert's conflict target. Re-emitting
  // the same dedupe_key would then INSERT a brand-new 'new' row alongside the
  // terminal one instead of updating it — resurrecting a signal the coach
  // already triaged on the live Signals tab. We fetch the prior dispositions
  // per dedupe_key up front and skip re-emission for any key whose ONLY rows
  // are coach-triaged terminal ones (an open row still present means the normal
  // upsert-refresh path is safe and correct).
  const { data: priorSignalRows } = await db
    .from('baseball_signals')
    .select('dedupe_key, disposition')
    .eq('team_id', teamId)
    .not('dedupe_key', 'is', null);
  const openSignalKeys = new Set<string>();
  const terminalSignalKeys = new Set<string>();
  for (const r of (priorSignalRows ?? []) as Array<{
    dedupe_key: string | null;
    disposition: string | null;
  }>) {
    if (!r.dedupe_key || !r.disposition) continue;
    if ((OPEN_SIGNAL_DISPOSITIONS as readonly string[]).includes(r.disposition)) {
      openSignalKeys.add(r.dedupe_key);
    } else if (SIGNAL_COACH_TRIAGED_DISPOSITIONS.has(r.disposition)) {
      terminalSignalKeys.add(r.dedupe_key);
    }
  }

  let signalsEmitted = 0;
  let aiWithheld = 0;
  const signalKeys = new Set<string>();
  const signalRows: BaseballSignalInsert[] = [];
  const auditRows: BaseballAiAuditInsert[] = [];

  for (const c of candidates) {
    const key = `${c.generator}:${c.playerId ?? 'team'}`;

    // Coach already triaged the paired signal to a terminal disposition and no
    // open row exists to refresh — do not resurrect it as a fresh 'new' row.
    if (terminalSignalKeys.has(key) && !openSignalKeys.has(key)) {
      continue;
    }

    const audit = signalFromInsightWithAudit(c, {
      teamId,
      createdByUserId,
      insightId: insightIdByKey.get(key) ?? null,
      dedupeKey: key,
      nowIso,
      policy,
    });

    if (audit.row) {
      signalRows.push(audit.row);
      signalKeys.add(key);
    } else if (audit.disposition === 'withheld' && audit.reason != null) {
      aiWithheld += 1;
    }

    const isGovernanceEvent = audit.row != null || audit.reason != null;
    if (isGovernanceEvent) {
      auditRows.push({
        team_id: teamId,
        player_id: c.playerId,
        output_kind: 'signal',
        generator: c.generator,
        dedupe_key: key,
        output_table: audit.row ? 'baseball_signals' : null,
        output_id: null,
        model: AI_ENGINE_MODEL,
        provider: AI_ENGINE_PROVIDER,
        prompt_version: AI_ENGINE_PROMPT_VERSION,
        source_refs: audit.row?.source_refs ?? ([] as unknown as BaseballAiAuditInsert['source_refs']),
        confidence: audit.confidence,
        visibility: audit.effectiveVisibility,
        desired_visibility: audit.desiredVisibility,
        disposition: audit.disposition,
        withheld_reason: audit.reason,
        guardrail_redacted: audit.guardrailRedacted,
        guardrail_medical: audit.guardrailMedicalHit,
        guardrail_academic: audit.guardrailAcademicHit,
        generated_at: nowIso,
        created_by: createdByUserId,
      });
    }
  }

  if (signalRows.length > 0) {
    const { data: upsertedSignals, error: sigErr } = await db
      .from('baseball_signals')
      .upsert(signalRows, { onConflict: 'team_id,dedupe_key', ignoreDuplicates: false })
      .select('id, dedupe_key');
    // Surface the failure instead of silently continuing with signalsEmitted=0 —
    // a swallowed error here (plus the DEFERRABLE-arbiter bug fixed in
    // 20260701010000) is why baseball_signals sat empty in prod. Preserve the
    // `generated` insight count, which was already persisted above.
    if (sigErr) return emptyResult({ error: 'Could not save generated signals.', generated });
    signalsEmitted = signalRows.length;
    const signalIdByKey = new Map<string, string>();
    for (const s of (upsertedSignals ?? []) as Array<{ id: string; dedupe_key: string | null }>) {
      if (s.dedupe_key) signalIdByKey.set(s.dedupe_key, s.id);
    }
    for (const a of auditRows) {
      if (a.dedupe_key && a.output_table === 'baseball_signals') {
        a.output_id = signalIdByKey.get(a.dedupe_key) ?? null;
      }
    }
  }

  // 5b. WRITE THE AI AUDIT LOG.
  let aiAudited = 0;
  if (auditRows.length > 0) {
    const { error: auditErr } = await db
      .from('baseball_ai_audit')
      .upsert(auditRows, { onConflict: 'team_id,output_kind,dedupe_key', ignoreDuplicates: false });
    if (!auditErr) aiAudited = auditRows.length;
  }

  // 6. RECONCILE STALE SIGNALS — auto-resolve open engine signals not re-emitted.
  let signalsResolved = 0;
  const { data: openSignalsRaw } = await db
    .from('baseball_signals')
    .select('id, dedupe_key')
    .eq('team_id', teamId)
    .eq('source_kind', 'ai')
    .in('disposition', ['new', 'sample_too_small']);
  const staleSignalIds = ((openSignalsRaw ?? []) as Array<{ id: string; dedupe_key: string | null }>)
    .filter((r) => !!r.dedupe_key && !signalKeys.has(r.dedupe_key))
    .map((r) => r.id);
  if (staleSignalIds.length > 0) {
    const { error: resolveErr } = await db
      .from('baseball_signals')
      .update({ disposition: 'resolved', resolved_at: nowIso, updated_at: nowIso })
      .in('id', staleSignalIds);
    if (!resolveErr) signalsResolved = staleSignalIds.length;
  }

  // 7. SWEEP EXPIRED SIGNALS — the gap the schedule closes: expires_at was set on
  //    every emitted signal but nothing ever swept it. A daily heartbeat run is
  //    where a TTL'd signal that no longer re-fires (so it was never refreshed AND
  //    never re-resolved) finally expires out of the inbox.
  const signalsExpired = await sweepExpiredSignals(db, teamId, nowIso);

  return {
    success: true,
    generated,
    archivedStale,
    signalsEmitted,
    signalsResolved,
    signalsExpired,
    aiWithheld,
    aiAudited,
    byGenerator,
  };
}

// -----------------------------------------------------------------------------
// sweepExpiredSignals — soft-expire OPEN signals whose expires_at has passed.
//
// THE GAP: signal-from-insight stamps expires_at = now + ttlDays on every signal,
// but no job ever acted on it, so a TTL was decorative. This sweep is the actor.
//
// Honesty rules:
//   - Only UNTRIAGED open dispositions ('new' / 'sample_too_small') expire. A
//     coach who acknowledged / converted / dismissed / resolved a signal owns its
//     state — we NEVER walk that back via TTL.
//   - 'expired' is a first-class, distinct disposition (NOT 'resolved') so the
//     surface can tell "issue cleared" (resolved) from "we stopped tracking it"
//     (expired). Both are non-destructive soft transitions; nothing is deleted.
//   - Idempotent: a second pass finds nothing left below the horizon.
// -----------------------------------------------------------------------------

export async function sweepExpiredSignals(
  client: EngineRunClient,
  teamId: string,
  nowIso: string,
): Promise<number> {
  const { data: expiringRaw } = await client
    .from('baseball_signals')
    .select('id')
    .eq('team_id', teamId)
    .in('disposition', ['new', 'sample_too_small'])
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso);
  const ids = ((expiringRaw ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { error } = await client
    .from('baseball_signals')
    .update({ disposition: 'expired', resolved_at: nowIso, updated_at: nowIso })
    .in('id', ids);
  return error ? 0 : ids.length;
}

// -----------------------------------------------------------------------------
// Row builder — maps a candidate to the baseball_coach_insights insert shape.
// -----------------------------------------------------------------------------

function buildInsightRow(
  c: BaseballInsightCandidate,
  teamId: string,
  coachId: string,
  dedupeKey: string,
  nowIso: string,
  rankScore: number | null,
  prior: PriorInsightState | undefined,
) {
  const sourceRefs: BaseballInsightSourceRef[] = c.evidence.source_refs;

  // MATURITY — pure decision (see computeMaturityState): carry counters forward
  // on a re-fire so a recurring signal accumulates observation_count + matures,
  // while preserving a terminal 'resolved' the outcome sweep set.
  const { observationCount, firstDetectedAt, lifecycle } = computeMaturityState(
    c.priority,
    prior,
    nowIso,
  );

  return {
    team_id: teamId,
    coach_id: coachId,
    player_id: c.playerId,
    insight_type: c.insightType,
    title: c.title,
    body: c.body,
    priority: c.priority,
    status: 'active',
    source_refs: sourceRefs,
    confidence: c.confidence,
    lifecycle_state: lifecycle,
    observation_count: observationCount,
    first_detected_at: firstDetectedAt,
    last_seen_at: nowIso,
    player_visible: c.playerVisible,
    generated_by: c.generator,
    dedupe_key: dedupeKey,
    last_generated_at: nowIso,
    rank_score: rankScore,
    ranked_at: nowIso,
    metadata: {
      confidence: c.confidence,
      category: 'performance',
      generator: c.generator,
      evidence: c.evidence,
      rank_score: rankScore,
      observation_count: observationCount,
    },
  };
}
