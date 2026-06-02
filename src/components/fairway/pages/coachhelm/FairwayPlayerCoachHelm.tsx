'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayPlayerCoachHelm — the PLAYER COCKPIT front door
 * ----------------------------------------------------------------------------
 * The player's single answer to "what do I work on today" — but read as a
 * premium performance COCKPIT, not a stack of equal cards. The data-viz IS the
 * hero art. A PRESENTATION + LAYOUT rebuild ONLY: it imports + reuses the
 * EXISTING loaders/feedback handlers verbatim and keeps the heavy V3 panels
 * (HeroNarrativeCard / FocusAreasGrid / PerformancePrediction / CompositeRating
 * Card / TrendDashboard / ShotAnalysisCard / WhatIfPanel) mounted UNCHANGED.
 *
 * ── THE READ (organized, clearly-ranked, live) — FLAT APPLE ─────────────────
 *   PRIMARY (focal, flat matte) — "Your edge this week": the top evidence
 *     insight on a calm flat hero. A big Fragment-Mono number reads the player's
 *     KEY GAME NUMBER (their team percentile / measured value, straight off the
 *     insight evidence) with a small uppercase label — NO gauge, NO arc, NO
 *     needle — plus the LLM HeroNarrativeCard body and the RESERVED "Ask
 *     CoachHelm about this" entry.
 *   SECONDARY rail — the PERFORMANCE-PREDICTION readout cluster: a big mono
 *     Readout of the predicted scoring number + a flat model-confidence Readout
 *     (NO dial). The reused PerformancePrediction panel sits below it as the
 *     fuller read (UNCHANGED).
 *   FLAT CHART — the GAME-STRENGTH radar (GenomeRadar) built from the real shot-
 *     analytics snapshot (driving / approach / around-green / putting), rendered
 *     BARE inside its panel. Honest awaiting when the rounds aren't there yet.
 *   TERTIARY foot row — micro Readouts: rounds analyzed, fairways %, GIR %,
 *     putts / round — each honest-awaiting when starved (never a fake 0).
 *
 *   BELOW the cockpit — the secondary insight FEED (expanding in place via
 *   InsightPanel, never a navigation tease), the focus-area grid, then the
 *   game-profile + trend panels, then the collapsible deep dive.
 *
 * ── PRESERVED LOGIC (imported / reused, never rewritten) ────────────────────
 *   • Parallel fetch results passed in by the route page (props only; no fetch).
 *   • rateInsightAsPlayer (player-feedback.ts) feedback round-trip + toasts.
 *   • getPlayerWhatIf scenario simulation (passed to the reused WhatIfPanel).
 *   • generateHeroNarrative LLM call (reused via HeroNarrativeCard grounding).
 *
 * ── HONESTY ─────────────────────────────────────────────────────────────────
 * A starved figure becomes a DIM instrument that reads "awaiting signal — N of
 * M", never an authoritative 0 or a fabricated line. Untrusted strings in data
 * are rendered as text, never interpreted.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork. Renders
 * inside the `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Settings,
  ChartLine,
  Lightbulb,
  ChevronDown,
} from 'lucide-react';

import { fairwayScope, isThemesEnabled } from '@/lib/redesign/flag';
import {
  Button,
  InsightCard,
  InsightPanel,
  type InsightPanelAction,
  Surface,
  EmptyState,
  InsufficientData,
  // ── The flat cockpit kit (flat readouts + the bare GenomeRadar) ───────────
  InstrumentPanel,
  InstrumentCluster,
  Readout,
  GenomeRadar,
  type GenomeAxis,
  formatPercent,
} from '@/components/fairway';
import { CoachHelmShell } from './CoachHelmShell';
import { StandingStrip } from '@/components/fairway/charts/StandingStrip';
import { PracticeRxPanel } from '@/components/fairway/pages/coachhelm/PracticeRxPanel';
import { ThemesPanel } from '@/components/fairway/cards-insight/themes';
import { m, useReducedMotion } from 'framer-motion';

// Standing wiring — sourced ONLY from golf_player_standing (the insight evidence
// has no standing block). The insight→standing link is evidence.metric WHEN it
// is a canonical MetricId (getMetricRenderConfig non-null).
import { getMetricRenderConfig } from '@/lib/coachhelm/v3/standing/metric-config';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

// PRESERVED reused components (V3 panels) — embedded UNCHANGED. They own their
// own inputs/handlers (what-if simulation, shot analysis, prediction render).
import { HeroNarrativeCard } from '@/components/golf/coachhelm/v3/HeroNarrativeCard';
import {
  PerformancePrediction,
  FocusAreasGrid,
} from '@/components/golf/coachhelm/player';
import { CompositeRatingCard } from '@/components/golf/coachhelm/player/CompositeRatingCard';
import { TrendDashboard } from '@/components/golf/coachhelm/player/TrendDashboard';
import { ShotAnalysisCard } from '@/components/golf/coachhelm/player/ShotAnalysisCard';
import { WhatIfPanel } from '@/components/golf/coachhelm/player/WhatIfPanel';

// PRESERVED write/feedback action — imported UNCHANGED.
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
import { getPlayerWhatIf } from '@/app/golf/actions/coachhelm-data';
// THEME "make it a plan" (player path) — create a self-set development goal.
import { createGoal } from '@/app/golf/actions/v3/goals';
import { computeTargetValue } from '@/lib/coachhelm/v3/goals/suggestion-writer';
import { isMetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { useToast } from '@/components/ui/sonner';

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerCoachHelmDashboardData } from '@/app/golf/actions/insights';
import type { PlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
import type { InsightPriority } from '@/components/fairway';
import type { CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';

/* ───────────────────────────────────────────────────────────────────────────
 * Honesty thresholds — deterministic product rules (resolved decisions).
 *  • the game-strength radar / overview tiles need ≥ 3 analyzed rounds.
 *  • a prediction needs a finite predicted value before it reads a number.
 * ────────────────────────────────────────────────────────────────────────── */
const OVERVIEW_MIN_ROUNDS = 3;

/* ───────────────────────────────────────────────────────────────────────────
 * Props — the SAME data the route page already fetches in parallel. This
 * component does NOT fetch; it mirrors the legacy PlayerCoachHelmDashboard
 * props exactly so the route fork can pass them through unchanged.
 * ────────────────────────────────────────────────────────────────────────── */

export interface FairwayPlayerCoachHelmProps {
  data: PlayerCoachHelmDashboardData;
  playerId: string;
  initialShotAnalytics?: PlayerShotAnalytics | null;
  /** V3 optional data — null degrades to honest InsufficientData (not a shell). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trendData?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shotData?: Record<string, any> | null;
  /** The single highest-impact evidence-backed insight — the hero. */
  topInsight?: EvidenceInsight | null;
  /** The rest of the evidence feed (deduped against the hero below). */
  secondaryInsights?: EvidenceInsight[];
  /**
   * Per-metric standing snapshots (you vs team vs PGA), keyed by metric_id.
   * A plain Record (NOT a Map) so it serializes across the server→client
   * boundary. Sourced from golf_player_standing — NEVER from insight.evidence.
   * Default `{}` (honest-empty: no standing → no strip, the hero falls through
   * to its existing flat-number read).
   */
  standingByMetric?: Record<string, PlayerStanding>;
  /**
   * The hierarchical THEME scaffold (THEME → CAUSE → DRIVER → PLAN). When the
   * themes flag is on AND this is non-empty, it REPLACES the flat secondary
   * feed; otherwise the flat feed renders (kill-switch + empty-themes fallback).
   * Default `[]` (honest-empty: degrades to the flat feed).
   */
  themes?: ThemeNode[];
}

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Map the insight-delivery priority union onto the InsightCard vocabulary. */
function toInsightPriority(p: EvidenceInsight['priority']): InsightPriority {
  switch (p) {
    case 'urgent':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

/** A human overline for an insight (category · "Signal"). */
function insightOverline(i: EvidenceInsight): string {
  const cat = i.category
    ? i.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Insight';
  return `${cat} · Signal`;
}

/** Pull a team-percentile from the evidence standing block, if present. */
function teamPctOf(i: EvidenceInsight): number | null {
  const standing = (i.evidence as { standing?: { team_pct?: number | null } })
    .standing;
  return standing?.team_pct ?? null;
}

/** Round a finite number to one decimal, or null when not measurable. */
function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** A 0..100 percentile rank as an ordinal string: 82 → "82nd", 100 → "100th". */
function ordinalRank(n: number): string {
  const v = n % 100;
  const suffix = ['th', 'st', 'nd', 'rd'];
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

/* ───────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export function FairwayPlayerCoachHelm({
  data,
  playerId,
  initialShotAnalytics,
  profileData,
  trendData,
  shotData,
  topInsight = null,
  secondaryInsights = [],
  standingByMetric = {},
  themes = [],
}: FairwayPlayerCoachHelmProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [, startMakePlanTransition] = useTransition();
  const [makePlanPendingId, setMakePlanPendingId] = useState<string | null>(null);

  // Which secondary insight is expanded in place (kills the View-N-more dead-end).
  const [openInsight, setOpenInsight] = useState<EvidenceInsight | null>(null);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<'shot-analysis' | 'what-if'>(
    'shot-analysis',
  );

  // Dedupe — the top insight may also appear in the secondary feed.
  const secondaryDeduped = useMemo(
    () => secondaryInsights.filter((i) => !topInsight || i.id !== topInsight.id),
    [secondaryInsights, topInsight],
  );

  const hasAnyInsight = Boolean(topInsight) || secondaryDeduped.length > 0;
  const hasData =
    hasAnyInsight ||
    data.focusAreas.length > 0 ||
    data.prediction !== null ||
    data.recentRounds.length > 0 ||
    profileData != null ||
    trendData != null ||
    shotData != null;

  const hasRounds = data.recentRounds.length > 0;
  const shot = initialShotAnalytics ?? null;

  /* ── Feedback handler — PRESERVED rateInsightAsPlayer round-trip + toasts ── */
  const handleRate = useCallback(
    async (
      insightId: string,
      rating: 'helpful' | 'not_helpful' | 'acknowledged' | 'dismissed',
    ) => {
      try {
        await rateInsightAsPlayer({ insightId, rating });
        addToast({
          type: 'success',
          title:
            rating === 'dismissed'
              ? 'Insight dismissed'
              : rating === 'acknowledged'
                ? 'Acknowledged'
                : 'Thanks for the feedback',
        });
        router.refresh();
      } catch (err) {
        addToast({
          type: 'error',
          title: 'Could not save feedback',
          description:
            err instanceof Error ? err.message : 'Please try again in a moment.',
        });
      }
    },
    [addToast, router],
  );

  /* ── Theme "Make it a plan" (player path) — create a self-set development goal
       from the direct cause. Mirrors the canonical runTransition pattern in
       FairwayGoalCard (useTransition + addToast + router.refresh). CauseRow only
       fires this when the cause is actionable AND a drill exists, so the goal is
       always derivable here. Two fields not present on CauseNode are filled with
       robust, non-fabricated defaults: `category` = 'from_insight' and a 30-day
       `ends_at` window. Baseline = the player's standing value; the target is the
       midpoint toward PGA (computeTargetValue) ONLY when both standing values are
       finite — otherwise both target fields stay null (never a fabricated number).
       The cause's metric must be a canonical MetricId for createGoal; if it is
       not, we surface an honest error rather than guessing. ───────────────────── */
  const handleMakePlan = useCallback(
    (cause: CauseNode, _theme: ThemeNode) => {
      setMakePlanPendingId(cause.insight_id);
      startMakePlanTransition(async () => {
        try {
          if (!cause.metric || !isMetricId(cause.metric)) {
            addToast({
              type: 'error',
              title: 'Could not add to your plan',
              description: 'This focus area is not yet a trackable metric.',
            });
            return;
          }

          const baseline =
            typeof cause.standingPlayerValue === 'number' &&
            Number.isFinite(cause.standingPlayerValue)
              ? cause.standingPlayerValue
              : null;
          const canTarget =
            baseline !== null &&
            typeof cause.standingPgaValue === 'number' &&
            Number.isFinite(cause.standingPgaValue);
          const target = canTarget
            ? computeTargetValue({
                playerValue: baseline,
                pgaValue: cause.standingPgaValue as number,
              })
            : null;

          const result = await createGoal({
            metric_id: cause.metric,
            title: cause.title,
            category: 'from_insight',
            // No window on the cause — a 30-day self-set window (the engine's
            // default suggested window) is the simplest robust choice.
            ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            baseline_value: baseline,
            target_value: target,
            target_source: target !== null ? 'midpoint' : null,
            shared_with_coach: true,
          });

          if (!result.ok) {
            addToast({
              type: 'error',
              title: 'Could not add to your plan',
              description: result.error || 'Please try again in a moment.',
            });
            return;
          }

          addToast({ type: 'success', title: 'Added to your development plan' });
          router.refresh();
        } catch (err) {
          addToast({
            type: 'error',
            title: 'Could not add to your plan',
            description:
              err instanceof Error ? err.message : 'Please try again in a moment.',
          });
        } finally {
          setMakePlanPendingId(null);
        }
      });
    },
    [addToast, router],
  );

  /* ── Hero actions — feedback + the RESERVED Ask entry (no gate lift) ──────── */
  const heroActions = topInsight ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void handleRate(topInsight.id, 'helpful')}
      >
        Helpful
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void handleRate(topInsight.id, 'dismissed')}
      >
        Dismiss
      </Button>
      {/* RESERVED / disabled — the player-scoped chat gate-lift is a residual
          human decision, so this entry ships disabled this wave (no tease). */}
      <Button
        variant="ghost"
        size="sm"
        disabled
        leftIcon={<Sparkles className="h-4 w-4" aria-hidden />}
        title="Ask CoachHelm is coming soon for players"
      >
        Ask CoachHelm about this
      </Button>
    </div>
  ) : undefined;

  const settingsAction = (
    <Button
      asChild
      variant="ghost"
      size="sm"
      leftIcon={<Settings className="h-4 w-4" aria-hidden />}
    >
      <Link href="/golf/dashboard/settings">AI settings</Link>
    </Button>
  );

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 md:px-6">
        <CoachHelmShell
          active="brief"
          role="player"
          eyebrow="CoachHelm AI"
          title="Your edge this week"
          description="The pattern that matters most, plus the supporting signal behind it."
          actions={settingsAction}
        >
          {/* ── Cold-start / no-data: one honest empty state ─────────────────── */}
          {!hasData ? (
            <Surface padding="lg">
              <EmptyState
                title="No insights yet"
                description="Log a few rounds and CoachHelm will surface the patterns that move your scores."
                action={
                  <Button asChild variant="primary">
                    <Link href="/golf/dashboard/rounds/new">Log your first round</Link>
                  </Button>
                }
              />
            </Surface>
          ) : (
            <div className="flex flex-col gap-10">
              {/* ════════════════ THE COCKPIT — the focal instrument cluster ════ */}
              <InstrumentCluster
                ariaLabel="Your CoachHelm cockpit"
                balance="focal"
                tertiaryColumns={4}
                primary={
                  <EdgeInstrument
                    insight={topInsight}
                    playerId={playerId}
                    hasRounds={hasRounds}
                    heroActions={heroActions}
                    standingByMetric={standingByMetric}
                  />
                }
                secondary={[
                  <PredictionInstrument
                    key="prediction"
                    data={data}
                  />,
                  <StrengthRadarInstrument key="strength" shot={shot} />,
                ]}
                tertiary={[
                  <RoundsReadout key="rounds" shot={shot} />,
                  <FairwaysReadout key="fairways" shot={shot} />,
                  <GirReadout key="gir" shot={shot} />,
                  <PuttsReadout key="putts" shot={shot} />,
                ]}
              />

              {/* ════════════ THE FEED — hierarchical THEMES (flag on + present)
                    REPLACE the flat secondary feed; otherwise the flat feed is
                    the kill-switch + empty-themes fallback (kept verbatim). ════ */}
              {isThemesEnabled() && themes.length > 0 ? (
                <section className="flex flex-col gap-3" data-slot="coachhelm-themes">
                  <h3 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                    Themes to work on
                  </h3>
                  <ThemesPanel
                    themes={themes}
                    role="player"
                    onMakePlan={handleMakePlan}
                    makePlanPendingId={makePlanPendingId}
                  />
                </section>
              ) : secondaryDeduped.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h3 className="px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                    {topInsight ? 'More for you' : 'Your insights'}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {secondaryDeduped.map((insight) => {
                      // Standing strip ONLY when the insight's metric is a
                      // canonical MetricId AND a standing snapshot exists for it
                      // (sourced from golf_player_standing, never the evidence).
                      const m = insight.evidence.metric;
                      const cfg = getMetricRenderConfig(m);
                      const st = cfg ? standingByMetric?.[m] : undefined;
                      return (
                        <InsightCard
                          key={insight.id}
                          variant="compact"
                          priority={toInsightPriority(insight.priority)}
                          overline={insightOverline(insight)}
                          title={insight.title}
                          interactive
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenInsight(insight)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setOpenInsight(insight);
                            }
                          }}
                        >
                          {insight.content}
                          {st && cfg ? (
                            <div className="mt-3">
                              <StandingStrip
                                size="inline"
                                metric_id={m}
                                metric_label={cfg.display_label}
                                player_value={st.player_value}
                                team_avg={st.team_avg}
                                team_n={st.team_n}
                                team_pct={st.team_pct}
                                pga_value={st.pga_value}
                                direction={cfg.direction}
                                unit={cfg.unit}
                                scale={cfg.default_scale}
                                show_cohort_text={false}
                              />
                            </div>
                          ) : null}
                        </InsightCard>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {/* ════════════ FOCUS AREAS + the fuller prediction read ══════════ */}
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-7">
                  <section id="focus-areas" className="scroll-mt-24">
                    {/* Reused unchanged — owns its own honest empty state. */}
                    <FocusAreasGrid focusAreas={data.focusAreas} />
                  </section>
                </div>
                <div className="min-w-0 lg:col-span-5">
                  {/* Reused unchanged — owns the fuller prediction presentation. */}
                  <PerformancePrediction
                    prediction={data.prediction}
                    playerState={data.playerState}
                  />
                </div>
              </section>

              {/* ════════════════ TERTIARY — game profile + trends ══════════════ */}
              <section>
                <h3 className="mb-3 px-1 font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                  Performance overview
                </h3>

                {/* Honest "not enough rounds" banner ONLY when there is genuinely
                    no signal: a thin shot snapshot AND no profile AND no trend
                    data — otherwise it wrongly sits above a populated rating /
                    trend pair below. */}
                {!(shot && shot.roundsAnalyzed > 0) &&
                profileData == null &&
                trendData == null ? (
                  <Surface padding="md" className="mb-6">
                    <InsufficientData
                      title="Not enough rounds yet"
                      description="Log a round and your driving, greens, and putting will fill in here."
                      unit="rounds"
                      current={shot?.roundsAnalyzed ?? 0}
                      required={OVERVIEW_MIN_ROUNDS}
                    />
                  </Surface>
                ) : null}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* V3 panels — reused unchanged, but honestly gated: null V3
                      data → InsufficientData, NEVER a swallowed placeholder. */}
                  {profileData != null ? (
                    <CompositeRatingCard
                      profileData={profileData}
                      playerState={data.playerState}
                      playerName={data.playerName}
                    />
                  ) : (
                    <Surface padding="md">
                      <InsufficientData
                        title="Game profile warming up"
                        description="Your composite rating builds off the rounds you log — a few more and it fills in."
                        unit="rounds"
                      />
                    </Surface>
                  )}

                  {trendData != null ? (
                    <TrendDashboard
                      trendData={trendData}
                      playerState={data.playerState}
                    />
                  ) : (
                    <Surface padding="md">
                      <InsufficientData
                        title="Trends warming up"
                        description="Log a couple more rounds and your performance trend lines fill in."
                        unit="rounds"
                      />
                    </Surface>
                  )}
                </div>
              </section>

              {/* ════════════════ DETAIL — collapsible deep dive ════════════════ */}
              <section>
                <Surface
                  as="button"
                  interactive
                  padding="md"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setDeepDiveOpen((v) => !v)}
                  aria-expanded={deepDiveOpen}
                  aria-controls="coachhelm-deep-dive"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-fw-md bg-accent-50 text-accent-700">
                      <ChartLine className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-fw-sans text-body font-medium text-text-primary">
                        Deep dive analysis
                      </span>
                      <span className="block font-fw-sans text-body-sm text-text-tertiary">
                        Shot patterns and what-if scenarios
                      </span>
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform duration-200 ${
                      deepDiveOpen ? 'rotate-180' : ''
                    } motion-reduce:transition-none`}
                    aria-hidden
                  />
                </Surface>

                {deepDiveOpen ? (
                  <div id="coachhelm-deep-dive" className="mt-4 flex flex-col gap-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant={bottomTab === 'shot-analysis' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setBottomTab('shot-analysis')}
                      >
                        Shot analysis
                      </Button>
                      <Button
                        variant={bottomTab === 'what-if' ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setBottomTab('what-if')}
                      >
                        What if
                      </Button>
                    </div>

                    {bottomTab === 'shot-analysis' ? (
                      <ShotAnalysisCard
                        shotData={shotData ?? undefined}
                        playerId={playerId}
                      />
                    ) : (
                      <WhatIfPanel
                        playerId={playerId}
                        profileData={profileData ?? undefined}
                        onSimulate={async (metric, amount) => {
                          // PRESERVED: getPlayerWhatIf simulation contract.
                          const baseline =
                            (profileData?.currentPrediction as number | undefined) ?? 0;
                          const res = await getPlayerWhatIf(playerId, { metric, amount });
                          if (!res.success || !res.data) {
                            return { projectedScore: baseline, rankChange: 0 };
                          }
                          return {
                            projectedScore:
                              baseline + res.data.scenario.projectedScoringChange,
                            rankChange: res.data.scenario.projectedRankChange,
                          };
                        }}
                      />
                    )}
                  </div>
                ) : null}
              </section>
            </div>
          )}
        </CoachHelmShell>
      </div>

      {/* ── Expand-in-place — the SAME secondary signal blooms open here, never
            a navigation tease. Sheet (narrow) / docked (wide) via auto mode. ── */}
      {openInsight ? (
        <InsightPanel
          mode="sheet"
          open
          onOpenChange={(o) => {
            if (!o) setOpenInsight(null);
          }}
          priority={toInsightPriority(openInsight.priority)}
          overline={insightOverline(openInsight)}
          title={openInsight.title}
          evidence={
            openInsight.evidence?.metric_label ? (
              <span>
                <span className="font-medium text-text-primary">
                  {openInsight.evidence.metric_label}:
                </span>{' '}
                {openInsight.evidence.your_value_display ||
                  String(openInsight.evidence.your_value ?? '')}
              </span>
            ) : undefined
          }
          evidenceLabel={openInsight.evidence?.metric_label ? 'The evidence' : undefined}
          actions={
            [
              {
                key: 'acknowledge',
                label: 'Acknowledge',
                onClick: () => {
                  void handleRate(openInsight.id, 'acknowledged');
                  setOpenInsight(null);
                },
              },
              {
                key: 'dismiss',
                label: 'Dismiss',
                onClick: () => {
                  void handleRate(openInsight.id, 'dismissed');
                  setOpenInsight(null);
                },
              },
              {
                // RESERVED — no chat-gate lift this wave.
                key: 'ask',
                label: 'Ask CoachHelm',
                icon: <Lightbulb className="h-4 w-4" aria-hidden />,
                disabled: true,
              },
            ] satisfies InsightPanelAction[]
          }
        >
          {openInsight.content}
          {/* Practice Rx — the prescribed drills for this insight (pre-joined
              onto the insight by the route). Honest-empty: renders nothing when
              no drills are attached. */}
          <PracticeRxPanel drills={openInsight.drills ?? []} variant="sheet" />
        </InsightPanel>
      ) : null}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * PRIMARY INSTRUMENT — "Your edge this week"
 * ----------------------------------------------------------------------------
 * The focal flat hero. A big Fragment-Mono number reads the player's KEY GAME
 * NUMBER straight off the insight evidence (their team percentile / measured
 * value) with a small uppercase label — NO gauge, NO arc. The LLM
 * HeroNarrativeCard is the body (PRESERVED), and the feedback + RESERVED Ask
 * actions sit in the footer. No insight yet → an honest "awaiting standout
 * signal" panel (never a fake 0).
 * ══════════════════════════════════════════════════════════════════════════ */
