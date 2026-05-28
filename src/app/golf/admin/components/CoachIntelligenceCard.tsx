'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CoachIntelligenceCardProps {
  coaches: {
    id: string;
    name: string;
    teamName: string | null;
    totalPlayers: number;
    roundsReviewed: number;
    totalPlayerRounds: number;
    reviewRate: number;
    avgResponseTimeHours: number | null;
    insightsViewed: number;
    lastActiveAt: string | null;
    philosophyConfigured: boolean;
  }[];
}

type SortKey =
  | 'name'
  | 'totalPlayers'
  | 'reviewRate'
  | 'avgResponseTimeHours'
  | 'insightsViewed'
  | 'philosophyConfigured'
  | 'lastActiveAt';

type SortDir = 'asc' | 'desc';

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function isInactiveOver7Days(dateStr: string | null): boolean {
  if (!dateStr) return true;
  const ms = Date.now() - new Date(dateStr).getTime();
  return ms > 7 * 24 * 3600000;
}

export default function CoachIntelligenceCard({ coaches }: CoachIntelligenceCardProps) {
  const [sortKey, setSortKey] = useState<SortKey>('reviewRate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...coaches].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;

    switch (sortKey) {
      case 'name':
        return dir * a.name.localeCompare(b.name);
      case 'totalPlayers':
        return dir * (a.totalPlayers - b.totalPlayers);
      case 'reviewRate':
        return dir * (a.reviewRate - b.reviewRate);
      case 'avgResponseTimeHours': {
        const aVal = a.avgResponseTimeHours ?? Infinity;
        const bVal = b.avgResponseTimeHours ?? Infinity;
        return dir * (aVal - bVal);
      }
      case 'insightsViewed':
        return dir * (a.insightsViewed - b.insightsViewed);
      case 'philosophyConfigured': {
        const aVal = a.philosophyConfigured ? 1 : 0;
        const bVal = b.philosophyConfigured ? 1 : 0;
        return dir * (aVal - bVal);
      }
      case 'lastActiveAt': {
        const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        return dir * (aTime - bTime);
      }
      default:
        return 0;
    }
  });

  // Compute summary averages
  const totalCoaches = coaches.length;
  const avgPlayers =
    totalCoaches > 0
      ? Math.round(coaches.reduce((sum, c) => sum + c.totalPlayers, 0) / totalCoaches)
      : 0;
  const avgReviewRate =
    totalCoaches > 0
      ? coaches.reduce((sum, c) => sum + c.reviewRate, 0) / totalCoaches
      : 0;
  const coachesWithResponseTime = coaches.filter(
    (c) => c.avgResponseTimeHours !== null
  );
  const avgResponseTime =
    coachesWithResponseTime.length > 0
      ? coachesWithResponseTime.reduce(
          (sum, c) => sum + (c.avgResponseTimeHours ?? 0),
          0
        ) / coachesWithResponseTime.length
      : null;
  const avgInsightsViewed =
    totalCoaches > 0
      ? Math.round(
          coaches.reduce((sum, c) => sum + c.insightsViewed, 0) / totalCoaches
        )
      : 0;
  const philosophyCount = coaches.filter((c) => c.philosophyConfigured).length;

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return (
      <span className="ml-1 text-warm-400">
        {sortDir === 'asc' ? '\u2191' : '\u2193'}
      </span>
    );
  };

  const headerClass =
    'px-3 py-2 text-left text-xs font-medium text-warm-500 uppercase tracking-wider cursor-pointer select-none hover:text-warm-700 transition-colors';

  return (
    <div className="glass-standard rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-warm-900 mb-4">
        Coach Intelligence{' '}
        <span className="text-sm font-normal text-warm-500">
          ({totalCoaches} {totalCoaches === 1 ? 'coach' : 'coaches'})
        </span>
      </h2>

      {coaches.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-warm-500 text-sm">No coach data available</p>
        </div>
      ) : (
        <>
        {/* Desktop table — hidden on <md, horizontally scrollable from md up */}
        <div className="hidden md:block overflow-x-auto -mx-6 px-6">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-warm-200/60">
                <th
                  className={headerClass}
                  onClick={() => handleSort('name')}
                >
                  Coach{sortIndicator('name')}
                </th>
                <th
                  className={cn(headerClass, 'text-center')}
                  onClick={() => handleSort('totalPlayers')}
                >
                  Players{sortIndicator('totalPlayers')}
                </th>
                <th
                  className={cn(headerClass, 'text-center')}
                  onClick={() => handleSort('reviewRate')}
                >
                  Review Rate{sortIndicator('reviewRate')}
                </th>
                <th
                  className={cn(headerClass, 'text-center')}
                  onClick={() => handleSort('avgResponseTimeHours')}
                >
                  Avg Response{sortIndicator('avgResponseTimeHours')}
                </th>
                <th
                  className={cn(headerClass, 'text-center')}
                  onClick={() => handleSort('insightsViewed')}
                >
                  Insights{sortIndicator('insightsViewed')}
                </th>
                <th
                  className={cn(headerClass, 'text-center')}
                  onClick={() => handleSort('philosophyConfigured')}
                >
                  Philosophy{sortIndicator('philosophyConfigured')}
                </th>
                <th
                  className={cn(headerClass, 'text-right')}
                  onClick={() => handleSort('lastActiveAt')}
                >
                  Last Active{sortIndicator('lastActiveAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Summary row */}
              <tr className="border-b border-warm-200/40 bg-warm-50/50">
                <td className="px-3 py-2.5">
                  <span className="text-xs font-semibold text-warm-500 uppercase tracking-wide">
                    Averages
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-sm font-medium text-warm-700">
                  {avgPlayers}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className={cn(
                      'inline-block text-sm font-medium rounded-full px-2.5 py-0.5',
                      avgReviewRate >= 70
                        ? 'bg-primary-100 text-primary-700'
                        : avgReviewRate >= 30
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                    )}
                  >
                    {avgReviewRate.toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  {avgResponseTime !== null ? (
                    <span
                      className={cn(
                        'text-sm font-medium',
                        avgResponseTime < 24
                          ? 'text-primary-600'
                          : avgResponseTime < 72
                            ? 'text-amber-600'
                            : 'text-red-600'
                      )}
                    >
                      {avgResponseTime.toFixed(1)}h
                    </span>
                  ) : (
                    <span className="text-sm text-warm-400">&mdash;</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center text-sm font-medium text-warm-700">
                  {avgInsightsViewed}
                </td>
                <td className="px-3 py-2.5 text-center text-sm text-warm-500">
                  {philosophyCount}/{totalCoaches}
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-warm-400">
                  &mdash;
                </td>
              </tr>

              {/* Coach rows */}
              {sorted.map((coach) => {
                const inactive = isInactiveOver7Days(coach.lastActiveAt);

                return (
                  <tr
                    key={coach.id}
                    className={cn(
                      'border-b border-warm-100/60 transition-colors',
                      inactive
                        ? 'bg-red-50/40'
                        : 'hover:bg-warm-50/50'
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <div className="text-sm font-medium text-warm-900">
                        {coach.name}
                      </div>
                      {coach.teamName && (
                        <div className="text-xs text-warm-400 mt-0.5">
                          {coach.teamName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm text-warm-700">
                      {coach.totalPlayers}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={cn(
                          'inline-block text-sm font-medium rounded-full px-2.5 py-0.5',
                          coach.reviewRate >= 70
                            ? 'bg-primary-100 text-primary-700'
                            : coach.reviewRate >= 30
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                        )}
                      >
                        {coach.reviewRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {coach.avgResponseTimeHours !== null ? (
                        <span
                          className={cn(
                            'text-sm font-medium',
                            coach.avgResponseTimeHours < 24
                              ? 'text-primary-600'
                              : coach.avgResponseTimeHours < 72
                                ? 'text-amber-600'
                                : 'text-red-600'
                          )}
                        >
                          {coach.avgResponseTimeHours < 1
                            ? `${Math.round(coach.avgResponseTimeHours * 60)}m`
                            : `${coach.avgResponseTimeHours.toFixed(1)}h`}
                        </span>
                      ) : (
                        <span className="text-sm text-warm-400">&mdash;</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm text-warm-700">
                      {coach.insightsViewed}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {coach.philosophyConfigured ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-600">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-500">
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span
                        className={cn(
                          'text-sm',
                          inactive ? 'text-red-500 font-medium' : 'text-warm-500'
                        )}
                      >
                        {timeAgo(coach.lastActiveAt)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list — shown only on <md. One Card per row with the
            SAME columns / values / data as the desktop table (nothing dropped):
            the Averages summary row, then each coach with Players, Review Rate,
            Avg Response, Insights, Philosophy, Last Active. */}
        <div className="md:hidden space-y-3">
          {/* Summary card (mirrors the Averages summary row) */}
          <div className="rounded-xl border border-warm-200/60 bg-warm-50/50 p-4">
            <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-3">
              Averages
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-warm-400">Players</span>
                <span className="text-sm font-medium text-warm-700">{avgPlayers}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-warm-400">Review Rate</span>
                <span
                  className={cn(
                    'inline-block text-sm font-medium rounded-full px-2.5 py-0.5',
                    avgReviewRate >= 70
                      ? 'bg-primary-100 text-primary-700'
                      : avgReviewRate >= 30
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                  )}
                >
                  {avgReviewRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-warm-400">Avg Response</span>
                {avgResponseTime !== null ? (
                  <span
                    className={cn(
                      'text-sm font-medium',
                      avgResponseTime < 24
                        ? 'text-primary-600'
                        : avgResponseTime < 72
                          ? 'text-amber-600'
                          : 'text-red-600'
                    )}
                  >
                    {avgResponseTime.toFixed(1)}h
                  </span>
                ) : (
                  <span className="text-sm text-warm-400">&mdash;</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-warm-400">Insights</span>
                <span className="text-sm font-medium text-warm-700">{avgInsightsViewed}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-warm-400">Philosophy</span>
                <span className="text-sm text-warm-500">
                  {philosophyCount}/{totalCoaches}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-warm-400">Last Active</span>
                <span className="text-sm text-warm-400">&mdash;</span>
              </div>
            </div>
          </div>

          {/* One card per coach */}
          {sorted.map((coach) => {
            const inactive = isInactiveOver7Days(coach.lastActiveAt);

            return (
              <div
                key={coach.id}
                className={cn(
                  'rounded-xl border p-4 transition-colors',
                  inactive
                    ? 'border-red-200/60 bg-red-50/40'
                    : 'border-warm-100/60 bg-warm-50/40'
                )}
              >
                {/* Coach name + team + last active */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-warm-900 truncate">
                      {coach.name}
                    </div>
                    {coach.teamName && (
                      <div className="text-xs text-warm-400 mt-0.5 truncate">
                        {coach.teamName}
                      </div>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs flex-shrink-0',
                      inactive ? 'text-red-500 font-medium' : 'text-warm-500'
                    )}
                  >
                    {timeAgo(coach.lastActiveAt)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-warm-400">Players</span>
                    <span className="text-sm text-warm-700">{coach.totalPlayers}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-warm-400">Review Rate</span>
                    <span
                      className={cn(
                        'inline-block text-sm font-medium rounded-full px-2.5 py-0.5',
                        coach.reviewRate >= 70
                          ? 'bg-primary-100 text-primary-700'
                          : coach.reviewRate >= 30
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      )}
                    >
                      {coach.reviewRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-warm-400">Avg Response</span>
                    {coach.avgResponseTimeHours !== null ? (
                      <span
                        className={cn(
                          'text-sm font-medium',
                          coach.avgResponseTimeHours < 24
                            ? 'text-primary-600'
                            : coach.avgResponseTimeHours < 72
                              ? 'text-amber-600'
                              : 'text-red-600'
                        )}
                      >
                        {coach.avgResponseTimeHours < 1
                          ? `${Math.round(coach.avgResponseTimeHours * 60)}m`
                          : `${coach.avgResponseTimeHours.toFixed(1)}h`}
                      </span>
                    ) : (
                      <span className="text-sm text-warm-400">&mdash;</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-warm-400">Insights</span>
                    <span className="text-sm text-warm-700">{coach.insightsViewed}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-warm-400">Philosophy</span>
                    {coach.philosophyConfigured ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-600">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-500">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
