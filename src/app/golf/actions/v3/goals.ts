'use server';

/**
 * v3 Goals server actions (W19).
 *
 * RLS handles authz; these actions resolve the auth user and write
 * through the standard server-side Supabase client.
 *
 * Soft-cap discipline: when a player creates a 6th active goal, the
 * action succeeds but returns `{ ok: true, warning: 'soft_cap_exceeded' }`
 * so the UI can surface a non-blocking warning per locked decision.
 */

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { ACTIVE_GOAL_SOFT_CAP } from '@/lib/coachhelm/v3/goals/types';
import type {
  GoalCoachAssignmentMode,
  GoalOrigin,
  GoalTargetSource,
} from '@/lib/coachhelm/v3/goals/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { loadStandingForMetric } from '@/lib/coachhelm/v3/standing/loader';
import { validateCoachTeamAccess } from '@/lib/golf/resolve-team';
import { computeTargetValue } from '@/lib/coachhelm/v3/goals/suggestion-writer';
import {
  getMetricRenderConfig,
  type MetricRenderConfig,
} from '@/lib/coachhelm/v3/standing/metric-config';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

export interface CreateGoalInput {
  metric_id: MetricId;
  title: string;
  category: string;
  ends_at: string; // ISO timestamp
  target_value: number | null;
  target_source: GoalTargetSource | null;
  baseline_value: number | null;
  shared_with_coach?: boolean;
  // Coach-only inputs:
  team_id?: string | null;
  player_id_if_coach_creating?: string;
  coach_assignment_mode?: GoalCoachAssignmentMode;
  // Provenance — defaults to 'manual'. Engine-suggested acceptances pass
  // 'engine_suggested' + the originating suggestion's insight id so the goal
  // carries an auditable lineage (P1-07).
  origin?: GoalOrigin;
  origin_insight_id?: string | null;
}

export interface ActionResult {
  ok: boolean;
  warning?: 'soft_cap_exceeded';
  error?: string;
  goal_id?: string;
}

/**
 * Create a goal. Either:
 *  - Player creating for themselves (player_id derived from auth)
 *  - Coach creating for a player (coach_id + player_id_if_coach_creating)
 */
async function createGoalImpl(input: CreateGoalInput): Promise<ActionResult> {
  try {
    if (!isMetricId(input.metric_id)) {
      return { ok: false, error: 'Unknown metric_id' };
    }

    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return { ok: false, error: 'Unauthorized' };

    // Resolve creator role + player/coach IDs from session.
    const { data: playerRow } = await supabase
      .from('golf_players')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: coachRow } = await supabase
      .from('golf_coaches')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let creator_role: 'player' | 'coach';
    let player_id: string;
    let coach_id_if_assigned: string | null;
    let team_id: string | null = input.team_id ?? null;

    if (coachRow && input.player_id_if_coach_creating) {
      creator_role = 'coach';
      player_id = input.player_id_if_coach_creating;
      coach_id_if_assigned = coachRow.id;
      if (!team_id) {
        return { ok: false, error: 'Coach-created goal requires team_id' };
      }
    } else if (playerRow) {
      creator_role = 'player';
      player_id = playerRow.id;
      coach_id_if_assigned = null;
      // Try to derive team_id from active membership when not provided.
      if (!team_id) {
        const { data: m } = await supabase
          .from('golf_team_members')
          .select('team_id')
          .eq('player_id', playerRow.id)
          .eq('status', 'active')
          .maybeSingle();
        team_id = m?.team_id ?? null;
      }
    } else {
      return { ok: false, error: 'Not a player or coach' };
    }

    // Soft-cap check (non-blocking)
    let warning: ActionResult['warning'];
    const { count } = await supabase
      .from('golf_goals')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', player_id)
      .eq('state', 'active');
    if ((count ?? 0) >= ACTIVE_GOAL_SOFT_CAP) {
      warning = 'soft_cap_exceeded';
    }

    const insertPayload = {
      player_id,
      team_id,
      created_by_user_id: user.id,
      creator_role,
      coach_id_if_assigned,
      metric_id: input.metric_id,
      title: input.title,
      category: input.category,
      ends_at: input.ends_at,
      // Span of the goal in days (started_at defaults to now() in the DB), so
      // the card's "{window_days}-day window" sub-line is real, not "null-day".
      window_days: Math.max(
        1,
        Math.round((new Date(input.ends_at).getTime() - Date.now()) / 86_400_000),
      ),
      baseline_value: input.baseline_value,
      current_value: input.baseline_value, // start equal; cron updates
      target_value: input.target_value,
      target_source: input.target_source,
      // Coach-mandatory goals are auto-accepted on insert
      coach_assignment_mode: creator_role === 'coach' ? (input.coach_assignment_mode ?? 'suggested') : null,
      player_accepted_at:
        creator_role === 'coach' && input.coach_assignment_mode === 'mandatory'
          ? new Date().toISOString()
          : null,
      shared_with_coach: input.shared_with_coach ?? false,
      shared_at: input.shared_with_coach ? new Date().toISOString() : null,
      origin: input.origin ?? ('manual' as const),
      origin_insight_id: input.origin_insight_id ?? null,
    };

    const { data, error } = await supabase
      .from('golf_goals')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error || !data) {
      await logServerError(`createGoal failed: ${error?.message ?? 'no row'}`, {
        action: 'v3.goals.create',
      });
      return { ok: false, error: error?.message ?? 'Insert failed' };
    }

    revalidatePath('/golf/dashboard/my-development');
    revalidatePath('/golf/dashboard/coachhelm');
    return { ok: true, goal_id: data.id, warning };
  } catch (err) {
    await logServerError(
      `createGoal exception: ${describeError(err)}`,
      { action: 'v3.goals.create' },
    );
    return { ok: false, error: 'Unexpected error' };
  }
}

