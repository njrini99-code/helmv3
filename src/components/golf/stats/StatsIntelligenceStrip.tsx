'use client';

/**
 * CoachHelm AI strip on the Stats page.
 *
 * Reads engine output (category ratings + evidence-backed insights) that
 * have already been computed and persisted by the round-submit trigger,
 * safety-net cron, or nightly roster-sweep. The strip never invokes the
 * engine itself — the `refreshKey` prop just causes it to re-read from the
 * DB after a parent-initiated refresh.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  IconSparkles,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconActivity,
  IconChevronRight,
} from '@/components/icons';
import { InsightCard } from '@/components/golf/coachhelm/insight-card';
import {
  getPlayerStatsIntelligence,
  type PlayerStatsIntelligence,
} from '@/app/golf/actions/stats-intelligence';

interface StatsIntelligenceStripProps {
  playerId: string;
  /** Audience controls InsightCard copy/CTA shape. */
  audience: 'player' | 'coach';
  /** Bumping this triggers a re-fetch — parent wires it to the page Refresh. */
  refreshKey?: number;
}

const CATEGORY_LABELS: Array<{
  key: 'teeGame' | 'approach' | 'shortGame' | 'putting' | 'scoring';
  label: string;
}> = [
  { key: 'teeGame', label: 'Tee Game' },
  { key: 'approach', label: 'Approach' },
  { key: 'shortGame', label: 'Short Game' },
  { key: 'putting', label: 'Putting' },
  { key: 'scoring', label: 'Scoring' },
];

function ratingColor(value: number): string {
  if (value >= 80) return 'text-emerald-600';
  if (value >= 60) return 'text-primary-600';
  if (value >= 40) return 'text-amber-500';
  return 'text-red-500';
}

function ratingBarColor(value: number): string {
  if (value >= 80) return 'bg-emerald-500';
  if (value >= 60) return 'bg-primary-500';
  if (value >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function ratingBarBg(value: number): string {
  if (value >= 80) return 'bg-emerald-100';
  if (value >= 60) return 'bg-primary-100';
  if (value >= 40) return 'bg-amber-100';
  return 'bg-red-100';
}

function TrendBadge({ trend }: { trend: PlayerStatsIntelligence['trend'] }) {
  if (!trend) return null;
  const meta =
    trend.direction === 'improving'
      ? { icon: IconTrendingUp, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Improving' }
      : trend.direction === 'declining'
        ? { icon: IconTrendingDown, color: 'text-red-600 bg-red-50 border-red-200', label: 'Declining' }
        : { icon: IconMinus, color: 'text-warm-600 bg-warm-100 border-warm-200', label: 'Stable' };
  const Icon = meta.icon;
  const deltaLabel =
    trend.deltaStrokes === 0
      ? null
      : ` ${trend.deltaStrokes > 0 ? '+' : ''}${trend.deltaStrokes.toFixed(1)}/rd`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border tabular-nums',
        meta.color,
      )}
      title={`Last ${trend.sampleRecent} vs prior ${trend.samplePrior} rounds`}
    >
      <Icon size={12} />
      {meta.label}
      {deltaLabel && <span className="text-[10px] opacity-80">{deltaLabel}</span>}
    </span>
  );
}

export function StatsIntelligenceStrip({
  playerId,
  audience,
  refreshKey = 0,
}: StatsIntelligenceStripProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlayerStatsIntelligence | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await getPlayerStatsIntelligence(playerId);
        if (cancelled) return;
        if (res.success && res.data) {
          setData(res.data);
        } else {
          setError(res.error ?? 'Could not load CoachHelm analysis');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unexpected error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId, refreshKey]);

  const hasRatings = data?.categories != null;
  const hasInsights = (data?.insights.length ?? 0) > 0;
  const sampleTooSmall = (data?.sampleSize ?? 0) < 3;

  const composite = data?.composite ?? data?.categories?.overall ?? null;
  const compositeDisplay = composite != null ? Math.round(composite) : null;

  // The full insight feed lives at /dashboard/coachhelm. The stats strip
  // previously rendered up to 3 insights, duplicating content. Trim to the
  // top insight and lean on the "View all" link to the dedicated surface.
  const topInsightRow = useMemo(() => data?.insights[0] ?? null, [data]);

  if (loading) {
    return (
      <div className="glass-premium rounded-2xl p-5 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-warm-100" />
          <div className="h-4 w-48 bg-warm-100 rounded" />
        </div>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-2.5 rounded-full bg-warm-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-premium rounded-2xl p-5 border border-red-100/60">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <IconSparkles size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">CoachHelm analysis unavailable</p>
            <p className="text-xs text-red-600/80 mt-0.5">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasRatings && !hasInsights) {
    return (
      <div className="glass-premium rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <IconSparkles size={18} className="text-primary-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warm-900">CoachHelm AI</p>
            <p className="text-xs text-warm-500 mt-0.5 leading-relaxed">
              {sampleTooSmall
                ? 'Need at least 3 teammates with stats cached to compute category ratings. CoachHelm will surface ratings + insights as more rounds are logged.'
                : 'No engine output yet. The next round submission (or tonight’s roster sweep) will populate ratings and insights here.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-premium rounded-2xl p-5 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <IconSparkles size={18} className="text-primary-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warm-900">CoachHelm AI</p>
            <p className="text-xs text-warm-500 mt-0.5">
              {hasRatings ? 'Engine-derived category ratings + insights' : 'Evidence-backed insights'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {compositeDisplay != null && (
            <span
              className={cn(
                'inline-flex items-baseline gap-1 text-sm font-semibold tabular-nums px-2.5 py-1 rounded-full border border-warm-200 bg-cream-100/75',
                ratingColor(compositeDisplay),
              )}
            >
              {compositeDisplay}
              <span className="text-[10px] font-medium text-warm-400">/100</span>
            </span>
          )}
          <TrendBadge trend={data?.trend ?? null} />
        </div>
      </div>

      {/* Category bars */}
      {hasRatings && data?.categories && (
        <div className="space-y-2.5">
          {CATEGORY_LABELS.map(({ key, label }) => {
            const value = data.categories![key];
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs font-medium text-warm-600 w-24 shrink-0">{label}</span>
                <div className={cn('flex-1 h-2 rounded-full overflow-hidden', ratingBarBg(value))}>
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-700', ratingBarColor(value))}
                    style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                  />
                </div>
                <span className={cn('text-xs font-semibold tabular-nums w-8 text-right', ratingColor(value))}>
                  {Math.round(value)}
                </span>
              </div>
            );
          })}
          {sampleTooSmall && (
            <p className="text-[11px] text-warm-400 pt-1">
              Ratings are more reliable when the team has 3+ players with cached stats.
            </p>
          )}
        </div>
      )}

      {/* Top insight (single — full feed lives on /coachhelm) */}
      {hasInsights && topInsightRow && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-warm-500">
              Top insight
            </p>
            <Link
              href="/golf/dashboard/coachhelm"
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary-600 hover:text-primary-700"
            >
              View all in CoachHelm
              <IconChevronRight size={12} />
            </Link>
          </div>
          <InsightCard
            insight={topInsightRow}
            density="default"
            audience={audience}
          />
        </div>
      )}

      {hasRatings && !hasInsights && (
        <div className="rounded-xl bg-warm-50/70 border border-warm-100 px-3 py-2.5 flex items-start gap-2">
          <IconActivity size={14} className="text-warm-400 mt-0.5 shrink-0" />
          <p className="text-xs text-warm-500 leading-relaxed">
            No evidence-backed insights yet. Patterns surface once they hold across multiple rounds.
          </p>
        </div>
      )}
    </div>
  );
}
