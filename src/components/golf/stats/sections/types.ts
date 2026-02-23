// Shared types used by section components

export interface PersonalBest {
  value: number;
  date: string;
  course: string;
}

export interface PeriodStats {
  roundCount: number;
  scoringAvg: number | null;
  girPct: number | null;
  fairwayPct: number | null;
  puttsPerRound: number | null;
}

export interface TrendAnalysisResponse {
  rounds: Array<{
    id: string;
    date: string;
    score: number;
    toPar: number;
    courseName: string;
    roundType: string | null;
    girPct: number | null;
    fairwayPct: number | null;
    putts: number | null;
    scrambling: number | null;
  }>;
  trends: {
    score: Array<{ date: string; value: number; roundId: string; courseName: string }>;
    gir: Array<{ date: string; value: number; roundId: string; courseName: string }>;
    fairway: Array<{ date: string; value: number; roundId: string; courseName: string }>;
    putts: Array<{ date: string; value: number; roundId: string; courseName: string }>;
  };
  rollingAverages: {
    score5: (number | null)[];
    score10: (number | null)[];
    score20: (number | null)[];
  };
  periodComparison: {
    last30Days: PeriodStats;
    previous30Days: PeriodStats;
  };
  personalBests: {
    bestScore: PersonalBest | null;
    bestToPar: PersonalBest | null;
    bestGir: PersonalBest | null;
    lowestPutts: PersonalBest | null;
  };
}

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

export interface PlayerProfile {
  avatarUrl?: string | null;
  gradYear?: number | null;
  handicap?: number | null;
  roundsPlayed?: number;
  scoringAverage?: number | null;
  bestRound?: number | null;
}