/** Staggered cinematic reveal for the dark spotlight hero's elements. */
const HERO_STAGGER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};
const HERO_ITEM = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

function EdgeInstrument({
  insight,
  playerId,
  hasRounds,
  heroActions,
  standingByMetric,
}: {
  insight: EvidenceInsight | null;
  playerId: string;
  hasRounds: boolean;
  heroActions?: React.ReactNode;
  standingByMetric?: Record<string, PlayerStanding>;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (!insight) {
    return (
      <InstrumentPanel
        depth="raised"
        padding="lg"
        header="No standout signal yet"
        as="section"
        className="flex h-full flex-col gap-5"
      >
        <InsufficientData
          compact
          title="No standout insight yet"
          description={
            hasRounds
              ? 'Insights appear once a pattern holds across multiple rounds.'
              : 'Log a few rounds and CoachHelm will surface the patterns that move your scores.'
          }
        />
      </InstrumentPanel>
    );
  }

  const ev = insight.evidence;

  // Standing strip ("you vs team vs PGA") — sourced ONLY from
  // golf_player_standing (the evidence has no standing block). It renders only
  // when the insight's metric is a canonical MetricId AND a standing snapshot
  // exists for it; otherwise the existing flat-number read below stands as the
  // honest fallback (the hero already shows the LLM narrative).
  const mId = insight.evidence.metric;
  const cfg = getMetricRenderConfig(mId);
  const st = cfg ? standingByMetric?.[mId] : undefined;

  // The key game read — the player's measured number vs the team. Prefer the
  // percentile standing (a real 0..1 reading vs the team) when present, else
  // fall back to the raw measured value. Rendered as a FLAT big number, not a
  // gauge — the formatted string is computed here so it reads exactly right.
  const teamPctRaw = finite(teamPctOf(insight));
  // team_pct arrives as a 0..100 percentile RANK (occasionally a 0..1 fraction)
  // — normalize to a 0..100 rank and render it as a RANK ("100th"), never a
  // percentage (the old formatPercent turned a rank of 100 into "10000%").
  const teamPct =
    teamPctRaw == null ? null : Math.round(teamPctRaw <= 1 ? teamPctRaw * 100 : teamPctRaw);
  const yourValue = finite(ev.your_value);

  // The big read + its small uppercase label. Percentile rank when we have it,
  // else the player's own measured value display.
  const hasEdge = teamPct != null || yourValue != null;
  const edgeDisplay =
    teamPct != null
      ? ordinalRank(teamPct)
      : ev.your_value_display || (yourValue != null ? String(Math.round(yourValue)) : '—');
  const edgeLabel =
    teamPct != null
      ? `${ev.metric_label || 'Your number'} · team rank`
      : `${ev.metric_label || 'Your number'}${ev.unit ? ` · ${ev.unit}` : ''}`;
  // "Best on the team" reads as a calm success chip ONLY when the rank is truly
  // top-of-roster (>= 90th) — never a needle or arc, just an honest cue. Below
  // that threshold we show no chip rather than overclaiming.
  const bestOnTeam = teamPct != null && teamPct >= 90;

  // BESPOKE DARK SPOTLIGHT — this page's job is "here's the ONE thing to fix",
  // so the focal hero is cut from the SAME black + glass as the sidebar rail:
  // solid warm-black `bg-nav-bg` (#0C0A09), the `.on-dark` scope, nav text
  // tokens, the green `nav-accent`, and the rail's glass-sheen recipe on its
  // lifted sub-panel. The diagnosis blazes in green; the LLM read sits in light
  // prose. Cinematic staggered reveal (HERO_STAGGER/HERO_ITEM), reduced-motion safe.
  return (
    <m.section
      initial={prefersReducedMotion ? false : 'hidden'}
      animate="visible"
      variants={HERO_STAGGER}
      className="on-dark relative flex h-full flex-col gap-6 overflow-hidden rounded-card bg-nav-bg p-7 text-nav-text shadow-soft md:p-8"
    >
      {/* Same black + glass as the rail: solid warm-black, a faint green halo
          behind the figure, and a specular top rim (the sidebar's sheen). */}
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent-500/20 blur-[80px]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.06]" />

      {/* Diagnosis headline */}
      <m.div variants={HERO_ITEM} className="relative">
        <p className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.18em] text-nav-accent">
          Your edge this week
        </p>
        <h2 className="mt-2 font-fw-display text-h3 font-semibold leading-tight tracking-[-0.01em] text-nav-text">
          {insight.title}
        </h2>
      </m.div>

      <div className="relative grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        {/* Narrative body — inverted (luminous on dark), LLM grounding PRESERVED. */}
        <m.div variants={HERO_ITEM} className="min-w-0">
          <HeroNarrativeCard
            inverted
            playerId={playerId}
            metricLabel={ev.metric_label}
            yourValueDisplay={ev.your_value_display || String(ev.your_value ?? '')}
            teamPct={teamPct}
            fallbackText={insight.content || insight.title}
          />
        </m.div>

        {/* The key game read. A canonical standing snapshot → the StandingStrip
            (a bright card on the dark band). Otherwise the big number BLAZES in
            luminous green on near-black — the honest fallback. */}
        <m.div variants={HERO_ITEM}>
          {st && cfg ? (
            <div className="w-full md:w-[320px]">
              <StandingStrip
                size="card"
                metric_id={mId}
                metric_label={cfg.display_label}
                player_value={st.player_value}
                team_avg={st.team_avg}
                team_n={st.team_n}
                team_pct={st.team_pct}
                pga_value={st.pga_value}
                direction={cfg.direction}
                unit={cfg.unit}
                scale={cfg.default_scale}
              />
            </div>
          ) : hasEdge ? (
            <div className="flex flex-col gap-2 md:items-end md:text-right">
              <span className="font-fw-mono text-[72px] font-bold leading-none tabular-nums text-nav-accent">
                {edgeDisplay}
              </span>
              <span className="font-fw-sans text-caption font-semibold uppercase tracking-[0.12em] text-nav-text-dim">
                {edgeLabel}
              </span>
              {bestOnTeam ? (
                <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-500/15 px-2.5 py-1 font-fw-sans text-caption font-semibold text-nav-accent md:self-end">
                  <span aria-hidden>↗</span>
                  Best on the team
                </span>
              ) : null}
            </div>
          ) : null}
        </m.div>
      </div>

      {/* Practice Rx — prescribed drills (honest-empty: renders nothing if none). */}
      {insight.drills && insight.drills.length > 0 ? (
        <m.div variants={HERO_ITEM}>
          <PracticeRxPanel drills={insight.drills} variant="hero" />
        </m.div>
      ) : null}

      {/* Feedback footer — the rail's glass-sheen recipe: a nav-surface lift with
          an inset white top-hairline, so it reads as the same glass as the rail. */}
      {heroActions ? (
        <m.div
          variants={HERO_ITEM}
          className="flex items-center justify-between gap-3 rounded-fw-md bg-nav-surface px-4 py-3 ring-1 ring-inset ring-white/[0.06] [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.05)]"
        >
          <span className="font-fw-sans text-caption text-nav-text-dim">Was this useful?</span>
          {heroActions}
        </m.div>
      ) : null}
    </m.section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SECONDARY — the PERFORMANCE-PREDICTION readout cluster. A big mono Readout of
 * the predicted scoring number + a FLAT model-confidence Readout (NO dial) on a
 * base flat panel. Honest awaiting when there is no prediction yet (never a
 * fabricated score). The fuller reused PerformancePrediction panel renders
 * separately below the cluster (UNCHANGED).
 * ─────────────────────────────────────────────────────────────────────────── */
function PredictionInstrument({ data }: { data: PlayerCoachHelmDashboardData }) {
  const pred = data.prediction;
  const predicted = finite(pred?.predictedValue);
  const low = finite(pred?.predictedRangeLow ?? pred?.lowerBound ?? pred?.predictionRange?.low);
  const high = finite(pred?.predictedRangeHigh ?? pred?.upperBound ?? pred?.predictionRange?.high);
  const confidence = finite(pred?.calibratedConfidence ?? pred?.confidence);

  const hasPrediction = predicted != null;

  return (
    <InstrumentPanel
      depth="base"
      header="Next round prediction"
      className="flex h-full flex-col gap-4"
    >
      {/* The big mono readout — predicted scoring number (honest awaiting). */}
      <InstrumentPanel depth="inset" padding="sm">
        <Readout
          value={predicted ?? undefined}
          format={{ maximumFractionDigits: 1 }}
          label={pred?.metric ? `Predicted ${pred.metric.replace(/_/g, ' ')}` : 'Predicted score'}
          size="lg"
          state={hasPrediction ? 'live' : 'awaiting'}
          samples={hasPrediction ? undefined : { have: 0, need: 1 }}
          awaitingLabel="Awaiting a forecast"
        />
        {hasPrediction && low != null && high != null ? (
          <p className="mt-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
            range {low.toFixed(1)} – {high.toFixed(1)}
          </p>
        ) : null}
      </InstrumentPanel>

      {/* Model confidence — a FLAT readout (no dial). Honest awaiting otherwise. */}
      <Readout
        value={confidence ?? undefined}
        display={hasPrediction && confidence != null ? formatPercent(confidence, 0) : undefined}
        label="Model confidence"
        size="md"
        state={hasPrediction && confidence != null ? 'live' : 'awaiting'}
        samples={hasPrediction && confidence != null ? undefined : { have: 0, need: 1 }}
        awaitingLabel="Awaiting a forecast"
      />
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * HERO ART — the GAME-STRENGTH radar (GenomeRadar). Built from the REAL shot-
 * analytics snapshot: driving (fairways %), approach (GIR %), around-green
 * (up-and-down %), and putting (made-putt rate, the share NOT three-putting).
 * Each axis is honestly omitted when its sub-stat has no shots; with < 3 axes
 * the radar shows its own insufficient-data state — never a fabricated shape.
 * ─────────────────────────────────────────────────────────────────────────── */
function StrengthRadarInstrument({ shot }: { shot: PlayerShotAnalytics | null }) {
  const axes = useMemo<GenomeAxis[]>(() => {
    if (!shot || shot.roundsAnalyzed === 0) return [];
    const out: GenomeAxis[] = [];
    if (shot.teeStats.totalDrives > 0) {
      out.push({ label: 'Driving', value: clamp01to100(shot.teeStats.fairwayPct) });
    }
    if (shot.approachStats.totalApproaches > 0) {
      out.push({ label: 'Approach', value: clamp01to100(shot.approachStats.girPct) });
    }
    if (shot.aroundGreenStats.totalShots > 0) {
      out.push({
        label: 'Around green',
        value: clamp01to100(shot.aroundGreenStats.upAndDownPct),
      });
    }
    if (shot.puttingStats.totalPutts > 0) {
      // share of putts that were NOT a three-putt — higher is stronger putting
      out.push({
        label: 'Putting',
        value: clamp01to100(100 - shot.puttingStats.threePuttRate),
      });
    }
    return out;
  }, [shot]);

  return (
    <InstrumentPanel depth="base" className="flex h-full flex-col">
      {/* Rendered BARE (no card-in-card) — the chart carries the SINGLE title so
          there is no duplicate panel header saying the same thing. */}
      <GenomeRadar
        title="Shot mix"
        subtitle="Driving · approach · around green · putting"
        data={axes}
        seriesName="Strength"
        max={100}
        height={236}
        className="border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      />
    </InstrumentPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * TERTIARY MICRO-READOUTS — small cockpit readouts along the cluster foot, each
 * an honest live/awaiting Readout off the shot-analytics snapshot.
 * ─────────────────────────────────────────────────────────────────────────── */
function RoundsReadout({ shot }: { shot: PlayerShotAnalytics | null }) {
  const rounds = shot?.roundsAnalyzed ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={rounds}
        format={{ maximumFractionDigits: 0 }}
        label="Rounds analyzed"
        size="md"
        state={rounds > 0 ? 'live' : 'awaiting'}
        samples={rounds === 0 ? { have: 0, need: 1 } : undefined}
        awaitingLabel="None yet"
      />
    </InstrumentPanel>
  );
}

function FairwaysReadout({ shot }: { shot: PlayerShotAnalytics | null }) {
  const drives = shot?.teeStats.totalDrives ?? 0;
  const pct = shot?.teeStats.fairwayPct ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={pct}
        format={{ maximumFractionDigits: 0 }}
        unit="%"
        label="Fairways"
        size="md"
        state={drives > 0 ? 'live' : 'awaiting'}
        samples={drives === 0 ? { have: 0, need: 1 } : undefined}
        awaitingLabel="No drives"
      />
    </InstrumentPanel>
  );
}

function GirReadout({ shot }: { shot: PlayerShotAnalytics | null }) {
  const approaches = shot?.approachStats.totalApproaches ?? 0;
  const pct = shot?.approachStats.girPct ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={pct}
        format={{ maximumFractionDigits: 0 }}
        unit="%"
        label="GIR"
        size="md"
        state={approaches > 0 ? 'live' : 'awaiting'}
        samples={approaches === 0 ? { have: 0, need: 1 } : undefined}
        awaitingLabel="No approaches"
      />
    </InstrumentPanel>
  );
}

function PuttsReadout({ shot }: { shot: PlayerShotAnalytics | null }) {
  const putts = shot?.puttingStats.totalPutts ?? 0;
  const perRound = shot?.puttingStats.avgPuttsPerRound ?? 0;
  return (
    <InstrumentPanel depth="base" padding="md" className="h-full">
      <Readout
        value={perRound}
        format={{ maximumFractionDigits: 1 }}
        label="Putts / round"
        size="md"
        state={putts > 0 ? 'live' : 'awaiting'}
        samples={putts === 0 ? { have: 0, need: 1 } : undefined}
        awaitingLabel="No putts"
      />
    </InstrumentPanel>
  );
}

/** Clamp a 0..100 percentage onto the radar's shared 0–100 scale. */
function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export default FairwayPlayerCoachHelm;
