'use client';

// =============================================================================
// src/components/baseball/season-stats/SeasonStatsClient.tsx
//
// Thin client wrapper that owns the selected season year + displayed stats for
// the legacy season stats page. Wires SeasonStatsTable's existing (previously
// inert) `onYearChange`/`availableYears` props to the auth-checked
// `getTeamSeasonStats(teamId, seasonYear)` server action, mirroring the
// useTransition-based refetch pattern in StatsCenterClient.
// =============================================================================

import { useState, useTransition } from 'react';
import { SeasonStatsTable } from '@/components/baseball/season-stats/SeasonStatsTable';
import { getTeamSeasonStats } from '@/app/baseball/actions/games';
import type { BaseballPlayerSeasonStats } from '@/lib/types';
import { IconAlertCircle } from '@/components/icons';

interface SeasonStatsClientProps {
  initialStats: BaseballPlayerSeasonStats[];
  initialSeasonYear: number;
  teamId: string;
  availableYears: number[];
}

export function SeasonStatsClient({
  initialStats,
  initialSeasonYear,
  teamId,
  availableYears,
}: SeasonStatsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [seasonYear, setSeasonYear] = useState(initialSeasonYear);
  const [stats, setStats] = useState<BaseballPlayerSeasonStats[]>(initialStats);
  const [refetchError, setRefetchError] = useState<string | null>(null);

  function handleYearChange(year: number) {
    setSeasonYear(year);
    setRefetchError(null);

    startTransition(async () => {
      const result = await getTeamSeasonStats(teamId, year);
      if (result.success) {
        setStats(result.data ?? []);
      } else {
        setStats([]);
        setRefetchError(result.error ?? 'We could not load stats for that season. Please try again.');
      }
    });
  }

  return (
    <div className={isPending ? 'opacity-60 transition-opacity' : undefined} aria-busy={isPending}>
      {refetchError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <IconAlertCircle size={16} />
          <span>{refetchError}</span>
        </div>
      )}
      <SeasonStatsTable
        stats={stats}
        seasonYear={seasonYear}
        teamId={teamId}
        onYearChange={handleYearChange}
        availableYears={availableYears}
      />
    </div>
  );
}
