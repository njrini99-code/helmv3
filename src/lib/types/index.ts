// Type exports and helpers for Helm Sports Labs
import { Database } from './database';

// Re-export the generated Json scalar so consumers can import it from '@/lib/types'
export type { Json } from './database';

// Helm Lifting Lab — identity/access + data types (hand-written; pending db:types regen)
// Wave 1: supabase/migrations/20260625000000_* through 20260625000030_*
export * from './helm-lifting';
export * from './helm-lifting-data';

// Baseball extended types (timeline, coach notes, staff invitations) — consumed via '@/lib/types'
export * from './baseball-extended';

// ============================================
// DATABASE TABLE TYPES
// ============================================

export type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];

// Row types (what you get when querying)
export type User = Tables['users']['Row'];
export type Coach = Tables['baseball_coaches']['Row'];
// NOTE: After migration 031, Coach has new field: organization_id (replaces college_id)
export type Player = Tables['baseball_players']['Row'];
// College is an alias for Organization (for backward compatibility)
export type College = Tables['organizations']['Row'];
// NOTE: Player is from baseball_players table (not 'players' which doesn't exist)
export type Organization = Tables['organizations']['Row'];
export type Team = Tables['baseball_teams']['Row'];

// Recruiting
export type Watchlist = Tables['baseball_watchlists']['Row'];
export type Video = Tables['baseball_videos']['Row'];

// Messaging (using generated types from database)
export type Message = Tables['baseball_messages']['Row'];
export type Conversation = Tables['baseball_conversations']['Row'];
// Golf Messaging types
export type GolfMessageRow = Tables['golf_messages']['Row'];

// ============================================
// ENUM TYPES
// ============================================

export type CoachType = Enums['baseball_coach_type'];
export type PlayerType = Enums['baseball_player_type'];
export type PipelineStage = Enums['baseball_pipeline_stage'];
// ============================================
// COMPOSITE/JOINED TYPES
// ============================================

// Coach with organization join (used in auth store)
export type CoachWithOrganization = Coach & {
  organization?: { id: string; name: string } | null;
};

// Watchlist item with player data
export type WatchlistWithPlayer = Watchlist & {
  player?: Player;
};

// ============================================
// CONSTANTS
// ============================================

export const POSITIONS = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'OF',
  'LHP',
  'RHP',
  'UTL',
] as const;

export const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

export const GRAD_YEARS = [
  2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032,
] as const;

// ============================================
// BASEBALL TEAM MANAGEMENT TYPES
// ============================================

export type BaseballStatType = 'practice' | 'game' | 'other';
export type BaseballStatSource = 'manual' | 'csv_upload' | 'api';
export type BaseballUploadStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'needs_review';
export type BaseballTrend = 'improving' | 'declining' | 'stable';
export type BaseballDevelopmentStage = 'emerging' | 'developing' | 'established' | 'elite';
export type BaseballInsightType =
  | 'performance_decline'
  | 'performance_surge'
  | 'pressure_gap'
  | 'streak_hot'
  | 'streak_cold'
  | 'plateau'
  | 'breakout_candidate'
  | 'position_opportunity'
  | 'development_milestone'
  // Milestone-kind-specific types so a player crossing both a hit and an HR
  // milestone in one run persists both (reconcile keys by playerId::insight_type).
  | 'milestone_hits'
  | 'milestone_hr'
  | 'comparison_alert'
  // Additional types for AI insights engine
  | 'decline'
  | 'trend'
  | 'alert'
  | 'opportunity'
  | 'milestone';
export type BaseballInsightPriority = 'critical' | 'urgent' | 'high' | 'medium' | 'low';
export type BaseballInsightStatus = 'active' | 'acknowledged' | 'dismissed' | 'resolved' | 'addressed';
export type BaseballInsightCategory = 'performance' | 'recruiting' | 'team_health';
export type BaseballInsightFeedback = 'helpful' | 'not_helpful' | null;
export type BaseballAlertSensitivity = 'aggressive' | 'balanced' | 'conservative';

export interface BaseballPlayerStats {
  id: string;
  player_id: string;
  team_id: string;
  coach_id: string;

  // Classification
  stat_type: BaseballStatType;
  session_date: string;
  session_name: string | null;

  // Hitting
  at_bats: number;
  hits: number;
  doubles: number;
  triples: number;
  home_runs: number;
  rbis: number;
  walks: number;
  strikeouts: number;
  stolen_bases: number;
  caught_stealing: number;
  hit_by_pitch: number;
  sacrifice_bunts: number;
  sacrifice_flies: number;