const observedCreateGoal = withAdminObserved(
  'createGoal',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  createGoalImpl,
);

export async function createGoal(input: CreateGoalInput): Promise<ActionResult> {
  return observedCreateGoal(input);
}

/* ───────────────────────────────────────────────────────────────────────────
 * Auto-fill engine — "choose a stat, the target fills in"
 * ----------------------------------------------------------------------------
 * The shared driver behind the create flow's auto-fill: given a metric, read
 * the player's LIVE standing and propose a target that aims halfway from their
 * current value to the Tour reference (computeTargetValue — the same midpoint
 * heuristic the engine's suggestion-writer uses, so manual + suggested goals
 * land on the same scale). Returns the baseline (current observed value) too,
 * so the create flow can stamp `baseline_value` and the progress track has a
 * real starting tick from day one.
 *
 * Honest: when the cron hasn't populated a standing row for the metric yet,
 * `hasStanding` is false and target/baseline are null — the UI then asks for a
 * manual target rather than inventing one. Player resolves their own standing;
 * a coach may pass an explicit `playerId` (coach-gated) to pre-fill a goal they
 * are assigning.
 * ────────────────────────────────────────────────────────────────────────── */

export interface GoalTargetSuggestion {
  ok: boolean;
  metric_id: MetricId;
  display_label: string;
  unit: MetricRenderConfig['unit'];
  direction: MetricRenderConfig['direction'];
  /** Whether a live standing reading exists to base a suggestion on. */
  hasStanding: boolean;
  /** The player's current observed value on this metric → the goal baseline. */
  baseline: number | null;
  /** The (gender-anchored) Tour reference for this metric. */
  pga_value: number | null;
  /** Midpoint-to-Tour suggested target, or null when no standing exists. */
  suggested_target: number | null;
}

async function suggestGoalTargetImpl(
  metricId: MetricId,
  opts?: { playerId?: string },
): Promise<GoalTargetSuggestion> {
  const cfg = getMetricRenderConfig(metricId);
  const base: GoalTargetSuggestion = {
    ok: false,
    metric_id: metricId,
    display_label: cfg?.display_label ?? metricId,
    unit: cfg?.unit ?? 'count',
    direction: cfg?.direction ?? 'higher_better',
    hasStanding: false,
    baseline: null,
    pga_value: null,
    suggested_target: null,
  };

  if (!isMetricId(metricId) || !cfg) return base;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return base;

    // Resolve the target player. Self by default; a coach may pass an explicit
    // playerId (coach-gated here; RLS still guards the eventual write).
    let playerId = opts?.playerId ?? null;
    if (!playerId) {
      const { data: playerRow } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      playerId = playerRow?.id ?? null;
    } else {
      const { data: coachRow } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!coachRow) return base; // only a coach may pre-fill another player's target
    }
    if (!playerId) return base;

    const standing = await loadStandingForMetric(playerId, metricId);
    if (!standing) return { ...base, ok: true };

    return {
      ...base,
      ok: true,
      hasStanding: true,
      baseline: standing.player_value,
      pga_value: standing.pga_value,
      suggested_target: computeTargetValue({
        playerValue: standing.player_value,
        pgaValue: standing.pga_value,
      }),
    };
  } catch (err) {
    await logServerError(
      `suggestGoalTarget exception: ${describeError(err)}`,
      { action: 'v3.goals.suggestTarget' },
    );
    return base;
  }
}

const observedSuggestGoalTarget = withAdminObserved(
  'suggestGoalTarget',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  suggestGoalTargetImpl,
);

