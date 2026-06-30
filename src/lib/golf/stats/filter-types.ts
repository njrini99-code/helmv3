/**
 * Stats filter types shared by server actions and lib query modules.
 *
 * Re-exported from stats-data-types.ts for backwards compatibility.
 */

export interface StatsFilter {
  preset?: 'last5' | 'last10' | 'last20' | 'tournaments' | 'practice' | 'thisMonth' | 'thisYear' | 'custom';
  startDate?: string;
  endDate?: string;
  courseName?: string;
  roundType?: 'practice' | 'qualifier' | 'tournament';
  season?: number;
}
