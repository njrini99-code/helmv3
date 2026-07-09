import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayMyDevelopment, type FocusAreaCardData } from '@/components/fairway';
import type { AreaAutoFillStats } from '@/lib/coachhelm/focus-areas/catalog';
import {
  loadActiveGoals,
  loadPendingGoalSuggestions,
  loadRecentlyAchievedGoals,
} from '@/lib/coachhelm/v3/goals/loader';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { evaluateAndPersistGoals, evaluateAndPersistFocusAreas } from '@/lib/golf/progress-drivers';
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import type { GoalSuggestionView } from '@/components/fairway/pages/coachhelm/GoalsSection';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { getPlayerCausalRelationships } from '@/app/golf/actions/causal-relationships';

export const metadata: Metadata = {
  title: 'My Development | Helm Golf',
  description: 'View your development plans and focus areas assigned by your coach.',
};

export const revalidate = 60;

export default async function MyDevelopmentPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { player } = session;
  if (!player) redirect('/golf/dashboard');

  const supabase = await createClient();

  // Fetch focus areas for this player.
  // Selects progress_notes (drives the FocusAreaCard Sparkline) and
  // from_review_id / from_insight_id / review_context (drive the SourceChip
  // drill-back — from_review_id resolves to the round review via
  // golf_round_reviews.round_id inside FocusAreaCard).
  const { data: focusAreas, error: focusAreasError } = await supabase
    .from('golf_player_focus_areas')
    .select(`
      id,
      area_type,
      title,
      description,
      status,
      target_metric,
      current_value,
      target_value,
      target_kind,
      target_date,
      target_rounds,
      started_at,
      completed_at,
      created_at,
      from_review_id,
      from_insight_id,
      review_context,
      progress_notes
    `)
    .eq('player_id', player.id)
    .order('created_at', { ascending: false });

  // Map progress_notes ({ entries: [{ at, value, note }] }) → the card's
  // progressHistory shape (oldest→newest). Honest-empty when absent/malformed.
  const progressHistoryOf = (
    raw: unknown,
  ): { at: string; value: number; note?: string }[] => {
    const entries = (raw as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(
        (e): e is { at: string; value: number; note?: string } =>
          Boolean(e) &&
          typeof (e as { at?: unknown }).at === 'string' &&
          typeof (e as { value?: unknown }).value === 'number',
      )
      .map(e => ({ at: e.at, value: e.value, note: e.note }));
  };

  // Resolve from_review_id (golf_round_reviews.id) → round_id so the
  // FocusAreaCard SourceChip "From a round review" link targets the round-review
  // route, which is keyed by ROUND id (C6/F074).
  const reviewIds = Array.from(
    new Set(
      (focusAreas || [])
        .map(fa => fa.from_review_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const roundIdByReviewId: Record<string, string> = {};
  if (reviewIds.length > 0) {
    const { data: reviewRows } = await supabase
      .from('golf_round_reviews')
      .select('id, round_id')
      .in('id', reviewIds);
    for (const row of reviewRows || []) {
      if (row.round_id) roundIdByReviewId[row.id] = row.round_id;
    }
  }

  const focusAreasWithHistory = (focusAreas || []).map(fa => ({
    ...fa,
    progressHistory: progressHistoryOf(fa.progress_notes),
    from_review_round_id: fa.from_review_id
      ? roundIdByReviewId[fa.from_review_id] ?? null
      : null,
  }));

  // Partition into active (active / in_progress / paused) and completed. The
  // 'paused' bucket was previously dropped (C5/F126) — a paused focus area is
  // still in flight, so it belongs with the active set, not silently hidden.
  const activeAreas = focusAreasWithHistory.filter(
    fa => fa.status === 'active' || fa.status === 'in_progress' || fa.status === 'paused',
  );
  const completedAreas = focusAreasWithHistory.filter(fa => fa.status === 'completed');
  // Coach-PRESCRIBED areas awaiting the player's decision (accept → active /
  // decline → declined). Surfaced first so the player can act on them.
  const proposedAreas = focusAreasWithHistory.filter(fa => fa.status === 'proposed');

  // The warm player "My Development" list (player CoachHelmShell variant). It
  // receives the SAME pre-computed active/completed partition; cards render
  // REAL source-chip Links + a per-area Sparkline (honest InsufficientData
  // when thin), with a real error state distinct from empty. The write
  // actions (updateFocusAreaProgress / completeFocusArea) are reused
  // UNCHANGED.

  // ── Track-progress wiring (P1-07) ──────────────────────────────────────
  // Recompute each active goal's observed snapshot + state from the latest
  // standing BEFORE loading them, so progress bars reflect REAL movement
  // instead of a frozen baseline. Idempotent per UTC day (the evaluator
  // dedupes same-day snapshots), so it's safe on every view; failures are
  // swallowed so a standing hiccup never blanks the development page.
  try {
    await Promise.all([
      evaluateAndPersistGoals(player.id),
      // Focus-area progress: window each active area's metric over the rounds
      // played since it started so the bar reflects reality, not the value set
      // at creation. Best-effort, same as goals.
      evaluateAndPersistFocusAreas(player.id),
    ]);
  } catch {
    /* progress refresh is best-effort; fall through to the last-known goals */
  }

  // ── v3 data layers (Goals + Standing) ──────────────────────────────────
  const [activeGoals, achievedGoals, suggestions, standingMap, causalRelationships, statsRow] =
    await Promise.all([
      loadActiveGoals(player.id),
      loadRecentlyAchievedGoals(player.id),
      loadPendingGoalSuggestions(player.id, 5),
      loadPlayerStandingMap(player.id),
      getPlayerCausalRelationships(player.id),
      // The player's cached stats — drives the create-focus-area modal's
      // real-value display + smart target suggestion (same source + friendly
      // mapping as the coach development page). All nullable → honest-empty.
      supabase
        .from('golf_player_stats_cache')
        .select(
          'rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, best_round, driving_distance_average, approach_proximity_average, scrambling_percentage, up_and_down_percentage, sand_save_percentage, one_putt_percentage, three_putt_percentage, par3_average, par4_average, par5_average',
        )
        .eq('player_id', player.id)
        .maybeSingle(),
    ]);
  const sr = statsRow.data;
  const myStats: AreaAutoFillStats = {
    rounds_played: sr?.rounds_played ?? 0,
    avg_score: sr?.scoring_average ?? null,
    avg_putts: sr?.putts_per_round ?? null,
    fairway_pct: sr?.driving_accuracy_percentage ?? null,
    gir_pct: sr?.gir_percentage ?? null,
    best_score: sr?.best_round ?? null,
    driving_distance: sr?.driving_distance_average ?? null,
    proximity_to_hole: sr?.approach_proximity_average ?? null,
    scrambling_pct: sr?.scrambling_percentage ?? null,
    up_and_down_pct: sr?.up_and_down_percentage ?? null,
    sand_save_pct: sr?.sand_save_percentage ?? null,
    one_putt_pct: sr?.one_putt_percentage ?? null,
    three_putt_pct: sr?.three_putt_percentage ?? null,
    par3_avg: sr?.par3_average ?? null,
    par4_avg: sr?.par4_average ?? null,
    par5_avg: sr?.par5_average ?? null,
  };
  const goalCards: FairwayGoalCardData[] = activeGoals.map((g) => ({
    goal: g,
    standing: standingMap.get(g.metric_id) ?? null,
  }));
  const achievedCards: FairwayGoalCardData[] = achievedGoals.map((g) => ({
    goal: g,
    standing: standingMap.get(g.metric_id) ?? null,
  }));
  const suggestionViews: GoalSuggestionView[] = suggestions.map((s) => {
    const cfg = getMetricRenderConfig(s.metric_id);
    return {
      suggestion: s,
      display_label: cfg?.display_label ?? s.metric_id,
      unit: cfg?.unit ?? 'count',
    };
  });
  const standingByMetric = Object.fromEntries(standingMap) as Record<
    string,
    PlayerStanding
  >;

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayMyDevelopment
        activeAreas={activeAreas as FocusAreaCardData[]}
        completedAreas={completedAreas as FocusAreaCardData[]}
        proposedAreas={proposedAreas as FocusAreaCardData[]}
        playerId={player.id}
        playerStats={myStats}
        loadError={Boolean(focusAreasError)}
        goals={goalCards}
        suggestions={suggestionViews}
        standingByMetric={standingByMetric}
        causalRelationships={causalRelationships}
        achievedGoals={achievedCards}
      />
    </div>
  );
}
