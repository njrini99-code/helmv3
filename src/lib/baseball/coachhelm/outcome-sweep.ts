import 'server-only';

// =============================================================================
// src/lib/baseball/coachhelm/outcome-sweep.ts
//
// V10 — the CoachHelm OUTCOME SWEEP core (source → signal → action → did-it-move).
//
// This is the single, client-agnostic implementation of the "did the metric the
// action targeted actually move?" measurement. It is deliberately NOT a server
// action: it accepts an already-resolved Supabase client + team id so it can be
// driven from THREE entry points without duplicating the honesty logic:
//
//   1. recordActionOutcomes (src/app/baseball/actions/coachhelm-actions.ts) —
//      the manual / capability-gated server action (RLS client).
//   2. The Inngest scheduled sweep (src/lib/inngest/functions.ts) — a daily
//      durable job over every active team (service-role admin client).
//   3. The postgame finalize path (src/app/baseball/actions/postgame.ts) — after
//      a game is reviewed, immediately re-measure any open action whose target
//      metric the just-played game could have moved (RLS client, scoped to the
//      box-score players).
//
// HONESTY CONTRACT (the entire point of the ledger):
//   * The observed value is recomputed over the AFTER WINDOW ONLY — sessions
//     strictly AFTER the action was created — so a one-game-after read renders
//     'too_early', never a fake 'improved'. outcome_sample_n is the count of
//     those post-action sessions, NOT the player's lifetime sample.
//   * Movement is improvement-SIGNED from the metric registry, never inferred
//     from the raw delta — the ledger can never "learn backward" (a velo DROP is
//     not an improvement). A neutral_threshold metric (sign 0) yields null
//     movement → 'insufficient_sample', never a "better/worse" claim.
//   * NO destructive writes: each measured action is UPDATEd in place.
//   * NO schema changes here; the columns come from migration 20260624000210.
//     Types are hand-mirrored in src/lib/types/baseball-coachhelm-v10.ts.
// =============================================================================

import {
  loadPlayerMetrics,
  type BoxScoreRow,
} from '@/lib/coachhelm/baseball/loaders';
import {
  baseballImprovementSign,
  isBaseballMetricId,
  type BaseballMetricId,
} from '@/lib/coachhelm/baseball/metrics/registry';
import { loadEngineStatRows } from '@/lib/baseball/coachhelm/engine-stat-rows';
import {
  loadEngineEventRows,
  eventDerivedVelocityForPlayer,
  type EngineEventRows,
} from '@/lib/baseball/coachhelm/engine-event-derived';
import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

// A minimally-typed client so the sweep runs against either the RLS server
// client or the service-role admin client (both expose `.from`). RLS still
// applies to the RLS client; the admin client is only ever used by the trusted
// Inngest cron, which scopes every query by team_id itself.
export type OutcomeSweepClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// Minimum AFTER-window sessions before the ledger will state a direction. One
// session can never prove movement, so < 2 is always 'too_early'.
const MIN_AFTER_SAMPLE = 2;

// Movement magnitude (in the metric's own units, improvement-signed) under which
// we call it 'no_change' rather than improved/regressed — a dead-band so noise
// near zero never flips the verdict.
const MOVEMENT_DEADBAND = 0.005;

export interface OutcomeSweepStats {
  /** Open metric-targeted actions considered (across all statuses swept). */
  evaluated: number;
  /** Actions whose outcome columns were written this pass. */
  measured: number;
}

/** An action row the sweep needs (loose — baseball_actions not in db types). */
interface SweepActionRow {
  id: string;
  player_id: string | null;
  created_at: string | null;
  outcome_metric: string | null;
  outcome_baseline_value: number | null;
  outcome_observed_value: number | null;
  /** Links back to the originating signal (whose dedupe_key == the insight's). */
  signal_id: string | null;
}

/**
 * Decide the honest verdict from the improvement-signed movement + AFTER sample.
 * Order matters: sample gate BEFORE direction so a thin window can never claim
 * 'improved'/'regressed'.
 */
export function outcomeVerdictFor(
  signedMovement: number | null,
  afterSampleN: number,
  hasBaselineAndObserved: boolean,
): BaseballActionOutcomeVerdict {
  if (!hasBaselineAndObserved) return 'insufficient_sample';
  if (afterSampleN < MIN_AFTER_SAMPLE) return 'too_early';
  if (signedMovement == null) return 'insufficient_sample'; // neutral_threshold (sign 0)
  if (signedMovement > MOVEMENT_DEADBAND) return 'improved';
  if (signedMovement < -MOVEMENT_DEADBAND) return 'regressed';
  return 'no_change';
}

