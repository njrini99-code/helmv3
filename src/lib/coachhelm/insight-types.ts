// ============================================================================
// COACHHELM INSIGHT TYPES
// ============================================================================

export type InsightType =
  | 'scoring_decline'
  | 'stat_regression'
  | 'tournament_pressure'
  | 'plateau'
  | 'bubble_player'
  | 'surge_player'
  | 'streak'
  | 'recurring_weakness'
  | 'closing_holes'
  | 'par_3_issues'
  | 'team_trend'
  | 'roster_recommendation';

export type InsightPriority = 'low' | 'medium' | 'high' | 'urgent';

export type InsightStatus = 'active' | 'acknowledged' | 'resolved' | 'dismissed';

export type FocusAreaCategory =
  | 'ball_striking'
  | 'short_game'
  | 'putting'
  | 'course_management'
  | 'mental_game'
  | 'tournament_performance';

export type FocusAreaStatus = 'active' | 'in_progress' | 'improved' | 'archived';

export type TrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface CoachInsight {
  id: string;
  coach_id: string;
  team_id: string | null;
  insight_type: InsightType;
  priority: InsightPriority;
  player_id: string | null;
  round_id: string | null;
  title: string;
  description: string;
  recommendation: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  status: InsightStatus;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export interface PlayerFocusArea {
  id: string;
  player_id: string;
  coach_id: string;
  category: FocusAreaCategory;
  priority: number;
  title: string;
  description: string;
  specific_drills: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  current_performance: Record<string, any>;
  target_improvement: string | null;
  status: FocusAreaStatus;
  progress_notes: string | null;
  is_auto_generated: boolean;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface InsightGenerationLog {
  id: string;
  coach_id: string;
  generation_type: 'manual' | 'scheduled' | 'triggered';
  trigger_event: string | null;
  insights_created: number;
  focus_areas_updated: number;
  players_analyzed: number;
  execution_time_ms: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
  created_at: string;
}

interface PlayerPerformanceSnapshot {
  id: string;
  player_id: string;
  snapshot_date: string;
  rounds_in_period: number;
  scoring_average: number | null;
  best_round: number | null;
  worst_round: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: Record<string, any>;
  trend_direction: TrendDirection | null;
  trend_magnitude: number | null;
  created_at: string;
}

// ============================================================================
// DISPLAY TYPES (with joined data)
// ============================================================================

export interface InsightWithPlayer extends CoachInsight {
  player?: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  } | null;
}

interface FocusAreaWithPlayer extends PlayerFocusArea {
  player: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

// ============================================================================
// INSIGHT METADATA TYPES
// ============================================================================

interface ScoringDeclineMetadata {
  recent_avg: number;
  previous_avg: number;
  rounds_analyzed: number;
  decline_amount: number;
  confidence_score: number;
}

interface StatRegressionMetadata {
  stat_name: string;
  current_value: number;
  previous_value: number;
  decline_percentage: number;
  rounds_analyzed: number;
}

interface TournamentPressureMetadata {
  practice_avg: number;
  tournament_avg: number;
  gap: number;
  rounds_practice: number;
  rounds_tournament: number;
}

interface BubblePlayerMetadata {
  current_rank: number;
  cutoff_rank: number;
  distance_from_cutoff: number; // in strokes
  recent_trend: 'up' | 'down' | 'stable';
  avg_score: number;
}

interface SurgePlayerMetadata {
  improvement_rate: number; // strokes per round
  rounds_analyzed: number;
  starting_avg: number;
  current_avg: number;
}

interface StreakMetadata {
  streak_type: 'hot' | 'cold';
  streak_length: number;
  avg_during_streak: number;
  avg_before_streak: number;
}

// ============================================================================
// INSIGHT CONFIGURATION
// ============================================================================

interface InsightTypeConfig {
  type: InsightType;
  label: string;
  description: string;
  icon: string;
  defaultPriority: InsightPriority;
  expiresInDays?: number; // Auto-dismiss after X days
}

export const INSIGHT_TYPE_CONFIGS: Record<InsightType, InsightTypeConfig> = {
  scoring_decline: {
    type: 'scoring_decline',
    label: 'Scoring Decline',
    description: 'Player showing consistent increase in scoring average',
    icon: '📉',
    defaultPriority: 'high',
    expiresInDays: 14,
  },
  stat_regression: {
    type: 'stat_regression',
    label: 'Stat Regression',
    description: 'Significant decline in a key statistical category',
    icon: '📊',
    defaultPriority: 'medium',
    expiresInDays: 14,
  },
  tournament_pressure: {
    type: 'tournament_pressure',
    label: 'Tournament Pressure',
    description: 'Large gap between practice and tournament performance',
    icon: '🎯',
    defaultPriority: 'high',
    expiresInDays: 21,
  },
  plateau: {
    type: 'plateau',
    label: 'Performance Plateau',
    description: 'Player has stopped improving over extended period',
    icon: '📏',
    defaultPriority: 'low',
    expiresInDays: 30,
  },
  bubble_player: {
    type: 'bubble_player',
    label: 'Bubble Player',
    description: 'Player near the cut line for roster/travel squad',
    icon: '⚠️',
    defaultPriority: 'urgent',
    expiresInDays: 7,
  },
  surge_player: {
    type: 'surge_player',
    label: 'Surge Player',
    description: 'Player showing rapid improvement',
    icon: '🚀',
    defaultPriority: 'medium',
    expiresInDays: 14,
  },
  streak: {
    type: 'streak',
    label: 'Hot/Cold Streak',
    description: 'Player on notable hot or cold streak',
    icon: '🔥',
    defaultPriority: 'medium',
    expiresInDays: 7,
  },
  recurring_weakness: {
    type: 'recurring_weakness',
    label: 'Recurring Weakness',
    description: 'Consistent pattern of weakness in specific area',
    icon: '🔍',
    defaultPriority: 'medium',
    expiresInDays: 30,
  },
  closing_holes: {
    type: 'closing_holes',
    label: 'Closing Hole Issues',
    description: 'Struggles on final holes of rounds',
    icon: '🏁',
    defaultPriority: 'medium',
    expiresInDays: 21,
  },
  par_3_issues: {
    type: 'par_3_issues',
    label: 'Par 3 Scoring Issues',
    description: 'Consistently struggling on par 3 holes',
    icon: '3️⃣',
    defaultPriority: 'low',
    expiresInDays: 21,
  },
  team_trend: {
    type: 'team_trend',
    label: 'Team Trend',
    description: 'Overall team performance trend',
    icon: '👥',
    defaultPriority: 'low',
    expiresInDays: 14,
  },
  roster_recommendation: {
    type: 'roster_recommendation',
    label: 'Roster Recommendation',
    description: 'Suggested roster or lineup changes',
    icon: '📋',
    defaultPriority: 'medium',
    expiresInDays: 7,
  },
};

// ============================================================================
// FOCUS AREA CONFIGURATION
// ============================================================================

export interface FocusAreaConfig {
  category: FocusAreaCategory;
  label: string;
  description: string;
  icon: string;
  relatedStats: string[];
}

const FOCUS_AREA_CONFIGS: Record<FocusAreaCategory, FocusAreaConfig> = {
  ball_striking: {
    category: 'ball_striking',
    label: 'Ball Striking',
    description: 'Driving accuracy, iron play, greens in regulation',
    icon: '🎯',
    relatedStats: ['fairways_hit_pct', 'gir_pct', 'approach_proximity'],
  },
  short_game: {
    category: 'short_game',
    label: 'Short Game',
    description: 'Chipping, pitching, scrambling, sand saves',
    icon: '⛳',
    relatedStats: ['scrambling_pct', 'sand_save_pct', 'up_and_down_pct'],
  },
  putting: {
    category: 'putting',
    label: 'Putting',
    description: 'Putts per round, make percentage, 3-putt avoidance',
    icon: '🏌️',
    relatedStats: ['putts_per_round', 'one_putt_pct', 'three_putt_pct'],
  },
  course_management: {
    category: 'course_management',
    label: 'Course Management',
    description: 'Decision making, penalty avoidance, smart play',
    icon: '🗺️',
    relatedStats: ['penalty_strokes', 'bogey_avoidance', 'par_save_pct'],
  },
  mental_game: {
    category: 'mental_game',
    label: 'Mental Game',
    description: 'Focus, pressure handling, consistency',
    icon: '🧠',
    relatedStats: ['tournament_avg', 'closing_holes_avg', 'bounce_back_pct'],
  },
  tournament_performance: {
    category: 'tournament_performance',
    label: 'Tournament Performance',
    description: 'Competitive play, handling pressure situations',
    icon: '🏆',
    relatedStats: ['tournament_avg', 'best_finish', 'top_10_finishes'],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getInsightConfig(type: InsightType): InsightTypeConfig {
  return INSIGHT_TYPE_CONFIGS[type];
}

export function getFocusAreaConfig(category: FocusAreaCategory): FocusAreaConfig {
  return FOCUS_AREA_CONFIGS[category];
}

export function getPriorityColor(priority: InsightPriority): string {
  switch (priority) {
    case 'urgent':
      return 'red';
    case 'high':
      return 'orange';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'blue';
  }
}

function getPriorityLabel(priority: InsightPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatInsightAge(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return created.toLocaleDateString();
  }
}
