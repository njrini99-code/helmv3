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

// ============================================================================
// FOCUS AREA CONFIGURATION
// ============================================================================

export type FocusAreaIconName =
  | 'crosshair'
  | 'flag'
  | 'circle-dot'
  | 'map'
  | 'brain'
  | 'trophy'
  | 'target'
  | 'wind'
  | 'dumbbell'
  | 'clipboard-list';

export interface FocusAreaConfig {
  category: FocusAreaCategory;
  label: string;
  description: string;
  // Icon name key — UI resolves to its own SVG icon component. Replaces the
  // previous emoji-string approach so Focus Area cards use the project's
  // line-icon system instead of system emoji glyphs.
  icon: FocusAreaIconName;
  relatedStats: string[];
}

const FOCUS_AREA_CONFIGS: Record<FocusAreaCategory, FocusAreaConfig> = {
  ball_striking: {
    category: 'ball_striking',
    label: 'Ball Striking',
    description: 'Driving accuracy, iron play, greens in regulation',
    icon: 'crosshair',
    relatedStats: ['fairways_hit_pct', 'gir_pct', 'approach_proximity'],
  },
  short_game: {
    category: 'short_game',
    label: 'Short Game',
    description: 'Chipping, pitching, scrambling, sand saves',
    icon: 'flag',
    relatedStats: ['scrambling_pct', 'sand_save_pct', 'up_and_down_pct'],
  },
  putting: {
    category: 'putting',
    label: 'Putting',
    description: 'Putts per round, make percentage, 3-putt avoidance',
    icon: 'circle-dot',
    relatedStats: ['putts_per_round', 'one_putt_pct', 'three_putt_pct'],
  },
  course_management: {
    category: 'course_management',
    label: 'Course Management',
    description: 'Decision making, penalty avoidance, smart play',
    icon: 'map',
    relatedStats: ['penalty_strokes', 'bogey_avoidance', 'par_save_pct'],
  },
  mental_game: {
    category: 'mental_game',
    label: 'Mental Game',
    description: 'Focus, pressure handling, consistency',
    icon: 'brain',
    relatedStats: ['tournament_avg', 'closing_holes_avg', 'bounce_back_pct'],
  },
  tournament_performance: {
    category: 'tournament_performance',
    label: 'Tournament Performance',
    description: 'Competitive play, handling pressure situations',
    icon: 'trophy',
    relatedStats: ['tournament_avg', 'best_finish', 'top_10_finishes'],
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================



const FOCUS_AREA_FALLBACK: FocusAreaConfig = {
  category: 'ball_striking',
  label: 'Focus Area',
  description: '',
  icon: 'target',
  relatedStats: [],
};

export function getFocusAreaConfig(category: FocusAreaCategory | string | null | undefined): FocusAreaConfig {
  // Server data stores `area_type`, not `category`; some legacy rows also use
  // values outside our hardcoded set. Fall back to a safe default icon/label
  // so a missing or unknown key never crashes the render.
  if (!category) return FOCUS_AREA_FALLBACK;
  const cfg = (FOCUS_AREA_CONFIGS as Record<string, FocusAreaConfig>)[category];
  return cfg ?? FOCUS_AREA_FALLBACK;
}




