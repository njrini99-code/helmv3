'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayPlayerInsight — coach AI player page
 * ----------------------------------------------------------------------------
 * The warm-premium re-skin of the legacy coach Player Insight surface
 *   src/app/golf/(dashboard)/dashboard/players/[playerId]/player-insight-client.tsx
 *
 * ── ORGANIZATION (narrative story column) ──────────────────────────────────
 * One centered ~860px column read top-to-bottom as a single coaching story,
 * with whitespace + typographic eyebrows carrying hierarchy (not a grid of
 * same-shaped cards):
 *   A · WHO + VERDICT    identity + composite + ONE synthesized sentence
 *   B · STANDING         slim category bars in a low-emphasis sunken band
 *   C · WHERE TO FOCUS   the 1–2 insights that matter (par-scoring deduped to one)
 *   D · THE PLAN         PrescribedPracticePlanCard (the decision fulcrum)
 *   E · TRACKING         focus areas + predictions, one consolidated band
 *   F · GO DEEPER        a semantic bridge to the stats cockpit (not an orphan link)
 *   G · quick actions
 *
 * Trend summary, the standalone Active Patterns card, and Recent Rounds are
 * intentionally REMOVED — the stats cockpit (FairwayStatsCockpit) owns SG, leak
 * maps, scoring trend, recent rounds, and the cause/effect patterns strip. This
 * page is the coaching/action layer and links to the cockpit for depth.
 * (patterns + categoryBreakdown still flow into PrescribedPracticePlanCard.)
 *
 * PRESENTATION re-skin: every server action + the <InsightCard> and
 * <PrescribedPracticePlanCard> widgets are REUSED VERBATIM by exact import path.
 * The insight fetch + acknowledge / dismiss / create-focus-area / refresh
 * handlers are byte-for-byte the legacy logic. The par-scoring "collapse" is a
 * presentation-only dedupe (InsightCard binds to one insight), and the full
 * insight list still feeds the practice plan. No destructive write auto-fires.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Activity, Target, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { StatusPill } from '@/components/fairway/controls/status-pill';
import type { FwStatusTone } from '@/components/fairway/controls';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import { IconMessage, IconTarget, IconChartBar, IconEye } from '@/components/icons';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';

// Reused logic widgets (warm-palette, action-bearing) — embedded as-is.
import { InsightCard, type InsightAction } from '@/components/golf/coachhelm/insight-card';
import { PrescribedPracticePlanCard } from '@/components/golf/coachhelm/coach';

