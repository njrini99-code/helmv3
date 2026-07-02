'use client';

/**
 * MyStatsClient
 *
 * Player's personal stats dashboard — Living Annual migration
 * (design-system-living-annual.md §7; execution plan §3.1 my-stats).
 *
 * PRESENTATION ONLY: the `getMyStats()` / `getMyAggregates()` fetch, the
 * loading/refreshing/error state machine, and every branch condition below
 * are unchanged from the pre-migration client — only the JSX composing them
 * is rebuilt from the kit. `player-stats/*` (4) + `season-stats/MySeasonStats`
 * are migrated alongside this file; together they are the whole of my-stats
 * (no overlap with the coach-facing Stats Center, which is its own surface).
 */

import { useState, useEffect } from 'react';
import { IconRefresh } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  StatsOverviewCards,
  GameVsPracticeChart,
  TrendChart,
  SessionHistory,
} from '@/components/baseball/player-stats';
import { MySeasonStats } from '@/components/baseball/season-stats/MySeasonStats';
import { getMyStats, getMyAggregates } from '@/app/baseball/actions/stats';
import { fairwayScope } from '@/lib/redesign/flag';
import {
  SectionMasthead,
  KPIContentsStrip,
  InkBadge,
  EditorsLetter,
  EmptyIssue,
  formatRate,
} from '@/components/baseball/living-annual';
import type { BaseballPlayerStats, BaseballPlayerAggregates } from '@/lib/types';

interface PlayerInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  jersey_number: string | null;
}

function MyStatsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-4 w-40 overflow-hidden rounded-fw-sm">
        <div className="h-full w-full skeleton-shimmer" />
      </div>
      <div className="h-10 w-64 overflow-hidden rounded-fw-sm">
        <div className="h-full w-full skeleton-shimmer" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="relative h-40 overflow-hidden rounded-card border border-[color:var(--hairline)]">
          <div className="absolute inset-0 skeleton-shimmer" style={{ animationDelay: `${i * 60}ms` }} />
        </div>
      ))}
    </div>
  );
}

export function MyStatsClient() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<BaseballPlayerStats[]>([]);
  const [aggregates, setAggregates] = useState<BaseballPlayerAggregates | null>(null);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);

  async function fetchData(showRefreshing = false) {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [statsResult, aggregatesResult] = await Promise.all([
        getMyStats(),
        getMyAggregates(),
      ]);

      if (statsResult.error) {
        setError(statsResult.error);
        return;
      }

      if (aggregatesResult.error) {
        setError(aggregatesResult.error);
        return;
      }

      setStats(statsResult.data || []);
      setAggregates(aggregatesResult.data);
      setPlayer(aggregatesResult.player as PlayerInfo);
      setTeamName(aggregatesResult.teamName);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError('Failed to load your stats. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6">
          <MyStatsSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={fairwayScope('min-h-full')}>
        <div className="mx-auto w-full max-w-[1536px] px-4 py-12 sm:px-6">
          <EditorsLetter
            ink="team"
            title="Unable to load your stats."
            body={error}
            action={
              <Button variant="secondary" size="md" onClick={() => fetchData()}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const fullName = player ? `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Player' : 'Player';
  const positions = player ? [player.primary_position, player.secondary_position].filter(Boolean).join(' / ') : '';
  const eyebrow = ['MY STATS', positions, player?.grad_year ? `Class of ${player.grad_year}` : null, teamName]
    .filter(Boolean)
    .join(' · ');

  const mastheadActions = (
    <div className="flex items-center gap-2">
      {player?.jersey_number ? <InkBadge label={`# ${player.jersey_number}`} tone="team" variant="solid" /> : null}
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<IconRefresh size={16} className={refreshing ? 'animate-spin' : ''} />}
        onClick={() => fetchData(true)}
        disabled={refreshing}
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
  );

  const hasAnyData = stats.length > 0 || Boolean(aggregates);

  return (
    <div className={fairwayScope('min-h-full')}>
      <div className="mx-auto w-full max-w-[1536px] px-4 py-8 sm:px-6">
        <SectionMasthead eyebrow={eyebrow} title={fullName} actions={mastheadActions} />

        {/* Season stats from box scores (new system) */}
        <div className="mt-8">
          <MySeasonStats />
        </div>

        {/* Quick glance — sessions logged, trend, last-5 form. Practice-vs-game
            and full career slash line live in their own dedicated cards below,
            so this strip stays a 3-figure glance, not a duplicate of them. */}
        {aggregates ? (
          <div className="mt-8">
            <KPIContentsStrip
              columns={3}
              items={[
                { label: 'Sessions', value: aggregates.total_sessions },
                {
                  label: 'Trend',
                  value: aggregates.recent_trend
                    ? aggregates.recent_trend.charAt(0).toUpperCase() + aggregates.recent_trend.slice(1)
                    : '—',
                  emphasis: aggregates.recent_trend === 'improving',
                },
                {
                  label: 'Last 5 AVG',
                  value: aggregates.last_5_avg != null ? formatRate(aggregates.last_5_avg, 3) : '—',
                },
              ]}
            />
          </div>
        ) : null}

        {!hasAnyData ? (
          <div className="mt-8">
            <EmptyIssue variant="stats" />
          </div>
        ) : null}

        {hasAnyData ? (
          <section aria-label="Key Statistics" className="mt-8">
            <h2 className="sr-only">Key Statistics</h2>
            <StatsOverviewCards aggregates={aggregates} />
          </section>
        ) : null}

        {stats.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section aria-label="Performance Trend">
              <TrendChart stats={stats} />
            </section>
            <section aria-label="Game vs Practice Comparison">
              <GameVsPracticeChart stats={stats} />
            </section>
          </div>
        ) : null}

        {stats.length > 0 ? (
          <section aria-label="Session History" className="mt-8">
            <SessionHistory stats={stats} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