/**
 * Run the outcome sweep for a single team.
 *
 * @param supabase  Resolved client (RLS server client OR service-role admin).
 * @param teamId    Team scope (every query is scoped by it, even on admin).
 * @param opts.playerIds  Optional: restrict the sweep to these players (the
 *                  postgame path passes only the box-score players so a finished
 *                  game re-measures just the actions it could have moved).
 * @param opts.remeasure  When true, also re-measure already-measured actions
 *                  (the cron + postgame want a fresh read each window); when
 *                  false (manual default) only first-time-unmeasured rows.
 */
export async function sweepActionOutcomes(
  supabase: OutcomeSweepClient,
  teamId: string,
  opts: { playerIds?: string[]; remeasure?: boolean } = {},
): Promise<OutcomeSweepStats> {
  const { data: actionRows, error: actionsErr } = await supabase
    .from('baseball_actions')
    .select('id, player_id, created_at, outcome_metric, outcome_baseline_value, outcome_observed_value, signal_id')
    .eq('team_id', teamId)
    .in('status', ['open', 'in_progress', 'completed']);
  if (actionsErr) throw new Error('Could not load actions for the outcome sweep.');

  const actions = (actionRows ?? []) as SweepActionRow[];

  // Only actions that target a real per-player metric. When remeasure is off, we
  // skip rows already measured (first-pass only). Optionally restrict to a player
  // set (postgame).
  const playerFilter = opts.playerIds && opts.playerIds.length > 0
    ? new Set(opts.playerIds)
    : null;
  const todo = actions.filter(
    (a) =>
      a.player_id &&
      a.outcome_metric &&
      isBaseballMetricId(a.outcome_metric) &&
      (opts.remeasure ? true : a.outcome_observed_value == null) &&
      (playerFilter ? playerFilter.has(a.player_id) : true),
  );
  if (todo.length === 0) return { evaluated: actions.length, measured: 0 };

  const playerIds = Array.from(new Set(todo.map((a) => a.player_id!).filter(Boolean)));
  // #379 Phase 4b: the pool comes from the shared engine stat-row read —
  // canonical box-score rows (normalized onto the loader shape, source-table
  // tagged) reconciled over the legacy flat rows per the precedence rule, with
  // the same pagination + stable ordering the direct read used (the old
  // `.limit(4000)` was silently capped at PostgREST's 1000 max_rows). Identical
  // to the engine-run + baseline reads, keeping baseline/observed
  // apples-to-apples.
  const { data: statRows } = await loadEngineStatRows(supabase, teamId, playerIds);
  const pool: BoxScoreRow[] = statRows ?? [];

  // Index the pool by player once so the per-action after-window filter is cheap.
  const byPlayer = new Map<string, BoxScoreRow[]>();
  for (const r of pool) {
    if (!r.player_id) continue;
    const list = byPlayer.get(r.player_id);
    if (list) list.push(r);
    else byPlayer.set(r.player_id, [r]);
  }

  // #852 residual: event-derived velocity, scoped to the SAME after-window
  // honesty rule as the box-score pool below (measured strictly AFTER the
  // action's created_at). ALL-OR-NOTHING: an event-read failure leaves
  // eventRows null, so every action's `eventDerivedForPlayer` below resolves
  // to no event data (legacy scalar fallback for every player this pass) --
  // never a partial event/legacy blend (mirrors loadEngineStatRows's own rule).
  const { data: eventRows }: { data: EngineEventRows | null } = await loadEngineEventRows(supabase, teamId);

  const nowIso = new Date().toISOString();
  let measured = 0;
  // Signal ids whose linked action's target metric IMPROVED this pass — used to
  // transition the SOURCE insight's lifecycle_state -> 'resolved' (orthogonal to
  // the coach's own status). This closes source → signal → action → outcome:
  // the engine recognizes "the thing we flagged actually got better".
  const improvedSignalIds = new Set<string>();
  for (const a of todo) {
    const metric = a.outcome_metric as BaseballMetricId;

    // AFTER window = sessions strictly after the action was created. This is the
    // honesty hinge: we measure the metric on what happened SINCE the action, so
    // a one-game window is genuinely too_early. Rows with no session_date are
    // excluded from the after-window (they cannot be placed relative to the
    // action) rather than silently inflating the sample.
    const createdAt = a.created_at ?? null;
    const playerRows = byPlayer.get(a.player_id!) ?? [];
    const afterRows = createdAt
      ? playerRows.filter((r) => !!r.session_date && r.session_date > createdAt)
      : // No created_at (legacy row): fall back to the full pool but the verdict
        // still gates on the resulting sample (honest, just less precise).
        playerRows;

    // Event rows get the SAME after-window filter (measured_at strictly after
    // created_at) so an event-derived velocity metric is apples-to-apples with
    // the box-score after-window above -- a pre-action pitch/batted-ball must
    // never count toward "did it move" measurement.
    const afterPitches = eventRows
      ? createdAt
        ? eventRows.pitches.filter((p) => !!p.measured_at && p.measured_at > createdAt)
        : eventRows.pitches
      : [];
    const afterBattedBalls = eventRows
      ? createdAt
        ? eventRows.battedBalls.filter((b) => !!b.measured_at && b.measured_at > createdAt)
        : eventRows.battedBalls
      : [];
    const eventDerivedForPlayer = eventRows
      ? eventDerivedVelocityForPlayer(a.player_id!, afterPitches, afterBattedBalls)
      : null;

    const loaded = loadPlayerMetrics(a.player_id!, afterRows, nowIso, eventDerivedForPlayer);
    const lm = loaded.metrics[metric];
    const observed = lm?.value ?? null;
    const afterSampleN = lm?.sample_n ?? 0;
    const hasBaseline = a.outcome_baseline_value != null;
    const hasBaselineAndObserved = hasBaseline && observed != null;

    // Improvement-SIGNED movement — registry resolves the sign; a workload
    // (neutral_threshold) metric yields sign 0 → null movement (no "better").
    const sign = baseballImprovementSign(metric);
    let signedMovement: number | null = null;
    if (observed != null && hasBaseline && sign !== 0) {
      signedMovement = (observed - (a.outcome_baseline_value as number)) * sign;
    }
    const verdict = outcomeVerdictFor(signedMovement, afterSampleN, hasBaselineAndObserved);

    const { error } = await supabase
      .from('baseball_actions')
      .update({
        outcome_observed_value: observed,
        outcome_sample_n: afterSampleN,
        outcome_movement: signedMovement,
        outcome_verdict: verdict,
        outcome_recorded_at: nowIso,
      })
      .eq('id', a.id)
      .eq('team_id', teamId);
    if (!error) {
      measured += 1;
      if (verdict === 'improved' && a.signal_id) improvedSignalIds.add(a.signal_id);
    }
  }

  // RESOLVE SOURCE INSIGHTS for actions whose target metric improved. The link
  // chain is action.signal_id → baseball_signals.id, and a signal shares its
  // dedupe_key with the originating baseball_coach_insights row. We resolve the
  // INSIGHT lifecycle (engine-owned data state), NEVER the coach_status (coach
  // judgment) — the two stay orthogonal. Honesty rules:
  //   * Only ACTIVE, non-terminal lifecycle insights transition (we never reopen
  //     an archived/resolved row, and never touch one already addressed/resolved).
  //   * Non-destructive: a single in-place UPDATE; nothing is deleted.
  //   * Best-effort: a failure here never fails the measurement pass.
  if (improvedSignalIds.size > 0) {
    const { data: sigRows } = await supabase
      .from('baseball_signals')
      .select('id, dedupe_key')
      .eq('team_id', teamId)
      .in('id', Array.from(improvedSignalIds));
    const dedupeKeys = Array.from(
      new Set(
        ((sigRows ?? []) as Array<{ dedupe_key: string | null }>)
          .map((s) => s.dedupe_key)
          .filter((k): k is string => !!k),
      ),
    );
    if (dedupeKeys.length > 0) {
      await supabase
        .from('baseball_coach_insights')
        .update({ lifecycle_state: 'resolved', resolved_at: nowIso })
        .eq('team_id', teamId)
        .in('dedupe_key', dedupeKeys)
        .eq('status', 'active')
        .in('lifecycle_state', ['tentative', 'detected', 'matured']);
    }
  }

  return { evaluated: actions.length, measured };
}
