/**
 * Stats filter helpers — pure query condition builders.
 *
 * Shared by stats-data server actions and detailed-stats-query lib module.
 */

import type { StatsFilter } from '@/lib/golf/stats/filter-types';

/**
 * Build filter conditions for a Supabase query
 * Returns an object with filter functions to apply
 */
export function getFilterConditions(filter?: StatsFilter): {
  startDate: string | null;
  endDate: string | null;
  roundType: string | null;
  courseName: string | null;
} {
  if (!filter) {
    return { startDate: null, endDate: null, roundType: null, courseName: null };
  }

  const now = new Date();
  let startDateVal: string | null = null;
  let endDateVal: string | null = filter.endDate || null;

  if (filter.preset === 'thisMonth') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    startDateVal = monthStart.toISOString().split('T')[0] ?? null;
  } else if (filter.preset === 'thisYear') {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    startDateVal = yearStart.toISOString().split('T')[0] ?? null;
  } else if (filter.startDate) {
    startDateVal = filter.startDate;
  }

  if (filter.season) {
    const seasonStart = new Date(filter.season, 0, 1);
    const seasonEnd = new Date(filter.season, 11, 31);
    startDateVal = seasonStart.toISOString().split('T')[0] ?? null;
    endDateVal = seasonEnd.toISOString().split('T')[0] ?? null;
  }

  let roundType: string | null = null;
  if (filter.preset === 'tournaments') {
    roundType = 'tournament';
  } else if (filter.preset === 'practice') {
    roundType = 'practice';
  } else if (filter.roundType) {
    roundType = filter.roundType;
  }

  return {
    startDate: startDateVal,
    endDate: endDateVal,
    roundType,
    courseName: filter.courseName || null,
  };
}

export function applyRoundTypeFilter<T extends { in(column: string, values: string[]): T; eq(column: string, value: string): T }>(
  query: T,
  roundType: string | null
): T {
  if (!roundType) return query;
  if (roundType === 'qualifier') {
    return query.in('round_type', ['qualifier', 'qualifying']);
  }
  return query.eq('round_type', roundType);
}

export function applyPresetLimit<T>(rounds: T[], filter?: StatsFilter): T[] {
  if (!filter?.preset) return rounds;

  switch (filter.preset) {
    case 'last5':
      return rounds.slice(0, 5);
    case 'last10':
      return rounds.slice(0, 10);
    case 'last20':
      return rounds.slice(0, 20);
    default:
      return rounds;
  }
}