  // Pitching
  innings_pitched: number;
  earned_runs: number;
  runs_allowed: number;
  hits_allowed: number;
  walks_allowed: number;
  strikeouts_thrown: number;
  pitches_thrown: number;
  strikes_thrown: number;

  // Fielding
  putouts: number;
  assists: number;
  errors: number;

  // Metrics
  exit_velocity: number | null;
  launch_angle: number | null;
  pitch_velocity: number | null;
  spin_rate: number | null;

  // Metadata
  source: BaseballStatSource;
  upload_batch_id: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

export interface BaseballStatUpload {
  id: string;
  team_id: string;
  coach_id: string;

  filename: string;
  stat_type: BaseballStatType;
  session_date: string;
  session_name: string | null;

  total_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  unmatched_data: UnmatchedPlayerData[];

  status: BaseballUploadStatus;
  error_message: string | null;

  created_at: string;
  completed_at: string | null;
}

export interface UnmatchedPlayerData {
  csvName: string;
  rowIndex: number;
  suggestedMatches: {
    playerId: string;
    playerName: string;
    confidence: number;
  }[];
  rowData: Record<string, string | number>;
}

export interface BaseballPlayerAggregates {
  player_id: string;
  team_id: string;

  total_sessions: number;
  practice_sessions: number;
  game_sessions: number;

  career_avg: number | null;
  career_obp: number | null;
  career_slg: number | null;
  career_ops: number | null;

  practice_avg: number | null;
  game_avg: number | null;
  pressure_gap: number | null;

  recent_trend: BaseballTrend | null;
  trend_magnitude: number | null;
  trend_velocity: number | null;

  last_5_avg: number | null;
  last_10_avg: number | null;
  season_avg: number | null;

  avg_exit_velocity: number | null;
  max_exit_velocity: number | null;
  avg_pitch_velocity: number | null;
  max_pitch_velocity: number | null;

  development_stage: BaseballDevelopmentStage | null;

  // Optional extended fields
  total_at_bats?: number | null;
  total_hits?: number | null;
  /** Array of {date: string; avg: number} for charting team/player trend over time */
  trend_data?: Array<{ date: string; avg: number }> | null;

  last_calculated_at: string;
  updated_at: string;
}

export interface BaseballCoachInsight {
  id: string;
  coach_id: string;
  team_id: string;
  player_id: string | null;

  insight_type: BaseballInsightType;
  priority: BaseballInsightPriority;

  title: string;
  description: string;
  recommendation?: string;
  recommended_action?: string; // Alias for recommendation

  metadata?: BaseballInsightMetadata;
  data?: Record<string, unknown>; // Flexible data storage

  status: BaseballInsightStatus;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  expires_at?: string | null;

  created_at: string;
}

export interface BaseballInsightMetadata {
  metric?: string;
  previousValue?: number;
  currentValue?: number;
  changePercent?: number;
  sessionsAnalyzed?: number;
  comparisonPlayerId?: string;
  comparisonPlayerName?: string;
  // Category and feedback for AI insights
  category?: BaseballInsightCategory;
  feedback?: BaseballInsightFeedback;
  feedbackAt?: string;
  [key: string]: unknown;
}

export interface BaseballCoachPhilosophy {
  id: string;
  coach_id: string;

  priority_hitting: number;
  priority_pitching?: number;
  priority_fielding?: number;
  priority_speed: number;
  priority_mental_game?: number;
  // Additional priorities
  priority_power?: number;
  priority_plate_discipline?: number;
  priority_defense?: number;

  alert_sensitivity: BaseballAlertSensitivity;
  decline_threshold: number;
  pressure_gap_threshold: number;
  bubble_zone_range?: number; // Range for bubble zone detection

  alert_performance_decline?: boolean;
  alert_pressure_gap?: boolean;
  alert_streaks?: boolean;
  alert_breakout_candidates?: boolean;
  alert_plateau?: boolean;
  alert_position_opportunities?: boolean;

