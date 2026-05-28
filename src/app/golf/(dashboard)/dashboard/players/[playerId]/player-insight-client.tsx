'use client';

/**
 * Player Insight (coach view) — Wave 1A migration.
 *
 * The insights section now renders through the unified `InsightCard`
 * primitive: top row as a hero card, the rest as default-density stack.
 * Data source: `getInsightsForCoach(coachId, { player_id })` — evidence-
 * backed rows only.
 *
 * All other sections (predictions / patterns / focus areas / recent rounds /
 * category breakdown / trend summary) remain untouched — they're out of
 * scope for Wave 1A.
 */
import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { PageHeader } from '@/components/ui/page-header';
import { Reveal } from '@/components/ui/reveal';
import { AnimatedNumber } from '@/components/ui/animated-number';
import {
  IconMessage,
  IconTarget,
  IconChartBar,
  IconTrendingUp,
  IconActivity,
  IconEye,
} from '@/components/icons';
import {
  InsightCard,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import { PrescribedPracticePlanCard } from '@/components/golf/coachhelm/coach';
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
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types (preserved from previous shape — the non-insight sections depend on
// them verbatim).
// ---------------------------------------------------------------------------

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

/** Legacy insight row shape still threaded through `page.tsx`. Kept for type
 *  compatibility but the client fetches the canonical `EvidenceInsight` rows
 *  itself once mounted. */
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

interface PlayerInsightClientProps {
  player: PlayerProfile;
  compositeRating: number;
  categoryBreakdown: CategoryBreakdown;
  trendSummary: TrendSummary;
  playerStatus: 'Improving' | 'Needs Attention' | 'Stable';
  rounds: RoundRow[];
  patterns: PatternRow[];
  /** Legacy insight list, unused after migration — retained in the prop
   *  signature to avoid churn on the server component. The client re-fetches
   *  evidence-backed rows directly. */
  insights: InsightRow[];
  focusAreas: FocusAreaRow[];
  predictions: PredictionRow[];
}

// ---------------------------------------------------------------------------
// Helpers (preserved)
// ---------------------------------------------------------------------------

function formatHandicap(handicap: number | null): string {
  if (handicap === null) return '--';
  if (handicap < 0) return `+${Math.abs(handicap).toFixed(1)}`;
  return handicap.toFixed(1);
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
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
  return known[metric] ?? metric
    .split('_')
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function ratingColor(rating: number): string {
  if (rating >= 80) return 'text-emerald-600';
  if (rating >= 60) return 'text-primary-600';
  if (rating >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function ratingRingColor(rating: number): string {
  if (rating >= 80) return 'stroke-emerald-500';
  if (rating >= 60) return 'stroke-primary-500';
  if (rating >= 40) return 'stroke-amber-500';
  return 'stroke-red-500';
}

function severityDotColor(severity: string | null): string {
  switch (severity) {
    case 'critical': return 'bg-red-500';
    case 'high': return 'bg-amber-500';
    case 'medium': return 'bg-yellow-400';
    case 'low': return 'bg-warm-300';
    default: return 'bg-warm-300';
  }
}

function statusBadgeStyles(status: string): string {
  switch (status) {
    case 'Improving': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Needs Attention': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-warm-50 text-warm-600 border-warm-200';
  }
}

function focusAreaStatusBadge(status: string | null): string {
  switch (status) {
    case 'active': return 'bg-primary-50 text-primary-700 border-primary-200';
    case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'paused': return 'bg-warm-50 text-warm-600 border-warm-200';
    default: return 'bg-warm-50 text-warm-600 border-warm-200';
  }
}

// ---------------------------------------------------------------------------
// Sub-components (preserved)
// ---------------------------------------------------------------------------

function CompositeRatingCircle({ rating }: { rating: number }) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (rating / 100) * circumference;

  return (
    <div className="relative w-[88px] h-[88px] flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="6" className="stroke-warm-100" />
        <circle
          cx="50" cy="50" r="42" fill="none" strokeWidth="6"
          strokeLinecap="round"
          className={ratingRingColor(rating)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber
          value={rating}
          decimals={0}
          className={cn('text-h1 md:text-h1 font-light tabular-nums tracking-[-0.025em]', ratingColor(rating))}
        />
        <span className="text-eyebrow text-warm-400 font-medium uppercase tracking-wider">Rating</span>
      </div>
    </div>
  );
}

function CategoryBar({ label, value }: { label: string; value: number }) {
  const barColor = value >= 70 ? 'bg-primary-500' : value >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-warm-600 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-warm-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', barColor)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-sm font-medium text-warm-800 tabular-nums w-8 text-right">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export function PlayerInsightClient({
  player,
  compositeRating,
  categoryBreakdown,
  trendSummary,
  playerStatus,
  rounds,
  patterns,
  focusAreas,
  predictions,
}: PlayerInsightClientProps) {
  const router = useRouter();
  const golfUser = useGolfUser();
  const coachId = golfUser.coachId ?? null;
  const playerName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';

  const [insights, setInsights] = useState<EvidenceInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [, startActionTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadInsights = useCallback(async () => {
    if (!coachId) {
      setInsightsLoading(false);
      return;
    }
    setInsightsLoading(true);
    try {
      // Capped at 4: the EvidencePanel benchmark scale gives each insight
      // more vertical real estate, so 4 high-signal cards reads better
      // than 8 mid-signal ones. The fetcher ranks by |strokes_impact| ×
      // confidence so we keep only the most impactful.
      const rows = await getInsightsForCoach(coachId, { player_id: player.id, limit: 4 });
      setInsights(rows);
    } finally {
      setInsightsLoading(false);
    }
  }, [coachId, player.id]);

  // Initial fetch of evidence-backed insights for this player (coach-audience shape).
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
        setRefreshNotice({
          tone: 'error',
          text: res.error ?? 'Refresh failed',
        });
      }
    } catch (err) {
      setRefreshNotice({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Refresh failed',
      });
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
                r.id === insightId
                  ? { ...r, acknowledged_at: new Date().toISOString(), status: 'acknowledged' }
                  : r,
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

  const [heroInsight, ...restInsights] = insights;

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader
          title={playerName || 'Player Insight'}
          subtitle="Player Insight"
          backHref="/golf/dashboard/roster"
          backLabel="Roster"
          breadcrumb={
            <Breadcrumb
              items={[
                { label: 'Dashboard', href: '/golf/dashboard' },
                { label: 'Roster', href: '/golf/dashboard/roster' },
                { label: playerName || 'Player Insight' },
              ]}
            />
          }
        />
      </AnimatedItem>

      <AnimatedItem>
        <div className="max-w-[1536px] mx-auto px-4 md:px-6 py-6 md:py-8">
          <Reveal>
            <div className="surface-stone rounded-3xl p-6 md:p-10 mb-6">
              <PageHeader
                eyebrow="Player Profile"
                eyebrowAccent="primary"
                title={`${playerName}.`}
                subtitle={[
                  player.graduation_year ? `Class ${player.graduation_year}` : null,
                  `${formatHandicap(player.handicap)} handicap`,
                  `${rounds.length} round${rounds.length === 1 ? '' : 's'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </div>
          </Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ============================================================= */}
            {/* LEFT COLUMN */}
            {/* ============================================================= */}
            <div className="lg:col-span-5 space-y-6">
              {/* Player Header Card */}
              <div className="surface-matte rounded-3xl p-6 md:p-7">
                <div className="flex items-start gap-5">
                  <div className="relative flex-shrink-0">
                    {player.avatar_url ? (
                      <div className="w-16 h-16 rounded-2xl overflow-hidden">
                        <Image
                          src={player.avatar_url}
                          alt={playerName}
                          width={64}
                          height={64}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-warm-100/65 flex items-center justify-center">
                        <span className="text-h3 font-medium text-warm-500 tracking-[-0.005em]">
                          {(player.first_name?.[0] ?? '')}{(player.last_name?.[0] ?? '')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h2 className="text-h2 md:text-h1 font-medium tracking-[-0.022em] text-warm-900 truncate">
                      {playerName}
                    </h2>
                    <p className="text-body-sm text-warm-500 mt-1">
                      {player.graduation_year ? `Class ${player.graduation_year}` : 'No class year'}
                      {' · '}
                      {formatHandicap(player.handicap)} Handicap
                    </p>
                    <div className="mt-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center px-3 py-0.5 rounded-full text-eyebrow font-medium',
                          statusBadgeStyles(playerStatus),
                        )}
                      >
                        {playerStatus}
                      </span>
                    </div>
                  </div>

                  <CompositeRatingCircle rating={compositeRating} />
                </div>
              </div>

              {/* Category Breakdown Card */}
              <div className="surface-matte rounded-3xl p-6 md:p-7">
                <h3 className="text-body md:text-body-lg font-medium text-warm-700 tracking-[-0.012em] mb-4">Category Breakdown</h3>
                <div className="space-y-3">
                  <CategoryBar label="Tee Game" value={categoryBreakdown.teeGame} />
                  <CategoryBar label="Approach" value={categoryBreakdown.approach} />
                  <CategoryBar label="Short Game (Est.)" value={categoryBreakdown.shortGame} />
                  <CategoryBar label="Putting" value={categoryBreakdown.putting} />
                  <CategoryBar label="Scoring" value={categoryBreakdown.scoring} />
                </div>
              </div>

              {/* Trend Summary Card */}
              <div className="surface-matte rounded-3xl p-6 md:p-7">
                <h3 className="text-body md:text-body-lg font-medium text-warm-700 tracking-[-0.012em] mb-4">Trend Summary</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-cream-50/55 rounded-2xl p-4 text-center">
                    <p className="text-xs text-warm-500 font-medium uppercase tracking-wide mb-1">Recent Avg</p>
                    {trendSummary.recentAvg !== 0 ? (
                      <AnimatedNumber
                        value={trendSummary.recentAvg}
                        decimals={1}
                        prefix={trendSummary.recentAvg > 0 ? '+' : ''}
                        staggerIndex={0}
                        className="text-h3 md:text-h2 font-light text-warm-900 tabular-nums tracking-[-0.022em]"
                      />
                    ) : (
                      <p className="text-h3 md:text-h2 font-light text-warm-900 tabular-nums tracking-[-0.022em]">--</p>
                    )}
                  </div>
                  <div className="bg-cream-50/55 rounded-2xl p-4 text-center">
                    <p className="text-xs text-warm-500 font-medium uppercase tracking-wide mb-1">Previous Avg</p>
                    {trendSummary.previousAvg !== 0 ? (
                      <AnimatedNumber
                        value={trendSummary.previousAvg}
                        decimals={1}
                        prefix={trendSummary.previousAvg > 0 ? '+' : ''}
                        staggerIndex={1}
                        className="text-h3 md:text-h2 font-light text-warm-900 tabular-nums tracking-[-0.022em]"
                      />
                    ) : (
                      <p className="text-h3 md:text-h2 font-light text-warm-900 tabular-nums tracking-[-0.022em]">--</p>
                    )}
                  </div>
                  <div className="bg-cream-50/55 rounded-2xl p-4 text-center">
                    <p className="text-xs text-warm-500 font-medium uppercase tracking-wide mb-1">Streak</p>
                    {trendSummary.streakCount > 0 ? (
                      <AnimatedNumber
                        value={trendSummary.streakCount}
                        decimals={0}
                        staggerIndex={2}
                        className={cn(
                          'text-body-lg font-medium tracking-[-0.005em] tabular-nums',
                          trendSummary.streakType === 'positive' ? 'text-emerald-600' :
                          trendSummary.streakType === 'negative' ? 'text-red-500' : 'text-warm-900',
                        )}
                      />
                    ) : (
                      <p className="text-body-lg font-medium tracking-[-0.005em] tabular-nums text-warm-900">--</p>
                    )}
                  </div>
                </div>
                {trendSummary.trend !== 'stable' && (
                  <div className={cn(
                    'mt-3 flex items-center gap-2 text-sm font-medium',
                    trendSummary.trend === 'improving' ? 'text-emerald-600' : 'text-amber-600',
                  )}>
                    <IconTrendingUp
                      size={16}
                      className={trendSummary.trend === 'declining' ? 'rotate-180' : ''}
                    />
                    <span>
                      {trendSummary.trend === 'improving' ? 'Trending down (improving)' : 'Trending up (declining)'}
                    </span>
                  </div>
                )}
              </div>

              {/* Active Patterns Card — premium */}
              <div className="surface-matte rounded-3xl overflow-hidden">
                <div className="px-6 md:px-7 pt-6 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-body-lg md:text-h3 font-medium tracking-[-0.012em] text-warm-700">
                      Active Patterns
                    </h3>
                    <span className="text-caption font-medium text-warm-400 tabular-nums">
                      {patterns.length}
                    </span>
                  </div>
                </div>
                {patterns.length === 0 ? (
                  <p className="text-body-sm text-warm-400 text-center pb-8 px-6">No active patterns detected</p>
                ) : (
                  <ul className="divide-y divide-warm-200/30">
                    {patterns.map((pattern) => (
                      <li key={pattern.id} className="px-6 md:px-7 py-4 hover:bg-cream-50/55 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', severityDotColor(pattern.severity))} aria-hidden="true" />
                            <span className="text-body-sm font-medium tracking-[-0.005em] text-warm-900 truncate">
                              {pattern.name ?? 'Pattern'}
                            </span>
                          </div>
                          {pattern.stroke_impact !== null && (
                            <span className={cn(
                              'text-eyebrow font-medium tabular-nums flex-shrink-0 px-2 py-0.5 rounded-full',
                              pattern.stroke_impact < 0
                                ? 'bg-rose-50/65 text-rose-700'
                                : 'bg-emerald-50/65 text-emerald-700',
                            )}>
                              {pattern.stroke_impact > 0 ? '+' : ''}{pattern.stroke_impact.toFixed(1)}/rd
                            </span>
                          )}
                        </div>
                        {pattern.description && (
                          <p className="text-caption text-warm-500 line-clamp-2 leading-relaxed mb-2 pl-3.5">
                            {pattern.description}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2 pl-3.5">
                          <div className="flex items-center gap-1.5 text-eyebrow text-warm-400">
                            <span className="capitalize">{pattern.lifecycle_state ?? 'detected'}</span>
                            {pattern.first_detected && (
                              <>
                                <span aria-hidden>·</span>
                                <span>{formatRelativeDate(pattern.first_detected)}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/golf/dashboard/patterns?pattern=${pattern.id}`}
                              className="text-eyebrow font-medium text-primary-700 hover:text-primary-800 transition-colors duration-300"
                            >
                              Details
                            </Link>
                            <span className="text-warm-200" aria-hidden>·</span>
                            <Link
                              href={`/golf/dashboard/development?player=${player.id}`}
                              className="text-eyebrow font-medium text-primary-700 hover:text-primary-800 transition-colors duration-300"
                            >
                              Focus
                            </Link>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* ============================================================= */}
            {/* RIGHT COLUMN */}
            {/* ============================================================= */}
            <div className="lg:col-span-7 space-y-6">
              {/* AI Insights — migrated to the unified primitive. */}
              <div className="surface-matte rounded-3xl p-6 md:p-7" data-testid="player-insight-section">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <h3 className="text-body md:text-body-lg font-medium text-warm-700 tracking-[-0.012em]">AI Insights</h3>
                    <span className="text-xs text-warm-400 font-medium">
                      {insights.length} insight{insights.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <Button variant="primary"
                    type="button"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                      'border border-primary-200 bg-primary-50 text-primary-700',
                      'hover:bg-primary-100 hover:border-primary-300 transition-colors',
                      'disabled:opacity-60 disabled:cursor-not-allowed',
                    )}
                    data-testid="refresh-player-analysis"
                    aria-label="Refresh AI analysis for this player"
                  >
                    <IconActivity size={14} className={isRefreshing ? 'animate-pulse' : ''} />
                    {isRefreshing ? 'Analyzing…' : 'Refresh Analysis'}
                  </Button>
                </div>
                {refreshNotice && (
                  <div
                    className={cn(
                      'mb-3 text-xs rounded-lg px-3 py-2 border',
                      refreshNotice.tone === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200',
                    )}
                    role="status"
                  >
                    {refreshNotice.text}
                  </div>
                )}
                {insightsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-24 rounded-xl skeleton-shimmer" />
                    ))}
                  </div>
                ) : insights.length === 0 ? (
                  <EmptyState
                    variant="compact"
                    icon={<IconActivity size={24} />}
                    title="No insights generated yet"
                    description="Click Refresh Analysis above to run the engine for this player."
                  />
                ) : (
                  <div className="space-y-4">
                    {heroInsight && (
                      <InsightCard
                        insight={heroInsight}
                        density="hero"
                        audience="coach"
                        showActions
                        onAction={handleAction}
                      />
                    )}
                    {restInsights.length > 0 && (
                      <div className="space-y-3">
                        {restInsights.map((insight) => (
                          <InsightCard
                            key={insight.id}
                            insight={insight}
                            density="default"
                            audience="coach"
                            showActions
                            onAction={handleAction}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Prescribed Practice Plan — synthesized from insights +
                  patterns + category breakdown. Sits above Focus Areas so
                  "the coach sees what to prescribe" flows naturally into
                  "save it as a focus area". */}
              <PrescribedPracticePlanCard
                playerId={player.id}
                coachId={coachId}
                insights={insights}
                patterns={patterns}
                categoryBreakdown={categoryBreakdown}
                focusAreas={focusAreas}
                isRefreshing={isRefreshing}
              />

              {/* Focus Areas Card */}
              <div className="surface-matte rounded-3xl p-6 md:p-7">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-body md:text-body-lg font-medium text-warm-700 tracking-[-0.012em]">Focus Areas</h3>
                  <Link
                    href={`/golf/dashboard/development?player=${player.id}`}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    Manage
                  </Link>
                </div>
                {focusAreas.length === 0 ? (
                  <EmptyState
                    variant="compact"
                    icon={<IconTarget size={24} />}
                    title="No focus areas set"
                    description="Set focus areas to track this player's development priorities."
                    action={{
                      label: 'Create Focus Area',
                      href: `/golf/dashboard/development?player=${player.id}`,
                    }}
                  />
                ) : (
                  <div className="space-y-3">
                    {focusAreas.map((fa) => {
                      const progress = fa.current_value && fa.target_value
                        ? Math.min(100, Math.round((fa.current_value / fa.target_value) * 100))
                        : 0;
                      return (
                        <div key={fa.id} className="bg-cream-50/55 rounded-2xl p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <IconTarget size={14} className="text-warm-400 flex-shrink-0" />
                              <span className="text-sm font-medium text-warm-900 truncate">{fa.title ?? 'Focus Area'}</span>
                            </div>
                            <span
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-eyebrow font-medium border capitalize flex-shrink-0',
                                focusAreaStatusBadge(fa.status),
                              )}
                            >
                              {fa.status ?? 'active'}
                            </span>
                          </div>
                          {fa.target_value !== null && (
                            <div>
                              <div className="flex items-center justify-between text-eyebrow text-warm-400 mb-1">
                                <span>{fa.current_value ?? 0}</span>
                                <span>{fa.target_value}</span>
                              </div>
                              <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary-500 rounded-full transition-all duration-500"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}
                          <p className="text-eyebrow text-warm-400">
                            Started {formatRelativeDate(fa.created_at)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Predictions Card */}
              {predictions.length > 0 && (
                <div className="surface-matte rounded-3xl p-6 md:p-7">
                  <h3 className="text-body md:text-body-lg font-medium text-warm-700 tracking-[-0.012em] mb-4">Predictions</h3>
                  <div className="space-y-3">
                    {predictions.map((pred) => (
                      <div key={pred.id} className="bg-cream-50/55 rounded-2xl p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-warm-900 truncate">{formatMetricLabel(pred.metric)}</p>
                          {pred.due_date && (
                            <p className="text-eyebrow text-warm-400 mt-0.5">Due {formatRelativeDate(pred.due_date)}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {pred.predicted_value !== null && (
                            <AnimatedNumber
                              value={pred.predicted_value}
                              decimals={1}
                              className="text-h3 md:text-h2 font-light text-warm-900 tabular-nums tracking-[-0.022em]"
                            />
                          )}
                          {pred.confidence !== null && (
                            <p className="text-eyebrow text-warm-400 tabular-nums">{Math.round(pred.confidence * 100)}% conf</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Rounds Card */}
              <div className="surface-matte rounded-3xl p-6 md:p-7">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-body md:text-body-lg font-medium text-warm-700 tracking-[-0.012em]">Recent Rounds</h3>
                  <Link
                    href={`/golf/dashboard/stats?player=${player.id}`}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors"
                  >
                    View All Stats
                  </Link>
                </div>
                {rounds.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-3">
                      <IconChartBar size={24} className="text-warm-300" />
                    </div>
                    <p className="text-sm text-warm-400">No rounds recorded yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rounds.slice(0, 5).map((round) => {
                      const diff = round.score_to_par ?? null;
                      return (
                        <Link
                          key={round.id}
                          href={`/golf/dashboard/rounds/${round.id}/review`}
                          className="flex items-center justify-between bg-warm-50/60 rounded-xl p-3.5 hover:bg-warm-50 transition-colors group"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-warm-900 truncate group-hover:text-primary-700 transition-colors">
                              {round.course_name ?? 'Unknown Course'}
                            </p>
                            <p className="text-eyebrow text-warm-400 mt-0.5">
                              {formatRelativeDate(round.round_date ?? round.created_at)}
                              {round.holes_played && ` · ${round.holes_played} holes`}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {round.total_score !== null ? (
                              <AnimatedNumber
                                value={round.total_score}
                                decimals={0}
                                className="text-h3 md:text-h2 font-light text-warm-900 tabular-nums tracking-[-0.022em]"
                              />
                            ) : (
                              <p className="text-h3 md:text-h2 font-light text-warm-900 tabular-nums tracking-[-0.022em]">--</p>
                            )}
                            {diff !== null && (
                              <p className={cn(
                                'text-xs font-medium tabular-nums',
                                diff <= 0 ? 'text-emerald-600' : diff <= 5 ? 'text-warm-500' : 'text-red-500',
                              )}>
                                {diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}
                              </p>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="fixed bottom-0 left-0 right-0 lg:static lg:mt-6 z-20">
            <div className="bg-cream-50/92 backdrop-blur-xl border-t border-warm-200/60 lg:border lg:rounded-2xl lg:border-white/20 lg:bg-cream-100/75 p-4 lg:p-5">
              <div className="max-w-[1536px] mx-auto flex items-center gap-3 overflow-x-auto">
                <Link
                  href={`/golf/dashboard/messages?player=${player.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-warm-900 text-white text-sm font-medium rounded-xl hover:bg-warm-800 active:scale-[0.98] transition-all flex-shrink-0"
                >
                  <IconMessage size={16} />
                  Message Player
                </Link>
                <Link
                  href={`/golf/dashboard/development?player=${player.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-white border border-warm-200 text-warm-700 text-sm font-medium rounded-xl hover:bg-warm-50 hover:border-warm-300 active:scale-[0.98] transition-all flex-shrink-0"
                >
                  <IconTarget size={16} />
                  Create Focus Area
                </Link>
                <Link
                  href={`/golf/dashboard/stats?player=${player.id}`}
                  className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-white border border-warm-200 text-warm-700 text-sm font-medium rounded-xl hover:bg-warm-50 hover:border-warm-300 active:scale-[0.98] transition-all flex-shrink-0"
                >
                  <IconChartBar size={16} />
                  View Full Stats
                </Link>
                <Link
                  href={`/golf/dashboard/calendar`}
                  className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] bg-white border border-warm-200 text-warm-700 text-sm font-medium rounded-xl hover:bg-warm-50 hover:border-warm-300 active:scale-[0.98] transition-all flex-shrink-0"
                >
                  <IconEye size={16} />
                  Schedule Practice
                </Link>
              </div>
            </div>
          </div>

          {/* Spacer for fixed bottom bar on mobile */}
          <div className="h-20 lg:hidden" />
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
