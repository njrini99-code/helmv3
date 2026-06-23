import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import {
  IconTarget,
  IconCheck,
  IconClock,
  IconWind,
  IconCrosshair,
  IconFlag,
  IconCircleDot,
  IconMap,
  IconBrain,
  IconDumbbell,
  IconClipboardList,
  IconActivity,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { LogProgressButton, MarkCompleteButton } from './LogProgressButton';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayMyDevelopment, type FocusAreaCardData } from '@/components/fairway';
import type { AreaAutoFillStats } from '@/lib/coachhelm/focus-areas/catalog';
import {
  loadActiveGoals,
  loadPendingGoalSuggestions,
  loadRecentlyAchievedGoals,
} from '@/lib/coachhelm/v3/goals/loader';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { evaluateAndPersistGoals } from '@/app/golf/actions/v3/goal-progress';
import { evaluateAndPersistFocusAreas } from '@/app/golf/actions/v3/focus-area-progress';
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

// ============================================================================
// AREA TYPE CONFIG (matches coach view, SVG icons)
// ============================================================================

interface AreaTypeConfig {
  label: string;
  icon: (props: { size?: number; className?: string }) => ReactNode;
  color: string;
  bgColor: string;
}

const AREA_TYPES: Record<string, AreaTypeConfig> = {
  driving: { label: 'Driving', icon: IconWind, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  iron_play: { label: 'Iron Play', icon: IconCrosshair, color: 'text-primary-600', bgColor: 'bg-primary-50' },
  short_game: { label: 'Short Game', icon: IconFlag, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  putting: { label: 'Putting', icon: IconCircleDot, color: 'text-violet-600', bgColor: 'bg-violet-50' },
  course_management: { label: 'Course Mgmt', icon: IconMap, color: 'text-teal-600', bgColor: 'bg-teal-50' },
  mental_game: { label: 'Mental Game', icon: IconBrain, color: 'text-rose-600', bgColor: 'bg-rose-50' },
  fitness: { label: 'Fitness', icon: IconDumbbell, color: 'text-orange-600', bgColor: 'bg-orange-50' },
  other: { label: 'Other', icon: IconClipboardList, color: 'text-warm-600', bgColor: 'bg-warm-50' },
};

const DEFAULT_AREA: AreaTypeConfig = AREA_TYPES.other!;

const STATUS_CONFIG: Record<string, { label: string; color: string; borderColor: string }> = {
  active: { label: 'Active', color: 'bg-primary-50 text-primary-700', borderColor: 'border-primary-200' },
  in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-700', borderColor: 'border-blue-200' },
  completed: { label: 'Completed', color: 'bg-warm-50 text-warm-600', borderColor: 'border-warm-200' },
  paused: { label: 'Paused', color: 'bg-amber-50 text-amber-700', borderColor: 'border-amber-200' },
};

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

  // ── Thin flag fork (ADDITIVE) ──────────────────────────────────────────────
  // Flag ON → the warm player "My Development" list (player CoachHelmShell
  // variant). It receives the SAME pre-computed active/completed partition; cards
  // render REAL source-chip Links + a per-area Sparkline (honest InsufficientData
  // when thin), with a real error state distinct from empty. The write actions
  // (updateFocusAreaProgress / completeFocusArea) are reused UNCHANGED. Flag OFF
  // (default) → the legacy AREA_TYPES/STATUS_CONFIG card markup renders as today.
  if (isRedesignEnabled()) {
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

    // ── v3 data layers (Goals + Standing) — read ONLY inside the flag fork ──
    // The flag-OFF legacy branch below never touches these loaders.
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

  const getProgressPercent = (current: number | null, target: number | null, targetMetric?: string | null) => {
    if (current == null || target == null || target === 0) return 0;

    // For "lower is better" metrics (e.g., putts, penalties, score), progress means
    // the current value has decreased toward (or past) the target.
    const lowerIsBetterKeywords = ['putt', 'penalty', 'bogey', 'score', 'three_putt'];
    const isLowerBetter = lowerIsBetterKeywords.some(kw =>
      (targetMetric ?? '').toLowerCase().includes(kw)
    );

    // For lower-is-better: show how close current is to target
    // If current <= target, progress = 100% (goal met)
    // If current > target, progress = target / current * 100 (percentage of way there)
    if (isLowerBetter) {
      if (current <= target) return 100;
      return Math.round((target / current) * 100);
    }

    if (target < 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
  };

  return (
    <AnimatedPage className="min-h-full">
      <AnimatedItem>
        <LargeTitleHeader
          title="My Development"
          subtitle="Focus areas assigned by your coach to help you improve"
          belowContent={
            (focusAreas || []).length > 0 ? (
              <div className="flex items-center gap-6 pt-4 border-t border-warm-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary-500" />
                  <span className="text-sm text-warm-600">
                    <span className="font-medium text-warm-900">{activeAreas.length}</span> Active
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-warm-300" />
                  <span className="text-sm text-warm-600">
                    <span className="font-medium text-warm-900">{completedAreas.length}</span> Completed
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <IconActivity size={14} className="text-warm-400" />
                  <span className="text-sm text-warm-600">
                    <span className="font-medium text-warm-900">{(focusAreas || []).length}</span> Total
                  </span>
                </div>
              </div>
            ) : undefined
          }
        />
      </AnimatedItem>

      <AnimatedItem>
        <div className="max-w-[720px] mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Editorial hero band — frames the focus area list beneath the
            sticky title header in the magazine-cover rhythm. */}
        <Reveal>
          <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
            <PageHeader
              eyebrow="My Development"
              eyebrowAccent="primary"
              title="Your focus areas."
              subtitle={
                (focusAreas || []).length === 0
                  ? 'Your coach will assign focus areas to track your improvement.'
                  : `${activeAreas.length} active · ${completedAreas.length} completed.`
              }
            />
          </div>
        </Reveal>

        {(focusAreas || []).length === 0 ? (
          <div className="relative surface-matte rounded-3xl overflow-clip p-8 md:p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconTarget size={28} className="text-warm-400" />
            </div>
            <h3 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-2">No Development Plans Yet</h3>
            <p className="text-warm-500 max-w-sm mx-auto mb-4">
              Your coach hasn&apos;t assigned any focus areas yet. Check back later or talk to your coach about your development goals.
            </p>
            <a
              href="/golf/dashboard/messages"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
            >
              Message Coach
            </a>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Focus Areas */}
            {activeAreas.length > 0 && (
              <div>
                <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-4 flex items-center gap-2">
                  <IconClock size={20} className="text-primary-600" />
                  Active Focus Areas
                  <span className="ml-auto text-sm font-normal text-warm-400">
                    {activeAreas.length} {activeAreas.length === 1 ? 'area' : 'areas'}
                  </span>
                </h2>
                <div className="space-y-4 mobile-stagger">
                  {activeAreas.map((fa) => {
                    const areaConfig = AREA_TYPES[fa.area_type || 'other'] ?? DEFAULT_AREA;
                    const progress = getProgressPercent(fa.current_value, fa.target_value, fa.target_metric);
                    const statusConfig = STATUS_CONFIG[fa.status || 'active'] ?? STATUS_CONFIG.active!;
                    const AreaIcon = areaConfig.icon;

                    return (
                      <div
                        key={fa.id}
                        className="relative surface-matte rounded-3xl overflow-clip hover:shadow-md transition-shadow"
                      >
                        {/* Colored top accent */}
                        <div className={cn('h-1', areaConfig.bgColor)} />
                        <div className="p-6">
                          <div className="flex items-start gap-4">
                            <div className={cn(
                              'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                              areaConfig.bgColor
                            )}>
                              <AreaIcon size={22} className={areaConfig.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-medium text-warm-900 line-clamp-2">{fa.title || 'Untitled'}</h3>
                                  <p className={cn('text-sm font-medium mt-0.5', areaConfig.color)}>
                                    {areaConfig.label}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    'flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-full border whitespace-nowrap',
                                    statusConfig.color,
                                    statusConfig.borderColor
                                  )}
                                >
                                  {statusConfig.label}
                                </span>
                              </div>

                              {fa.description && (
                                <p className="text-sm text-warm-600 mt-3 leading-relaxed">{fa.description}</p>
                              )}

                              {/* Source chip — surfaces WHY this focus area
                                  exists (came from a round review or a
                                  CoachHelm insight) instead of looking like
                                  a coach-imposed task with no context. */}
                              {(fa.from_review_id || fa.from_insight_id) && (
                                <div className="mt-3 flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 text-eyebrow font-medium px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200">
                                    {fa.from_review_id ? 'From a round review' : 'From a CoachHelm insight'}
                                  </span>
                                  {fa.review_context && (
                                    <span className="text-eyebrow text-warm-500 truncate">
                                      {fa.review_context}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Progress bar if metrics exist */}
                              {fa.target_value != null && fa.target_value > 0 && (
                                <div className="mt-5">
                                  <div className="flex items-center justify-between text-sm mb-2">
                                    <span className="text-warm-500 font-medium">
                                      {fa.target_metric || 'Progress'}
                                    </span>
                                    <span className="font-medium text-warm-700">
                                      {fa.current_value ?? 0}
                                      <span className="text-warm-400 font-normal mx-1">/</span>
                                      {fa.target_value}
                                      {progress > 0 && (
                                        <span className={cn(
                                          'ml-2 text-xs font-medium px-1.5 py-0.5 rounded',
                                          progress >= 100 ? 'bg-primary-100 text-primary-700' :
                                          progress >= 50 ? 'bg-blue-100 text-blue-700' :
                                          'bg-warm-100 text-warm-600'
                                        )}>
                                          {progress}%
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="h-2.5 bg-warm-100 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        'h-full rounded-full transition-all duration-700 ease-out',
                                        progress >= 100
                                          ? 'bg-gradient-to-r from-primary-500 to-primary-400'
                                          : progress >= 50
                                            ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                                            : 'bg-gradient-to-r from-warm-400 to-warm-300'
                                      )}
                                      style={{ width: `${Math.min(progress, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Date */}
                              {fa.started_at && (
                                <p className="text-xs text-warm-400 mt-4">
                                  Started {new Date(fa.started_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                </p>
                              )}

                              {/* Player actions: log progress + mark complete */}
                              <div className="flex flex-wrap items-center gap-2 mt-4">
                                <LogProgressButton
                                  focusAreaId={fa.id}
                                  focusAreaTitle={fa.title || 'Focus area'}
                                  targetMetric={fa.target_metric ?? null}
                                  currentValue={fa.current_value ?? null}
                                  targetValue={fa.target_value ?? null}
                                />
                                <MarkCompleteButton
                                  focusAreaId={fa.id}
                                  focusAreaTitle={fa.title || 'Focus area'}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed Focus Areas */}
            {completedAreas.length > 0 && (
              <div>
                <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em] mb-4 flex items-center gap-2">
                  <IconCheck size={20} className="text-warm-500" />
                  Completed
                  <span className="ml-auto text-sm font-normal text-warm-400">
                    {completedAreas.length} {completedAreas.length === 1 ? 'area' : 'areas'}
                  </span>
                </h2>
                <div className="space-y-3">
                  {completedAreas.map((fa) => {
                    const areaConfig = AREA_TYPES[fa.area_type || 'other'] ?? DEFAULT_AREA;
                    const AreaIcon = areaConfig.icon;

                    return (
                      <div
                        key={fa.id}
                        className="relative bg-cream-100/60 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-clip"
                      >
                        <div className="p-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center flex-shrink-0">
                              <AreaIcon size={18} className="text-warm-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-warm-700 truncate">{fa.title || 'Untitled'}</h3>
                              <p className="text-xs text-warm-400 mt-0.5">{areaConfig.label}</p>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 border border-primary-200">
                              <IconCheck size={14} className="text-primary-600" />
                              <span className="text-xs font-medium text-primary-700">Complete</span>
                            </div>
                            {fa.completed_at && (
                              <span className="text-xs text-warm-400">
                                {new Date(fa.completed_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