  created_at: string;
  updated_at: string;
}

// Player with aggregates for command center
export interface BaseballRosterPlayer extends Player {
  aggregates?: BaseballPlayerAggregates;
  recentStats?: BaseballPlayerStats[];
  insights?: BaseballCoachInsight[];
  // Team membership fields (populated when fetched via baseball_team_members join)
  jersey_number?: number | null;
  team_position?: string | null;
  team_status?: string | null;
  joined_at?: string | null;
}

// ============================================
// COACH RECRUITING PHILOSOPHY TYPES
// ============================================

/**
 * Metric weight configuration for recruiting philosophy.
 * Each weight is 0-100, and they should roughly sum to 100 for normalization.
 */
export interface RecruitingMetricWeights {
  exit_velocity: number;
  pitch_velocity: number;
  sixty_time: number;
  gpa: number;
  height: number;
  weight: number;
  arm_strength: number;
}

/**
 * Minimum standards that filter/penalize players below thresholds.
 */
export interface RecruitingMinimumStandards {
  min_gpa: number | null;
  min_exit_velocity: number | null;
  min_pitch_velocity: number | null;
  max_sixty_time: number | null;
}

/**
 * Coach's recruiting philosophy - their preferences for player matching.
 * Players are ranked by how well they match these preferences.
 */
export interface CoachRecruitingPhilosophy {
  id: string;
  coach_id: string;

  // Metric weights (0-100)
  weight_exit_velocity: number;
  weight_pitch_velocity: number;
  weight_sixty_time: number;
  weight_gpa: number;
  weight_height: number;
  weight_weight: number;
  weight_arm_strength: number;

  // Position priorities (ordered array, first = most desired)
  position_priorities: string[];

  // Minimum standards
  min_gpa: number | null;
  min_exit_velocity: number | null;
  min_pitch_velocity: number | null;
  max_sixty_time: number | null;

  // Geographic preferences
  preferred_states: string[];
  max_distance_miles: number | null;

  // Grad year focus
  target_grad_years: number[];

  // Settings
  is_active: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * Insert type for coach recruiting philosophy.
 */
export interface CoachRecruitingPhilosophyInsert {
  coach_id: string;
  weight_exit_velocity?: number;
  weight_pitch_velocity?: number;
  weight_sixty_time?: number;
  weight_gpa?: number;
  weight_height?: number;
  weight_weight?: number;
  weight_arm_strength?: number;
  position_priorities?: string[];
  min_gpa?: number | null;
  min_exit_velocity?: number | null;
  min_pitch_velocity?: number | null;
  max_sixty_time?: number | null;
  preferred_states?: string[];
  max_distance_miles?: number | null;
  target_grad_years?: number[];
  is_active?: boolean;
}

/**
 * Update type for coach recruiting philosophy.
 */
export interface CoachRecruitingPhilosophyUpdate {
  weight_exit_velocity?: number;
  weight_pitch_velocity?: number;
  weight_sixty_time?: number;
  weight_gpa?: number;
  weight_height?: number;
  weight_weight?: number;
  weight_arm_strength?: number;
  position_priorities?: string[];
  min_gpa?: number | null;
  min_exit_velocity?: number | null;
  min_pitch_velocity?: number | null;
  max_sixty_time?: number | null;
  preferred_states?: string[];
  max_distance_miles?: number | null;
  target_grad_years?: number[];
  is_active?: boolean;
}

/**
 * Cached percentile rankings for a player within their grad year cohort.
 * Values are 0-100, where 100 = top of class.
 */
export interface PlayerPercentiles {
  id: string;
  player_id: string;
  grad_year: number;

  // Percentile rankings (0-100, null if no data)
  percentile_exit_velocity: number | null;
  percentile_pitch_velocity: number | null;
  percentile_sixty_time: number | null;
  percentile_gpa: number | null;
  percentile_height: number | null;
  percentile_weight: number | null;
  percentile_arm_strength: number | null;

  // Composite scores
  composite_athletic: number | null;
  composite_academic: number | null;

  // Cache management
  is_stale: boolean;
  calculated_at: string;