// Hierarchical THEME insights (v3) — flag-gated replacement for the flat feed.
import { ThemesPanel } from '@/components/fairway/cards-insight/themes';
import { isThemesEnabled } from '@/lib/redesign/flag';
import { computeTargetValue } from '@/lib/coachhelm/v3/goals/suggestion-writer';
import type { CauseNode, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { useToast } from '@/components/ui/sonner';

// Server actions — REUSED VERBATIM.
import {
  getInsightsForCoach,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
import {
  acknowledgeInsight,
  dismissInsight,
  refreshPlayerAnalysisAsCoach,
} from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import { useGolfUser } from '@/contexts/golf-user-context';

/* ---------------------------------------------------------------------------
 * Props — mirror the legacy PlayerInsightClient signature verbatim
 * ------------------------------------------------------------------------- */

interface PlayerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
}
interface RoundRow {
  id: string;
  created_at: string;
  round_date: string | null;
  total_score: number | null;
  holes_played: number | null;
  course_name: string | null;
  score_to_par: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_putts: number | null;
}
interface PatternRow {
  id: string;
  pattern_type: string | null;
  name: string | null;
  description: string | null;
  severity: string | null;
  stroke_impact: number | null;
  lifecycle_state: string | null;
  first_detected: string | null;
  is_active: boolean | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}
interface InsightRow {
  id: string;
  title: string | null;
  content: string | null;
  tone: string | null;
  confidence: number | null;
  dismissed: boolean | null;
  acknowledged: boolean | null;
  created_at: string;
}
interface FocusAreaRow {
  id: string;
  title: string | null;
  area_type: string | null;
  status: string | null;
  current_value: number | null;
  target_value: number | null;
  created_at: string;
}
interface PredictionRow {
  id: string;
  metric: string | null;
  predicted_value: number | null;
  confidence: number | null;
  trend: string | null;
  due_date: string | null;
  prediction_context: Record<string, unknown> | null;
  related_round_id: string | null;
  created_at: string;
}
interface CategoryBreakdown {
  teeGame: number;
  approach: number;
  shortGame: number;
  putting: number;
  scoring: number;
}
interface TrendSummary {
  trend: 'improving' | 'stable' | 'declining';
  recentAvg: number;
  previousAvg: number;
  streakCount: number;
  streakType: 'positive' | 'negative' | 'neutral';
}

export interface FairwayPlayerInsightProps {
  player: PlayerProfile;
  compositeRating: number;
  categoryBreakdown: CategoryBreakdown;
  trendSummary: TrendSummary; // route passes it; trajectory is carried by the verdict line
  playerStatus: 'Improving' | 'Needs Attention' | 'Stable';
  rounds: RoundRow[];
  patterns: PatternRow[];
  insights: InsightRow[]; // legacy; client re-fetches evidence rows
  focusAreas: FocusAreaRow[];
  predictions: PredictionRow[];
  /**
   * Hierarchical THEME scaffold (v3). Additive — when `isThemesEnabled()` and
   * non-empty, the ThemesPanel replaces the flat "Where to focus" feed in
   * section C. Degrades to `[]` (route already null-guards the fetch).
   */
  themes: ThemeNode[];
}

/* ---------------------------------------------------------------------------
 * Helpers (preserved verbatim where reused)
 * ------------------------------------------------------------------------- */

function formatHandicap(handicap: number | null): string {
  if (handicap === null) return '--';
  if (handicap < 0) return `+${Math.abs(handicap).toFixed(1)}`;
  return handicap.toFixed(1);
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

function formatMetricLabel(metric: string | null | undefined): string {
  if (!metric) return 'Prediction';
  const known: Record<string, string> = {
    scoring_average: 'Scoring Average',
    stroke_differential: 'Stroke Differential',
    gir_percentage: 'Greens in Regulation %',
    driving_accuracy: 'Driving Accuracy',
    putts_per_round: 'Putts Per Round',
    scoring_decline: 'Scoring Decline',
    tournament_performance: 'Tournament Performance',
  };
  return (
    known[metric] ??
    metric
      .split('_')
      .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(' ')
  );
}

function formatToParShort(diff: number | null): string {
  if (diff === null) return '';
  return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff);
}

/* ---- Fairway-tokenized tone mappers ------------------------------------- */

function ratingNumberTone(r: number): string {
  if (r >= 70) return 'text-accent-700';
  if (r >= 50) return 'text-fw-warning';
  return 'text-fw-danger';
}
function ratingRingTone(r: number): string {
  if (r >= 70) return 'stroke-accent-500';
  if (r >= 50) return 'stroke-fw-warning';
  return 'stroke-fw-danger';
}
function categoryBarTone(v: number): string {
  if (v >= 70) return 'bg-accent-500';
  if (v >= 50) return 'bg-fw-warning';
  return 'bg-fw-danger';
}
function statusTone(status: string): FwStatusTone {
  if (status === 'Improving') return 'success';
  if (status === 'Needs Attention') return 'warning';
  return 'neutral';
}
function focusStatusTone(status: string | null): FwStatusTone {
  if (status === 'completed') return 'success';
  if (status === 'active') return 'accent';
  return 'neutral';
}

/* ---- Verdict synthesis (the 30-second read) ----------------------------- */

const CATEGORY_LABELS: Record<keyof CategoryBreakdown, string> = {
  teeGame: 'off the tee',
  approach: 'approach',
  shortGame: 'short game',
  putting: 'putting',
  scoring: 'scoring',
};

function buildVerdict(
  status: 'Improving' | 'Needs Attention' | 'Stable',
  rating: number,
  cats: CategoryBreakdown,
  heroTitle: string | null,
): { text: string; tone: 'good' | 'warn' } {
  const entries = Object.entries(cats) as [keyof CategoryBreakdown, number][];
  let strong = entries[0]!;
  let weak = entries[0]!;
  for (const e of entries) {
    if (e[1] > strong[1]) strong = e;
    if (e[1] < weak[1]) weak = e;
  }
  const spread = strong[1] - weak[1];
  const tone: 'good' | 'warn' = status === 'Needs Attention' || weak[1] < 50 ? 'warn' : 'good';

  // Flat profile → status-led one-liner.
  if (spread < 8) {
    if (status === 'Needs Attention') {
      return { text: `Needs attention — ${CATEGORY_LABELS[weak[0]]} is sliding.`, tone: 'warn' };
    }
    if (status === 'Improving') {
      return { text: 'Trending the right way across the board — keep the momentum.', tone: 'good' };
    }
    return { text: 'Stable across the board — maintain rhythm.', tone: 'good' };
  }

  const head = status === 'Needs Attention' ? 'Needs attention' : status === 'Improving' ? 'Improving' : 'Stable';
  const leakClause = heroTitle
    ? `biggest opportunity: ${heroTitle}`
    : `${CATEGORY_LABELS[weak[0]]} is the clear leak`;
  return {
    text: `${head} at ${Math.round(rating)}. Strongest in ${CATEGORY_LABELS[strong[0]]}; ${leakClause}.`,
    tone,
  };
}

/* ---------------------------------------------------------------------------
 * Sub-components
 * ------------------------------------------------------------------------- */

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.16em] text-text-tertiary', className)}>
      {children}
    </p>
  );
}