export async function suggestGoalTarget(metricId: MetricId, opts?: { playerId?: string }): Promise<GoalTargetSuggestion> {
  return observedSuggestGoalTarget(metricId, opts);
}

/** Pause an active goal. Only the player or assigning coach can call. */
async function pauseGoalImpl(goalId: string): Promise<ActionResult> {
  return transitionGoal(goalId, 'paused');
}

const observedPauseGoal = withAdminObserved(
  'pauseGoal',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  pauseGoalImpl,
);

export async function pauseGoal(goalId: string): Promise<ActionResult> {
  return observedPauseGoal(goalId);
}

/** Abandon a goal (player gave up). Records reason if provided. */
async function abandonGoalImpl(goalId: string, reason?: string): Promise<ActionResult> {
  return transitionGoal(goalId, 'abandoned', reason);
}

const observedAbandonGoal = withAdminObserved(
  'abandonGoal',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  abandonGoalImpl,
);

export async function abandonGoal(goalId: string, reason?: string): Promise<ActionResult> {
  return observedAbandonGoal(goalId, reason);
}

/** Resume a paused goal back to active. */
async function resumeGoalImpl(goalId: string): Promise<ActionResult> {
  return transitionGoal(goalId, 'active');
}

const observedResumeGoal = withAdminObserved(
  'resumeGoal',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  resumeGoalImpl,
);

export async function resumeGoal(goalId: string): Promise<ActionResult> {
  return observedResumeGoal(goalId);
}

