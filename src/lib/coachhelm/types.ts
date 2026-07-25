// ============================================================================
// COACH PHILOSOPHY TYPES
// ============================================================================

export interface CoachPhilosophy {
    id: string;
    coachId: string;

    // Priorities (1-5, 1 = most important)
    priorityBallStriking: number;
    priorityShortGame: number;
    priorityPutting: number;
    priorityCourseManagement: number;
    priorityMentalGame: number;

    // Sensitivity
    alertSensitivity: 'aggressive' | 'balanced' | 'conservative';

    // Thresholds
    declineThreshold: number;
    pressureGapThreshold: number;
    bubbleZoneRange: number;

    // Weights (sum to 100)
    weightHistorical: number;
    weightRecentForm: number;
    weightTournament: number;
    weightQualifying: number;
    weightSubjective: number;

    // Alert toggles
    alertScoringDecline: boolean;
    alertStatRegression: boolean;
    alertTournamentPressure: boolean;
    alertPlateau: boolean;
    alertBubblePlayer: boolean;
    alertSurgePlayer: boolean;
    alertStreaks: boolean;
    alertRecurringWeakness: boolean;
    alertClosingHoles: boolean;
    alertPar3Issues: boolean;

    // Display
    showStrokesGained: boolean;
    showAdvancedStats: boolean;
    insightVerbosity: 'brief' | 'detailed';

    // Signal controls (migration 20260725090000).
    // Each replaces a constant the engine used to hard-code, and each DEFAULTS
    // to that constant — so a coach who never touches them sees no change.
    /** Confidence floor an insight must clear to surface (0.10–0.90). */
    minInsightConfidence: number;
    /** Rounds a player needs logged before CoachHelm speaks about them (1–15). */
    minRoundsForSignal: number;
    /** How alerts reach the coach. */
    alertDigest: 'immediate' | 'daily' | 'weekly';

    // Window / sample-size controls (migration 20260725140000). Same contract:
    // each replaces an engine constant and defaults to it.
    /** Plays a hole needs before it can be ranked toughest/easiest (2-10). */
    minHolePlaysForRanking: number;
    /** Rolling window (days) for v2 pattern mining (30-365). */
    patternLookbackDays: number;
    /** Stats-page benchmark comparison window in days (14 | 30 | 60 | 90). */
    statsBenchmarkWindowDays: number;

    createdAt: string;
    updatedAt: string;
}

// For the priority ranker UI
export interface PriorityMetric {
    key: 'priorityBallStriking' | 'priorityShortGame' | 'priorityPutting' | 'priorityCourseManagement' | 'priorityMentalGame';
    label: string;
    description: string;
    icon: string;
}

export const PRIORITY_METRICS: PriorityMetric[] = [
    {
        key: 'priorityBallStriking',
        label: 'Ball Striking',
        description: 'Fairways, GIR, approach proximity',
        icon: '🎯',
    },
    {
        key: 'priorityShortGame',
        label: 'Short Game',
        description: 'Scrambling, sand saves, up-and-down',
        icon: '⛳',
    },
    {
        key: 'priorityPutting',
        label: 'Putting',
        description: 'Putts per round, make %, 3-putt avoidance',
        icon: '🏌️',
    },
    {
        key: 'priorityCourseManagement',
        label: 'Course Management',
        description: 'Penalty avoidance, smart misses',
        icon: '🗺️',
    },
    {
        key: 'priorityMentalGame',
        label: 'Mental Game',
        description: 'Tournament performance, closing holes',
        icon: '🧠',
    },
];

// Alert type groupings for the UI
interface AlertGroup {
    title: string;
    alerts: {
        key: keyof CoachPhilosophy;
        label: string;
    }[];
}

export const ALERT_GROUPS: AlertGroup[] = [
    {
        title: 'Performance',
        alerts: [
            { key: 'alertScoringDecline', label: 'Scoring decline' },
            { key: 'alertStatRegression', label: 'Stat regression' },
            { key: 'alertTournamentPressure', label: 'Tournament pressure gap' },
            { key: 'alertPlateau', label: 'Performance plateau' },
        ],
    },
    {
        title: 'Roster & Qualifying',
        alerts: [
            { key: 'alertBubblePlayer', label: 'Bubble player movement' },
            { key: 'alertSurgePlayer', label: 'Surge player (rapid improvement)' },
            { key: 'alertStreaks', label: 'Hot/cold streaks' },
        ],
    },
    {
        title: 'Patterns',
        alerts: [
            { key: 'alertRecurringWeakness', label: 'Recurring weaknesses' },
            { key: 'alertClosingHoles', label: 'Closing hole problems' },
            { key: 'alertPar3Issues', label: 'Par 3 scoring issues' },
        ],
    },
];

// ============================================================================
// ROUND REVIEW TYPES
// ============================================================================

export interface RoundReview {
  id: string;
  roundId: string;
  playerId: string;

  // Scoring context
  roundScore: number;
  roundScoreToPar: number;
  scoringAvgBefore: number | null;
  scoringAvgAfter: number | null;

  // Position context
  qualifyingPositionBefore: number | null;
  qualifyingPositionAfter: number | null;
  gapToNextPosition: number | null;