  created_at: string;
  updated_at: string;
}

/**
 * Match score result from the scoring algorithm.
 */
export interface PlayerMatchScore {
  player_id: string;
  match_score: number; // 0-100
  breakdown: MatchScoreBreakdown;
  meets_standards: boolean;
  position_bonus: number;
  geographic_bonus: number;
}

/**
 * Detailed breakdown of how the match score was calculated.
 */
export interface MatchScoreBreakdown {
  exit_velocity?: MetricScoreDetail;
  pitch_velocity?: MetricScoreDetail;
  sixty_time?: MetricScoreDetail;
  gpa?: MetricScoreDetail;
  height?: MetricScoreDetail;
  weight?: MetricScoreDetail;
  arm_strength?: MetricScoreDetail;
}

/**
 * Details for a single metric's contribution to the score.
 */
export interface MetricScoreDetail {
  percentile: number;
  weight: number;
  contribution: number; // percentile * weight / total_weight
}

/**
 * Default weights for recruiting philosophy.
 */
export const DEFAULT_RECRUITING_WEIGHTS: RecruitingMetricWeights = {
  exit_velocity: 20,
  pitch_velocity: 20,
  sixty_time: 15,
  gpa: 15,
  height: 10,
  weight: 10,
  arm_strength: 10,
};

/**
 * Metric labels for UI display.
 */
export const RECRUITING_METRIC_LABELS: Record<keyof RecruitingMetricWeights, string> = {
  exit_velocity: 'Exit Velocity',
  pitch_velocity: 'Pitch Velocity',
  sixty_time: '60-Yard Dash',
  gpa: 'Academic (GPA)',
  height: 'Height',
  weight: 'Weight',
  arm_strength: 'Arm Strength',
};

/**
 * Metric descriptions for tooltips.
 */
export const RECRUITING_METRIC_DESCRIPTIONS: Record<keyof RecruitingMetricWeights, string> = {
  exit_velocity: 'How much you value bat speed and power potential',
  pitch_velocity: 'How much you value arm velocity for pitchers',
  sixty_time: 'How much you value speed and athleticism',
  gpa: 'How much you value academic performance',
  height: 'How much you value physical height',
  weight: 'How much you value physical build/weight',
  arm_strength: 'How much you value throwing arm strength',
};



// =====================================================================
// BASEBALL BOX SCORE TYPES
// =====================================================================

export type BaseballGameType = 'game' | 'scrimmage';
export type BaseballGameStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed';
export type BaseballPitchingResult = 'W' | 'L' | 'S' | 'H' | 'BS' | 'ND';
export type BaseballHomeAway = 'home' | 'away' | 'neutral';

export interface BaseballGame {
  id: string;
  team_id: string;
  event_id: string | null;
  game_date: string;
  game_type: BaseballGameType;
  opponent_name: string | null;
  location: string | null;
  home_away: BaseballHomeAway | null;
  our_score: number | null;
  opponent_score: number | null;
  innings_played: number;
  status: BaseballGameStatus;
  notes: string | null;
  weather: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  batting?: BaseballBoxScoreBatting[];
  pitching?: BaseballBoxScorePitching[];
  // Derived counts (from query)
  batting_count?: number;
  pitching_count?: number;
}

export interface BaseballBoxScoreBatting {
  id: string;
  game_id: string;
  player_id: string;
  team_id: string;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  cs: number;
  hbp: number;
  sac: number;
  sf: number;
  lob: number;
  batting_order: number | null;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  created_at: string;
  // Joined
  player?: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
  };
}

export interface BaseballBoxScorePitching {
  id: string;
  game_id: string;
  player_id: string;
  team_id: string;
  ip: number;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
  hr: number;
  pitch_count: number | null;
  strikes: number | null;
  result: BaseballPitchingResult | null;
  era: number | null;
  whip: number | null;
  k9: number | null;
  bb9: number | null;
  created_at: string;
  // Joined
  player?: {
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    primary_position: string | null;
  };
}

export interface BaseballPlayerSeasonStats {
  id: string;
  player_id: string;
  team_id: string;
  season_year: number;
  // Batting totals
  g: number;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  cs: number;
  hbp: number;
  sac: number;
  sf: number;
  // Batting rates
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
  // Pitching totals
  g_p: number;
  gs: number;
  w: number;
  l: number;
  sv: number;
  ip: number;
  h_allowed: number;
  r_allowed: number;
  er: number;
  bb_allowed: number;
  k_thrown: number;
  hr_allowed: number;
  // Pitching rates
  era: number | null;
  whip: number | null;
  k9: number | null;
  bb9: number | null;
  last_updated: string;
  // Joined
  player?: {
    first_name: string | null;
    last_name: string | null;
    primary_position: string | null;
    jersey_number?: string | null;
  };
}

export interface BoxScoreBattingInput {
  player_id: string;
  player_name?: string; // For display
  batting_order?: number;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  k: number;
  sb: number;
  cs: number;
  hbp: number;
  sac: number;
  sf: number;
  lob: number;
}

export interface BoxScorePitchingInput {
  player_id: string;
  player_name?: string; // For display
  ip: number;
  h: number;
  r: number;
  er: number;
  bb: number;
  k: number;
  hr: number;
  pitch_count?: number;
  strikes?: number;
  result?: BaseballPitchingResult;
}

export interface CreateGameInput {
  game_date: string;
  game_type: BaseballGameType;
  opponent_name?: string;
  location?: string;
  home_away?: BaseballHomeAway;
  innings_played?: number;
  notes?: string;
  weather?: string;
  event_id?: string; // Link to existing calendar event
  // If provided, also creates a calendar event
  create_calendar_event?: boolean;
  event_time?: string;
}