async function transitionGoal(
  goalId: string,
  newState: 'paused' | 'abandoned' | 'active',
  reason?: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const update: Record<string, unknown> = {
      state: newState,
      updated_at: new Date().toISOString(),
    };
    if (newState === 'abandoned' && reason) {
      update.player_decline_reason = reason;
      update.player_declined_at = new Date().toISOString();
    }
    // Resuming to active clears any terminal outcome stamp so a previously
    // achieved/paused goal doesn't keep flashing a stale "Hit [date]" banner.
    if (newState === 'active') {
      update.outcome_evaluated_at = null;
    }

    const { error } = await fromUntyped(supabase, 'golf_goals')
      .update(update)
      .eq('id', goalId);

    if (error) {
      return { ok: false, error: error.message };
    }
    revalidatePath('/golf/dashboard/my-development');
    revalidatePath('/golf/dashboard/coachhelm');
    return { ok: true, goal_id: goalId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Accept an engine-suggested goal — creates a real goal + marks the
 * suggestion accepted.
 */
async function acceptGoalSuggestionImpl(
  suggestionId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { data: sug, error: sugErr } = await supabase
      .from('golf_goal_suggestions')
      .select('*')
      .eq('id', suggestionId)
      .maybeSingle();
    if (sugErr || !sug) return { ok: false, error: 'Suggestion not found' };
    if (sug.state !== 'pending') return { ok: false, error: 'Suggestion already acted on' };

    if (!isMetricId(sug.metric_id)) {
      return { ok: false, error: 'Suggestion references unknown metric_id' };
    }

    const endsAt = new Date(Date.now() + sug.suggested_window_days * 86400_000).toISOString();
    const createResult = await createGoal({
      metric_id: sug.metric_id as MetricId,
      title: `Goal — ${sug.metric_id}`,
      category: 'engine_suggested',
      ends_at: endsAt,
      target_value: sug.suggested_target_value,
      target_source: 'midpoint',
      baseline_value: null,
      // Provenance (P1-07): mark the goal engine-suggested and carry the
      // suggestion's originating insight id so acceptance is auditable.
      origin: 'engine_suggested',
      origin_insight_id: sug.origin_insight_id ?? null,
    });
    // Transactional discipline (P1-07): only mark the suggestion accepted if
    // the goal row actually inserted. If createGoal failed, leave the suggestion
    // pending so the player can retry — never report a phantom acceptance.
    if (!createResult.ok) return createResult;

    await supabase
      .from('golf_goal_suggestions')
      .update({ state: 'accepted', acted_at: new Date().toISOString() })
      .eq('id', suggestionId);

    return createResult;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const observedAcceptGoalSuggestion = withAdminObserved(
  'acceptGoalSuggestion',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  acceptGoalSuggestionImpl,
);

export async function acceptGoalSuggestion(suggestionId: string): Promise<ActionResult> {
  return observedAcceptGoalSuggestion(suggestionId);
}

/** Dismiss a suggestion (player not interested). */
async function dismissGoalSuggestionImpl(
  suggestionId: string,
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Unauthorized' };

    const { error } = await supabase
      .from('golf_goal_suggestions')
      .update({ state: 'dismissed', acted_at: new Date().toISOString() })
      .eq('id', suggestionId);
    if (error) return { ok: false, error: error.message };

    revalidatePath('/golf/dashboard/coachhelm');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const observedDismissGoalSuggestion = withAdminObserved(
  'dismissGoalSuggestion',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  dismissGoalSuggestionImpl,
);

export async function dismissGoalSuggestion(suggestionId: string): Promise<ActionResult> {
  return observedDismissGoalSuggestion(suggestionId);
}

/* ───────────────────────────────────────────────────────────────────────────
 * createTeamGoal — a TEAM goal for a skill area, modeled as a FAN-OUT of
 * per-player golf_goals rows (one per targeted player). There is no
 * golf_team_goals table and golf_goals.player_id is NOT NULL, so fan-out is the
 * cheapest correct model: createGoal already coach-creates per player (RLS
 * validates each row: coach staffs team + player active), and the goal-progress
 * cron tracks every fanned row for free. Partial failures are reported, never
 * fatal — one inactive player can't abort the batch.
 * ────────────────────────────────────────────────────────────────────────── */

export interface CreateTeamGoalInput {
  metric_id: MetricId;
  title: string;
  /** Convention tag (no migration); defaults to 'team' so these read as a set. */
  category?: string;
  ends_at: string;
  /** Shared team target (e.g. derived from team_avg), or null to leave open. */
  target_value: number | null;
  target_source: GoalTargetSource | null;
  /** 'suggested' (player accepts) | 'mandatory' (auto-accepted). Default suggested. */
  coach_assignment_mode?: GoalCoachAssignmentMode;
  team_id: string;
  /** Players to assign (contributing/active members). */
  player_ids: string[];
  origin?: GoalOrigin;
}

export interface CreateTeamGoalResult {
  ok: boolean;
  created: number;
  failed: Array<{ player_id: string; error: string }>;
  warning?: 'soft_cap_exceeded';
  error?: string;
}

async function createTeamGoalImpl(input: CreateTeamGoalInput): Promise<CreateTeamGoalResult> {
  if (!isMetricId(input.metric_id)) {
    return { ok: false, created: 0, failed: [], error: 'Invalid metric' };
  }
  if (!input.team_id) {
    return { ok: false, created: 0, failed: [], error: 'Missing team' };
  }
  const ids = [...new Set(input.player_ids.filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, created: 0, failed: [], error: 'No players to assign' };
  }

  // Coach-team guard up front. createGoal resolves the coach from the session
  // and leans on RLS per row, but without this a *player* calling createTeamGoal
  // would silently fall into createGoal's player branch and mint self-goals.
  // Resolve + validate once here so the whole fan-out is coach-gated, not row-gated.
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, created: 0, failed: [], error: 'Unauthorized' };
  const { data: coach } = await sb
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) {
    return { ok: false, created: 0, failed: [], error: 'Only coaches can assign team goals' };
  }
  const allowed = await validateCoachTeamAccess(sb, coach.id, input.team_id, coach.organization_id);
  if (!allowed) {
    return { ok: false, created: 0, failed: [], error: 'Not authorized for this team' };
  }

  let created = 0;
  let warning: 'soft_cap_exceeded' | undefined;
  const failed: Array<{ player_id: string; error: string }> = [];

  // createGoal handles auth/RLS/soft-cap per call; loop it (team sizes are small).
  for (const pid of ids) {
    try {
      const res = await createGoal({
        metric_id: input.metric_id,
        title: input.title,
        category: input.category ?? 'team',
        ends_at: input.ends_at,
        target_value: input.target_value,
        target_source: input.target_source,
        baseline_value: null,
        team_id: input.team_id,
        player_id_if_coach_creating: pid,
        coach_assignment_mode: input.coach_assignment_mode ?? 'suggested',
        origin: input.origin ?? 'manual',
      });
      if (res.ok) {
        created += 1;
        if (res.warning === 'soft_cap_exceeded') warning = 'soft_cap_exceeded';
      } else {
        failed.push({ player_id: pid, error: res.error ?? 'Failed to create goal' });
      }
    } catch (err) {
      failed.push({ player_id: pid, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (created > 0) {
    revalidatePath('/golf/dashboard/development');
    revalidatePath('/golf/dashboard/intelligence');
  }
  return { ok: created > 0, created, failed, warning };
}

const observedCreateTeamGoal = withAdminObserved(
  'createTeamGoal',
  { sport: 'golf', feature: 'coachhelm_v3_goals' },
  createTeamGoalImpl,
);

export async function createTeamGoal(input: CreateTeamGoalInput): Promise<CreateTeamGoalResult> {
  return observedCreateTeamGoal(input);
}