  // Analysis
  goalImpacts: GoalImpact[];
  highlights: Highlight[];
  areasToReview: AreaToReview[];
  roundStats: RoundStats;
  playerAverages: RoundStats;
  teamAverages: RoundStats | null;
  strokesGained: StrokesGainedBreakdown | null;
  patternsDetected: Pattern[];
  patternsRecurring: Pattern[];

  // Summary
  summary: string;
  primaryTakeaway: string;
  nextPracticePriority: string | null;
  linkedFocusAreaId: string | null;

  // Sharing
  sharedWithCoach: boolean;
  sharedAt: string | null;
  coachViewedAt: string | null;
  coachNotes: string | null;

  createdAt: string;
}

export interface GoalImpact {
  goalId: string;
  goalType: string;
  goalLabel: string;
  valueBefore: number;
  valueAfter: number;
  change: number;
  direction: 'positive' | 'negative' | 'neutral';
  message: string;
}

export interface Highlight {
  id: string;
  holeNumber: number;
  type: HighlightType;
  title: string;
  description: string;
  shots?: ShotDetail[];
  impact: string; // e.g., "+2 vs expected"
  emoji: string;
}

export type HighlightType =
  | 'eagle'
  | 'birdie'
  | 'birdie_streak'
  | 'long_putt_made'
  | 'great_approach'
  | 'sand_save'
  | 'up_and_down'
  | 'par_save'
  | 'bounce_back'
  | 'strong_finish';

export interface AreaToReview {
  id: string;
  holeNumber: number;
  type: AreaType;
  title: string;
  description: string;
  shots?: ShotDetail[];
  pattern: string | null;
  rootCause: string;
  linkedFocusArea: string | null;
  severity: 'high' | 'medium' | 'low';
}

export type AreaType =
  | 'three_putt'
  | 'double_bogey_plus'
  | 'penalty'
  | 'missed_short_putt'
  | 'poor_approach'
  | 'missed_fairway_trouble'
  | 'poor_course_management'
  | 'failed_up_and_down';

export interface ShotDetail {
  shotNumber: number;
  club: string;
  result: string;
  distance?: number;
}

export interface Pattern {
  id: string;
  type: PatternType;
  title: string;
  description: string;
  frequency: number; // percentage of rounds
  impactStrokes: number;
  evidence: string[];
  isNew: boolean;
}

export type PatternType =
  | 'miss_direction'      // Always missing one way
  | 'distance_gap'        // Struggles at specific yardage
  | 'lie_weakness'        // Bad from rough/sand
  | 'hole_type'           // Par 3s, par 5s, etc.
  | 'pressure'            // Back nine, closing holes
  | 'momentum'            // After bogey, after birdie
  | 'putting_distance'    // Specific putt lengths
  | 'three_putt_trigger'; // What causes 3-putts

export interface StrokesGainedBreakdown {
  total: number;
  tee: number;
  approach: number;
  aroundGreen: number;
  putting: number;
}

export interface RoundStats {
  // Scoring
  totalScore: number;
  scoreToPar: number;
  frontNine: number;
  backNine: number;

  // Birdies/Bogeys
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doublePlus: number;

  // Driving
  fairwaysHit: number;
  fairwaysPossible: number;
  fairwayPct: number;

  // Approach
  greensHit: number;
  greensPossible: number;
  girPct: number;

  // Putting
  totalPutts: number;
  puttsPerHole: number;
  puttsPerGir: number;
  onePutts: number;
  threePutts: number;

  // Short game
  upAndDowns: number;
  upAndDownAttempts: number;
  scramblePct: number;
  sandSaves: number;
  sandAttempts: number;
  sandPct: number;
}

// Highlight config for UI
export const HIGHLIGHT_CONFIG: Record<HighlightType, { emoji: string; color: string }> = {
  eagle: { emoji: '🦅', color: 'text-purple-600' },
  birdie: { emoji: '🐦', color: 'text-green-600' },
  birdie_streak: { emoji: '🔥', color: 'text-orange-500' },
  long_putt_made: { emoji: '🎯', color: 'text-blue-600' },
  great_approach: { emoji: '💫', color: 'text-yellow-500' },
  sand_save: { emoji: '🏖️', color: 'text-amber-600' },
  up_and_down: { emoji: '⬆️', color: 'text-green-500' },
  par_save: { emoji: '💪', color: 'text-warm-600' },
  bounce_back: { emoji: '🔄', color: 'text-blue-500' },
  strong_finish: { emoji: '🏁', color: 'text-green-600' },
};

// Area config for UI
export const AREA_CONFIG: Record<AreaType, { emoji: string; color: string }> = {
  three_putt: { emoji: '😓', color: 'text-red-500' },
  double_bogey_plus: { emoji: '💥', color: 'text-red-600' },
  penalty: { emoji: '🚫', color: 'text-red-500' },
  missed_short_putt: { emoji: '😤', color: 'text-amber-600' },
  poor_approach: { emoji: '📉', color: 'text-amber-500' },
  missed_fairway_trouble: { emoji: '🌲', color: 'text-amber-600' },
  poor_course_management: { emoji: '🗺️', color: 'text-amber-500' },
  failed_up_and_down: { emoji: '⬇️', color: 'text-amber-500' },
};