function CompositeRatingCircle({ rating }: { rating: number }) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (rating / 100) * circumference;
  return (
    <div className="relative h-[88px] w-[88px] flex-shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6" className="stroke-border-subtle" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className={ratingRingTone(rating)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-fw-mono text-h1 tabular-nums tracking-[-0.025em]', ratingNumberTone(rating))}>
          {Math.round(rating)}
        </span>
        <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-text-tertiary">Rating</span>
      </div>
    </div>
  );
}

function CategoryBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 flex-shrink-0 font-fw-sans text-body-sm text-text-secondary">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
        <div
          className={cn('h-full rounded-full transition-all duration-700', categoryBarTone(value))}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className="w-8 flex-shrink-0 text-right font-fw-mono text-body-sm font-medium tabular-nums text-text-primary">
        {value}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * FairwayPlayerInsight
 * ------------------------------------------------------------------------- */

export function FairwayPlayerInsight({
  player,
  compositeRating,
  categoryBreakdown,
  playerStatus,
  rounds,
  patterns,
  focusAreas,
  predictions,
  themes,
}: FairwayPlayerInsightProps) {
  const router = useRouter();
  const golfUser = useGolfUser();
  const { addToast } = useToast();
  const coachId = golfUser.coachId ?? null;
  const playerName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';
  const tint = tintFor(player.id);

  const [insights, setInsights] = useState<EvidenceInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [, startActionTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // THEME "make it a plan" (coach path) — mirrors the FairwayGoalCard
  // runTransition pattern (useTransition + useToast + router). The pending id is
  // the cause's insight_id so the originating CauseRow shows the busy CTA.
  const [, startMakePlanTransition] = useTransition();
  const [makePlanPendingId, setMakePlanPendingId] = useState<string | null>(null);

  // ── Insight fetch + handlers: copied VERBATIM from the legacy client ──────
  const loadInsights = useCallback(async () => {
    if (!coachId) {
      setInsightsLoading(false);
      return;
    }
    setInsightsLoading(true);
    try {
      const rows = await getInsightsForCoach(coachId, { player_id: player.id, limit: 4 });
      setInsights(rows);
    } finally {
      setInsightsLoading(false);
    }
  }, [coachId, player.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadInsights();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInsights]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshNotice(null);
    try {
      const res = await refreshPlayerAnalysisAsCoach(player.id);
      if (res.success) {
        await loadInsights();
        router.refresh();
        setRefreshNotice({
          tone: 'success',
          text:
            typeof res.insightsCreated === 'number' && res.insightsCreated > 0
              ? `Refreshed — ${res.insightsCreated} new insight${res.insightsCreated === 1 ? '' : 's'}`
              : 'Refreshed — no new insights since last run',
        });
      } else {
        setRefreshNotice({ tone: 'error', text: res.error ?? 'Refresh failed' });
      }
    } catch (err) {
      setRefreshNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Refresh failed' });
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, loadInsights, player.id, router]);

  const handleAction = useCallback(
    (action: InsightAction, insightId: string) => {
      const prev = insights;
      startActionTransition(async () => {
        try {
          if (action === 'acknowledged') {
            setInsights((rows) =>
              rows.map((r) =>
                r.id === insightId ? { ...r, acknowledged_at: new Date().toISOString(), status: 'acknowledged' } : r,
              ),
            );
            const res = await acknowledgeInsight(insightId);
            if (!res.success) setInsights(prev);
          } else if (action === 'dismissed') {
            setInsights((rows) => rows.filter((r) => r.id !== insightId));
            const res = await dismissInsight(insightId);
            if (!res.success) setInsights(prev);
          } else if (action === 'create_focus_area') {
            if (!coachId) return;
            const target = insights.find((r) => r.id === insightId);
            if (!target) return;
            const res = await createFocusAreaFromInsight({
              insight_id: target.id,
              player_id: target.player_id,
              coach_id: coachId,
              title: target.title,
              description: target.content ?? '',
              insight_type: (target.category as string | undefined) ?? 'general',
            });
            if (res.success) router.push('/golf/dashboard/development');
          }
        } catch {
          setInsights(prev);
        }
      });
    },
    [coachId, insights, router],
  );

  // ── THEME → "Make it a plan" (coach): mirror the FairwayGoalCard runTransition
  // pattern (useTransition + useToast + router). Builds a focus area from the
  // cause + page scope, mapping ONLY to fields that exist on
  // CreateFocusAreaFromInsightData. `computeTargetValue` needs two real numbers,
  // so we only pass a derived target when BOTH standing values are present.
  const handleMakePlan = useCallback(
    (cause: CauseNode, theme: ThemeNode) => {
      if (!coachId) {
        addToast({ type: 'error', title: 'Sign in as a coach to create a plan' });
        return;
      }
      setMakePlanPendingId(cause.insight_id);
      startMakePlanTransition(async () => {
        try {
          const playerValue = cause.standingPlayerValue;
          const pgaValue = cause.standingPgaValue;
          const targetValue =
            playerValue !== null && pgaValue !== null
              ? computeTargetValue({ playerValue, pgaValue })
              : null;

          const res = await createFocusAreaFromInsight({
            insight_id: cause.insight_id,
            player_id: player.id,
            coach_id: coachId,
            title: cause.title,
            description: cause.content,
            insight_type: theme.category,
            target_metric: cause.metric,
            current_value: playerValue,
            target_value: targetValue,
          });

          if (res.success) {
            addToast({ type: 'success', title: 'Focus area created' });
            router.push('/golf/dashboard/development');
          } else {
            addToast({ type: 'error', title: res.error ?? 'Could not create focus area' });
          }
        } catch (err) {
          addToast({
            type: 'error',
            title: err instanceof Error ? err.message : 'Could not create focus area',
          });
        } finally {
          setMakePlanPendingId(null);
        }
      });
    },
    [coachId, player.id, router, addToast],
  );

  // ── Dedupe for display: the fetcher already ranks best-first, so keep the
  // FIRST scoring-category insight (the par-scoring panel that matters) and
  // drop the rest, then show at most two. The plan still gets the full list. ──
  const displayInsights = useMemo(() => {
    const out: EvidenceInsight[] = [];
    let scoringSeen = false;
    for (const i of insights) {
      if ((i.category as string | undefined) === 'scoring') {
        if (scoringSeen) continue;
        scoringSeen = true;
      }
      out.push(i);
    }
    return out.slice(0, 2);
  }, [insights]);
  const heroInsight = displayInsights[0];
  const secondInsight = displayInsights[1];

  const verdict = buildVerdict(playerStatus, compositeRating, categoryBreakdown, heroInsight?.title ?? null);
  const lastRound = rounds[0] ?? null;
  const metaLine = [
    player.graduation_year ? `Class ${player.graduation_year}` : null,
    `${formatHandicap(player.handicap)} handicap`,
    `${rounds.length} round${rounds.length === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-6 md:py-8">
      {/* ── Back ── */}
      <Button
        asChild
        variant="ghost"
        size="sm"
        leftIcon={<ArrowLeft className="h-4 w-4" />}
        className="mb-6 -ml-2 text-text-tertiary"
      >
        <Link href={`/golf/dashboard/roster/${player.id}`}>Player</Link>
      </Button>

      <div className="space-y-12">
        {/* ════════ A · WHO + VERDICT ════════ */}
        <Surface elevation="shadow" padding="lg">
          <div className="flex items-start gap-5">
            <span
              className="grid h-16 w-16 flex-shrink-0 place-items-center overflow-hidden rounded-2xl font-fw-display text-h3 font-semibold ring-1 ring-border-subtle md:h-20 md:w-20"
              style={player.avatar_url ? undefined : { backgroundColor: tint.bg, color: tint.text }}
            >
              {player.avatar_url ? (
                <img src={player.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                `${player.first_name?.[0] ?? ''}${player.last_name?.[0] ?? ''}`.toUpperCase() || '—'
              )}
            </span>

            <div className="min-w-0 flex-1">
              <Eyebrow className="text-accent-700">Player Insight</Eyebrow>
              <h1 className="mt-1 truncate font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
                {playerName}
              </h1>
              <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">{metaLine}</p>
              <div className="mt-2.5">
                <StatusPill tone={statusTone(playerStatus)} size="sm" dot>
                  {playerStatus}
                </StatusPill>
              </div>
            </div>

            <CompositeRatingCircle rating={compositeRating} />
          </div>

          {/* Synthesized verdict — the 30-second read */}
          <div
            className={cn(
              'mt-5 border-l-2 pl-4',
              verdict.tone === 'good' ? 'border-accent-500' : 'border-fw-warning',
            )}
          >
            <p className="max-w-prose font-fw-sans text-body text-text-secondary">{verdict.text}</p>
          </div>
        </Surface>

        {/* ════════ B · STANDING ════════ */}
        <section>
          <Eyebrow>Standing</Eyebrow>
          <div className="mt-3 flex flex-col gap-3 rounded-card bg-surface-sunken p-6">
            <CategoryBar label="Tee Game" value={categoryBreakdown.teeGame} />
            <CategoryBar label="Approach" value={categoryBreakdown.approach} />
            <CategoryBar label="Short Game" value={categoryBreakdown.shortGame} />
            <CategoryBar label="Putting" value={categoryBreakdown.putting} />
            <CategoryBar label="Scoring" value={categoryBreakdown.scoring} />
          </div>
        </section>

        {/* ════════ C · WHERE TO FOCUS ════════ */}
        {/* THEME view (v3) replaces the flat feed when enabled + non-empty.
            Else-branch = the existing flat "Where to focus" feed VERBATIM
            (kill-switch + empty fallback). Section rhythm A→B→C→D preserved. */}
        {isThemesEnabled() && themes.length > 0 ? (
          <section data-testid="player-insight-section">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Where to focus</Eyebrow>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                busy={isRefreshing}
                leftIcon={<Sparkles className="h-4 w-4" />}
                data-testid="refresh-player-analysis"
                aria-label="Refresh AI analysis for this player"
              >
                {isRefreshing ? 'Analyzing…' : 'Refresh'}
              </Button>
            </div>

            {refreshNotice ? (
              <div className="mt-3">
                <InlineNotice tone={refreshNotice.tone === 'success' ? 'success' : 'danger'}>
                  {refreshNotice.text}
                </InlineNotice>
              </div>
            ) : null}

            <div className="mt-3">
              <ThemesPanel
                themes={themes}
                // eslint-disable-next-line jsx-a11y/aria-role
                role="coach"
                onMakePlan={handleMakePlan}
                makePlanPendingId={makePlanPendingId}
              />
            </div>
          </section>
        ) : (
          <section data-testid="player-insight-section">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Where to focus</Eyebrow>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                busy={isRefreshing}
                leftIcon={<Sparkles className="h-4 w-4" />}
                data-testid="refresh-player-analysis"
                aria-label="Refresh AI analysis for this player"
              >
                {isRefreshing ? 'Analyzing…' : 'Refresh'}
              </Button>
            </div>

            {refreshNotice ? (
              <div className="mt-3">
                <InlineNotice tone={refreshNotice.tone === 'success' ? 'success' : 'danger'}>
                  {refreshNotice.text}
                </InlineNotice>
              </div>
            ) : null}

            <div className="mt-3">
              {insightsLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-28 rounded-card" />
                  <Skeleton className="h-24 rounded-card" />
                </div>
              ) : displayInsights.length === 0 ? (
                <Surface elevation="border" padding="lg">
                  <EmptyState
                    icon={Activity}
                    variant="subtle"
                    title="No insights generated yet"
                    description="Run the engine for this player with Refresh above."
                  />
                </Surface>
              ) : (
                <div className="flex flex-col gap-4">
                  {heroInsight ? (
                    <InsightCard insight={heroInsight} density="hero" audience="coach" showActions onAction={handleAction} />
                  ) : null}
                  {secondInsight ? (
                    <InsightCard insight={secondInsight} density="default" audience="coach" showActions onAction={handleAction} />
                  ) : null}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ════════ D · THE PLAN ════════ */}
        <section>
          <Eyebrow className="mb-3">The plan</Eyebrow>
          <PrescribedPracticePlanCard
            playerId={player.id}
            coachId={coachId}
            insights={insights}
            patterns={patterns}
            categoryBreakdown={categoryBreakdown}
            focusAreas={focusAreas}
            isRefreshing={isRefreshing}
          />
        </section>

        {/* ════════ E · WHAT WE'RE TRACKING ════════ */}
        <section>
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>What we&rsquo;re tracking</Eyebrow>
            <Link
              href={`/golf/dashboard/development?player=${player.id}`}
              className="font-fw-sans text-caption font-medium text-accent-700 hover:text-accent-600"
            >
              Manage
            </Link>
          </div>

          <div className="mt-3 rounded-card bg-surface-sunken p-6">
            {/* Focus areas */}
            {focusAreas.length === 0 ? (
              <EmptyState
                icon={Target}
                variant="subtle"
                title="No focus areas set"
                description="Set focus areas to track this player's development priorities."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {focusAreas.map((fa) => {
                  const progress =
                    fa.current_value && fa.target_value
                      ? Math.min(100, Math.round((fa.current_value / fa.target_value) * 100))
                      : 0;
                  return (
                    <div key={fa.id} className="flex flex-col gap-2 rounded-fw-md bg-surface p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <IconTarget size={14} className="flex-shrink-0 text-text-tertiary" />
                          <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                            {fa.title ?? 'Focus area'}
                          </span>
                        </span>
                        <StatusPill tone={focusStatusTone(fa.status)} size="sm">
                          {fa.status ?? 'active'}
                        </StatusPill>
                      </div>
                      {fa.target_value !== null ? (
                        <div>
                          <div className="mb-1 flex items-center justify-between font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
                            <span>{fa.current_value ?? 0}</span>
                            <span>{fa.target_value}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                            <div className="h-full rounded-full bg-accent-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      ) : null}
                      <p className="font-fw-sans text-eyebrow text-text-tertiary">Started {formatRelativeDate(fa.created_at)}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Predictions — only if present */}
            {predictions.length > 0 ? (
              <div className="mt-6 border-t border-border-subtle pt-6">
                <Eyebrow className="mb-3">Predictions</Eyebrow>
                <div className="flex flex-col gap-3">
                  {predictions.map((pred) => (
                    <div key={pred.id} className="flex items-center justify-between gap-3 rounded-fw-md bg-surface p-4">
                      <div className="min-w-0">
                        <p className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
                          {formatMetricLabel(pred.metric)}
                        </p>
                        {pred.due_date ? (
                          <p className="mt-0.5 font-fw-sans text-eyebrow text-text-tertiary">Due {formatRelativeDate(pred.due_date)}</p>
                        ) : null}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {pred.predicted_value !== null ? (
                          <p className="font-fw-mono text-h3 tabular-nums tracking-[-0.02em] text-text-primary">
                            {pred.predicted_value.toFixed(1)}
                          </p>
                        ) : null}
                        {pred.confidence !== null ? (
                          <p className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
                            {Math.round(pred.confidence * 100)}% conf
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {/* ════════ F · GO DEEPER — stats cockpit bridge ════════ */}
        <Surface elevation="border" padding="lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-fw-display text-body-lg font-semibold tracking-[-0.01em] text-text-primary">
                Detailed stats &amp; patterns
              </p>
              <p className="mt-1 max-w-prose font-fw-sans text-body-sm text-text-tertiary">
                Strokes-gained, scoring by par, leak maps, the scoring trend, and the patterns CoachHelm sees all live on the stats cockpit.
                {lastRound ? (
                  <>
                    {' '}Last round: {lastRound.course_name ?? 'Round'}
                    {lastRound.score_to_par !== null ? ` · ${formatToParShort(lastRound.score_to_par)}` : ''}.
                  </>
                ) : null}
              </p>
            </div>
            <Button asChild variant="primary" leftIcon={<IconChartBar size={16} />} className="flex-shrink-0">
              <Link href={`/golf/dashboard/stats?player=${player.id}`}>Open CoachHelm stats</Link>
            </Button>
          </div>
        </Surface>

        {/* ════════ G · QUICK ACTIONS ════════ */}
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="primary" leftIcon={<IconMessage size={16} />}>
            <Link href={`/golf/dashboard/messages?player=${player.id}`}>Message player</Link>
          </Button>
          <Button asChild variant="secondary" leftIcon={<IconTarget size={16} />}>
            <Link href={`/golf/dashboard/development?player=${player.id}`}>Create focus area</Link>
          </Button>
          <Button asChild variant="ghost" leftIcon={<IconEye size={16} />}>
            <Link href="/golf/dashboard/calendar">Schedule practice</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default FairwayPlayerInsight;
