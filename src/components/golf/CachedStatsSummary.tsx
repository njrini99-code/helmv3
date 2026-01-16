'use client';

/**
 * Cached Stats Summary Component
 *
 * Displays player stats from the cache with auto-refresh.
 * Shows a stale indicator when data needs refresh.
 */

import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useCachedStats } from '@/hooks/useCachedStats';
import { cn } from '@/lib/utils';

interface CachedStatsSummaryProps {
  /**
   * Player ID to show stats for. If not provided, shows current user's stats.
   */
  playerId?: string;

  /**
   * Display mode
   * - compact: Single row summary
   * - full: Grid of stat cards
   */
  mode?: 'compact' | 'full';

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Whether to show the refresh button
   */
  showRefresh?: boolean;
}

export function CachedStatsSummary({
  playerId,
  mode = 'full',
  className,
  showRefresh = true,
}: CachedStatsSummaryProps) {
  const { stats, loading, error, isStale, refresh, lastUpdated } = useCachedStats({
    playerId,
    autoRefresh: true,
  });

  if (loading && !stats) {
    return <StatsSkeleton mode={mode} className={className} />;
  }

  if (error) {
    return (
      <div className={cn('text-sm text-red-600', className)}>
        Failed to load stats: {error}
      </div>
    );
  }

  if (!stats || stats.roundsPlayed === 0) {
    return (
      <div className={cn('text-sm text-warm-500', className)}>
        No rounds recorded yet. Submit a round to see your stats.
      </div>
    );
  }

  const TrendIcon = stats.trendDirection === 'improving' ? TrendingDown :
                    stats.trendDirection === 'declining' ? TrendingUp : Minus;
  const trendColor = stats.trendDirection === 'improving' ? 'text-green-600' :
                     stats.trendDirection === 'declining' ? 'text-red-600' : 'text-warm-400';
  const trendText = stats.trendDirection === 'improving' ? 'Improving' :
                    stats.trendDirection === 'declining' ? 'Declining' : 'Stable';

  if (mode === 'compact') {
    return (
      <div className={cn('flex items-center gap-6', className)}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-warm-500">Avg:</span>
          <span className="font-semibold text-warm-900">
            {stats.scoringAverage?.toFixed(1) ?? '-'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-warm-500">Rounds:</span>
          <span className="font-semibold text-warm-900">{stats.roundsPlayed}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-warm-500">Best:</span>
          <span className="font-semibold text-warm-900">{stats.bestRound ?? '-'}</span>
        </div>
        <div className={cn('flex items-center gap-1', trendColor)}>
          <TrendIcon className="h-4 w-4" />
          <span className="text-sm">{trendText}</span>
        </div>
        {isStale && (
          <span className="text-xs text-warm-400">(updating...)</span>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-warm-900">Stats Summary</h3>
        <div className="flex items-center gap-3">
          {isStale && (
            <span className="text-xs text-warm-400 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              Updating...
            </span>
          )}
          {lastUpdated && !isStale && (
            <span className="text-xs text-warm-400">
              Updated {formatTimeAgo(lastUpdated)}
            </span>
          )}
          {showRefresh && (
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors disabled:opacity-50"
              title="Refresh stats"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Scoring Avg"
          value={stats.scoringAverage?.toFixed(1) ?? '-'}
          subValue={stats.last5Average ? `Last 5: ${stats.last5Average.toFixed(1)}` : undefined}
        />
        <StatCard
          label="Rounds Played"
          value={stats.roundsPlayed.toString()}
          subValue={stats.bestRound ? `Best: ${stats.bestRound}` : undefined}
        />
        <StatCard
          label="GIR %"
          value={stats.girPercentage ? `${stats.girPercentage.toFixed(1)}%` : '-'}
        />
        <StatCard
          label="Fairways %"
          value={stats.fairwayPercentage ? `${stats.fairwayPercentage.toFixed(1)}%` : '-'}
        />
        <StatCard
          label="Putts/Round"
          value={stats.puttsPerRound?.toFixed(1) ?? '-'}
        />
        <StatCard
          label="Scrambling %"
          value={stats.scramblingPercentage ? `${stats.scramblingPercentage.toFixed(1)}%` : '-'}
        />
        <StatCard
          label="Trend"
          value={trendText}
          subValue={stats.improvementTrend ?
            `${stats.improvementTrend > 0 ? '+' : ''}${stats.improvementTrend.toFixed(1)} strokes` :
            undefined
          }
          valueColor={trendColor}
        />
        <StatCard
          label="Best Round"
          value={stats.bestRound?.toString() ?? '-'}
          subValue={stats.worstRound ? `Worst: ${stats.worstRound}` : undefined}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subValue,
  valueColor = 'text-warm-900',
}: {
  label: string;
  value: string;
  subValue?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-xl p-4">
      <p className="text-sm text-warm-500 mb-1">{label}</p>
      <p className={cn('text-2xl font-semibold', valueColor)}>{value}</p>
      {subValue && (
        <p className="text-xs text-warm-400 mt-1">{subValue}</p>
      )}
    </div>
  );
}

function StatsSkeleton({ mode, className }: { mode: 'compact' | 'full'; className?: string }) {
  if (mode === 'compact') {
    return (
      <div className={cn('flex items-center gap-6 animate-pulse', className)}>
        <div className="h-5 w-16 bg-warm-200 rounded" />
        <div className="h-5 w-16 bg-warm-200 rounded" />
        <div className="h-5 w-16 bg-warm-200 rounded" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4 animate-pulse', className)}>
      <div className="h-6 w-32 bg-warm-200 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-warm-100 rounded-xl p-4">
            <div className="h-4 w-16 bg-warm-200 rounded mb-2" />
            <div className="h-8 w-12 bg-warm-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default CachedStatsSummary;
