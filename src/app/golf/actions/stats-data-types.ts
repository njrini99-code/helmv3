/**
 * Types for stats-data server actions.
 *
 * These are in a separate file because Next.js 'use server' files
 * must only export async functions — type/interface exports can
 * cause serialization errors at the server action boundary.
 */

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface StatsFilter {
  preset?: 'last5' | 'last10' | 'last20' | 'tournaments' | 'practice' | 'thisMonth' | 'thisYear' | 'custom';
  startDate?: string;
  endDate?: string;
  courseName?: string;
  roundType?: 'practice' | 'qualifier' | 'tournament';
  season?: number;
}

export interface FilterOptions {
  courses: string[];
  seasons: number[];
  roundTypes: string[];
}

// ============================================================================
// SUMMARY TYPES
// ============================================================================

export interface StatsSummary {
  roundsPlayed: number;
  holesPlayed: number;
  scoringAverage: number | null;
  bestRound: number | null;
  worstRound: number | null;
  girPercentage: number | null;
  fairwayPercentage: number | null;
  puttsPerRound: number | null;
  scramblingPercentage: number | null;
}

export interface RoundSummary {
  id: string;
  round_date: string;
  course_name: string | null;
  round_type: string | null;
  total_score: number | null;
  score_to_par: number | null;
}

export interface SummaryStatsResponse {
  summary: StatsSummary;
  rounds: RoundSummary[];
}

// ============================================================================
// TREND TYPES
// ============================================================================

export interface TrendDataPoint {
  date: string;
  value: number;
  roundId: string;
  courseName: string;
}

export interface RoundTrendData {
  id: string;
  date: string;
  score: number;
  toPar: number;
  courseName: string;
  roundType: string | null;
  holesPlayed: number;
  girPct: number | null;
  fairwayPct: number | null;
  putts: number | null;
  scrambling: number | null;
}

export interface TrendAnalysisResponse {
  rounds: RoundTrendData[];
  trends: {
    score: TrendDataPoint[];
    gir: TrendDataPoint[];
    fairway: TrendDataPoint[];
    putts: TrendDataPoint[];
  };
  rollingAverages: {
    score5: (number | null)[];
    score10: (number | null)[];
    score20: (number | null)[];
  };
  periodComparison: {
    /**
     * Width of each comparison period, in days — the coach's
     * `stats_benchmark_window_days` setting (default 30).
     *
     * REQUIRED, deliberately. The field names below stay `last30Days` /
     * `previous30Days` because they are the payload's shape contract across a
     * dozen call sites, but they no longer imply 30. Every label that says
     * "last N days" must read THIS number — making it optional would let a
     * producer forget it and have the UI confidently print "30" while
     * comparing 90-day windows.
     */
    windowDays: number;
    last30Days: {
      roundCount: number;
      scoringAvg: number | null;
      girPct: number | null;
      fairwayPct: number | null;
      puttsPerRound: number | null;
    };
    previous30Days: {
      roundCount: number;
      scoringAvg: number | null;
      girPct: number | null;
      fairwayPct: number | null;
      puttsPerRound: number | null;
    };
  };
  personalBests: {
    bestScore: { value: number; date: string; course: string } | null;
    bestToPar: { value: number; date: string; course: string } | null;
    bestGir: { value: number; date: string; course: string } | null;
    lowestPutts: { value: number; date: string; course: string } | null;
  };
}

// ============================================================================
// TEAM COMPARISON TYPES
// ============================================================================

export interface TeamComparisonStats {
  playerId: string;
  playerName: string;
  roundCount: number;
  scoringAverage: number | null;
  bestRound: number | null;
  girPct: number | null;
  fairwayPct: number | null;
  puttsPerRound: number | null;
  scramblingPct: number | null;
}

export interface TeamComparisonResponse {
  playerStats: TeamComparisonStats;
  teamStats: TeamComparisonStats[];
  teamAverages: {
    scoringAverage: number | null;
    girPct: number | null;
    fairwayPct: number | null;
    puttsPerRound: number | null;
    scramblingPct: number | null;
  };
  playerRankings: {
    scoringRank: number | null;
    girRank: number | null;
    fairwayRank: number | null;
    puttsRank: number | null;
  };
}

// ============================================================================
// COURSE BREAKDOWN TYPES
// ============================================================================

export interface CourseStats {
  courseName: string;
  roundCount: number;
  scoringAverage: number | null;
  bestRound: number | null;
  girPct: number | null;
  fairwayPct: number | null;
  puttsPerRound: number | null;
  lastPlayed: string;
}

export interface CourseBreakdownResponse {
  courses: CourseStats[];
  bestCourse: string | null;
  worstCourse: string | null;
}

// ============================================================================
// HOLE ANALYSIS TYPES
// ============================================================================

export interface HoleAnalysis {
  holeNumber: number;
  par: number;
  averageScore: number;
  averageToPar: number;
  timesPlayed: number;
  birdieOrBetter: number;
  pars: number;
  bogeys: number;
  doublePlus: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface WorstHoleResponse {
  holes: HoleAnalysis[];
  worstHoles: HoleAnalysis[];
  bestHoles: HoleAnalysis[];
  par3Average: number | null;
  par4Average: number | null;
  par5Average: number | null;
  closingHolesAverage: number | null;
}

// ============================================================================
// SPRAY CHART TYPES
// ============================================================================

export type SprayChartMode = 'point-cloud' | 'summary';
export type SprayChartShotFamily = 'driving' | 'approach';
export type SprayChartSector =
  | 'center'
  | 'left'
  | 'right'
  | 'short'
  | 'long'
  | 'short_left'
  | 'short_right'
  | 'long_left'
  | 'long_right';
export type SprayChartOutcomeBucket = 'playable' | 'trouble' | 'penalty';

export interface SprayChartPoint {
  id: string;
  roundId: string;
  holeNumber: number;
  shotNumber: number;
  family: SprayChartShotFamily;
  sector: SprayChartSector;
  x: number;
  y: number;
  outcomeBucket: SprayChartOutcomeBucket;
  shotDistance: number | null;
  distanceBefore: number | null;
  distanceAfter: number | null;
  lieBefore: string | null;
  lieAfter: string | null;
  result: string | null;
  tooltip: string;
}

export interface SprayChartSummaryBand {
  sector: SprayChartSector;
  label: string;
  count: number;
  percentage: number;
  avgForwardDistance: number | null;
  avgRemainingDistance: number | null;
}

export interface SprayChartShotGroup {
  family: SprayChartShotFamily;
  totalShots: number;
  plottedShots: number;
  averageForwardDistance: number | null;
  averageRemainingDistance: number | null;
  playableCount: number;
  troubleCount: number;
  penaltyCount: number;
  dominantSector: SprayChartSector | null;
  points: SprayChartPoint[];
  summaryBands: SprayChartSummaryBand[];
}

export interface SprayChartResponse {
  driving: SprayChartShotGroup;
  approach: SprayChartShotGroup;
  scope: {
    roundId: string | 'overall';
    roundsIncluded: number;
    filterApplied: boolean;
  };
}
