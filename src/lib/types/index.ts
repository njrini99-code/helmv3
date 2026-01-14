// Type exports and helpers for Helm Sports Labs
import { Database } from './database';

// ============================================
// DATABASE TABLE TYPES
// ============================================

export type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];

// Row types (what you get when querying)
export type User = Tables['users']['Row'];
export type Coach = Tables['coaches']['Row'];
// NOTE: After migration 031, Coach has new field: organization_id (replaces college_id)
export type Player = Tables['players']['Row'];
// NOTE: After migration 031, Player has new fields: high_school_org_id, committed_to_org_id (replaces high_school_id, committed_to)
export type Organization = Tables['organizations']['Row'];
export type Team = Tables['teams']['Row'];
export type TeamMember = Tables['team_members']['Row'];
export type TeamInvitation = Tables['team_invitations']['Row'];
export type TeamCoachStaff = Tables['team_coach_staff']['Row'];

// Player related
export type PlayerSettings = Tables['player_settings']['Row'];
export type PlayerMetric = Tables['player_metrics']['Row'];
export type PlayerAchievement = Tables['player_achievements']['Row'];
export type RecruitingInterest = Tables['recruiting_interests']['Row'];
export type PlayerEngagementEvent = Tables['player_engagement_events']['Row'];

// Coach related
export type CoachNote = Tables['coach_notes']['Row'];
export type CoachCalendarEvent = Tables['coach_calendar_events']['Row'];
export type DevelopmentalPlan = Tables['developmental_plans']['Row'];

// Events & Camps
export type Event = Tables['events']['Row'];
export type Camp = Tables['camps']['Row'];
export type CampRegistration = Tables['camp_registrations']['Row'];

// Legacy tables
export type College = Tables['colleges']['Row'];
export type HighSchool = Tables['high_schools']['Row'];

// Recruiting
export type Watchlist = Tables['watchlists']['Row'];
export type Video = Tables['videos']['Row'];

// Player Comparisons (manually added until types are regenerated)
export interface ComparisonData {
  players: PlayerComparisonItem[];
  metrics: ComparisonMetric[];
  createdAt: string;
  updatedAt: string;
}

export interface PlayerComparisonItem {
  playerId: string;
  name: string;
  position: string;
  gradYear: number;
  stats: Record<string, number | string>;
  notes?: string;
}

export interface ComparisonMetric {
  key: string;
  label: string;
  values: Record<string, number | string>; // playerId -> value
  unit?: string;
}

export interface PlayerComparison {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  player_ids: string[];
  comparison_data: ComparisonData;
  created_at: string;
  updated_at: string;
}

export interface PlayerComparisonInsert {
  coach_id: string;
  name: string;
  description?: string | null;
  player_ids: string[];
  comparison_data?: ComparisonData;
}

// Messaging (using generated types from database)
export type Message = Tables['messages']['Row'];
export type Conversation = Tables['conversations']['Row'];
export type ConversationParticipant = Tables['conversation_participants']['Row'];
export type Notification = Tables['notifications']['Row'];

// Insert types (what you send when creating)
export type UserInsert = Tables['users']['Insert'];
export type CoachInsert = Tables['coaches']['Insert'];
export type PlayerInsert = Tables['players']['Insert'];
export type OrganizationInsert = Tables['organizations']['Insert'];
export type TeamInsert = Tables['teams']['Insert'];
export type TeamMemberInsert = Tables['team_members']['Insert'];

// Update types (what you send when updating)
export type UserUpdate = Tables['users']['Update'];
export type CoachUpdate = Tables['coaches']['Update'];
export type PlayerUpdate = Tables['players']['Update'];
export type OrganizationUpdate = Tables['organizations']['Update'];
export type TeamUpdate = Tables['teams']['Update'];

// ============================================
// ENUM TYPES
// ============================================

export type UserRole = Enums['user_role'];
export type CoachType = Enums['coach_type'];
export type PlayerType = Enums['player_type'];
export type PipelineStage = Enums['pipeline_stage'];
export type TeamType = 'high_school' | 'showcase' | 'juco' | 'college';

// ============================================
// COMPOSITE/JOINED TYPES
// ============================================

// Full player profile with all related data
export type PlayerProfile = Player & {
  user?: User;
  settings?: PlayerSettings;
  metrics?: PlayerMetric[];
  achievements?: PlayerAchievement[];
  teams?: (TeamMember & { team: Team })[];
  high_school_org?: Organization;
  showcase_org?: Organization;
  college_org?: Organization;
};

// Full coach profile with all related data
export type CoachProfile = Coach & {
  user?: User;
  organization?: Organization;
  teams?: Team[];
};

// Team with members and coaches
export type TeamWithMembers = Team & {
  organization?: Organization;
  head_coach?: Coach;
  members?: (TeamMember & { player: Player })[];
  coaching_staff?: (TeamCoachStaff & { coach: Coach })[];
};

// Player for discover page (optimized for list view)
export type DiscoverPlayer = Pick<
  Player,
  | 'id'
  | 'first_name'
  | 'last_name'
  | 'avatar_url'
  | 'city'
  | 'state'
  | 'primary_position'
  | 'secondary_position'
  | 'grad_year'
  | 'bats'
  | 'throws'
  | 'gpa'
> & {
  full_name?: string;
  high_school_org?: Pick<Organization, 'id' | 'name' | 'location_city' | 'location_state'>;
  primary_video?: Pick<Video, 'id' | 'thumbnail_url' | 'url'>;
  metrics?: PlayerMetric[];
};

// Watchlist item with player data
export type WatchlistWithPlayer = Watchlist & {
  player?: Player;
};

// Camp with organization and registration count
export type CampWithDetails = Camp & {
  organization?: Organization;
  coach: Coach;
  registrations_count?: number;
};

// Event with team/org details
export type EventWithDetails = Event & {
  team?: Team;
  organization?: Organization;
  created_by_coach?: Coach;
};

// ============================================
// TYPE GUARDS
// ============================================

export function isPlayer(user: User): boolean {
  return user.role === 'player';
}

export function isCoach(user: User): boolean {
  return user.role === 'coach';
}

export function isCollegeCoach(coach: Coach): boolean {
  return coach.coach_type === 'college';
}

export function isHighSchoolCoach(coach: Coach): boolean {
  return coach.coach_type === 'high_school';
}

export function isJUCOCoach(coach: Coach): boolean {
  return coach.coach_type === 'juco';
}

export function isShowcaseCoach(coach: Coach): boolean {
  return coach.coach_type === 'showcase';
}

export function isHighSchoolPlayer(player: Player): boolean {
  return player.player_type === 'high_school';
}

export function isShowcasePlayer(player: Player): boolean {
  return player.player_type === 'showcase';
}

export function isJUCOPlayer(player: Player): boolean {
  return player.player_type === 'juco';
}

export function isCollegePlayer(player: Player): boolean {
  return player.player_type === 'college';
}

export function isRecruitingActivated(player: Player): boolean {
  return player.recruiting_activated === true;
}

export function canCoachRecruit(coach: Coach): boolean {
  return coach.coach_type === 'college' || coach.coach_type === 'juco';
}

export function canPlayerRecruit(player: Player): boolean {
  // College players cannot activate recruiting
  return player.player_type !== 'college';
}

// ============================================
// UTILITY TYPES
// ============================================

// API response wrapper
export type ApiResponse<T> = {
  data: T | null;
  error: Error | null;
};

// Pagination params
export type PaginationParams = {
  page: number;
  limit: number;
  offset: number;
};

// Filter params for discover
export type DiscoverFilters = {
  gradYear?: number;
  position?: string;
  state?: string;
  division?: string;
  minGPA?: number;
  minExitVelo?: number;
  minPitchVelo?: number;
  bats?: 'R' | 'L' | 'S';
  throws?: 'R' | 'L';
  search?: string;
};

// Sort options for discover
export type DiscoverSortOption =
  | 'name_asc'
  | 'name_desc'
  | 'grad_year_asc'
  | 'grad_year_desc'
  | 'gpa_desc'
  | 'updated_desc';

// Filter params for watchlist
export type WatchlistFilters = {
  stage?: PipelineStage;
  gradYear?: number;
  position?: string;
  search?: string;
};

// Onboarding steps
export type OnboardingStep = {
  step: number;
  title: string;
  description: string;
  completed: boolean;
};

// Dashboard stats (for coach/player)
export type DashboardStats = {
  totalViews?: number;
  weeklyViews?: number;
  watchlistAdds?: number;
  messages?: number;
  profileCompletion?: number;
};

// Form validation
export type FormErrors<T> = {
  [K in keyof T]?: string;
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

export const DIVISIONS = [
  'D1',
  'D2',
  'D3',
  'NAIA',
  'JUCO',
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
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate profile completion percentage
 */
export function calculateProfileCompletion(player: Partial<Player>): number {
  const fields = [
    player.first_name,
    player.last_name,
    player.email,
    player.phone,
    player.city,
    player.state,
    player.primary_position,
    player.grad_year,
    player.bats,
    player.throws,
    player.height_feet,
    player.weight_lbs,
    player.high_school_name,
    player.gpa,
    player.about_me,
    player.avatar_url,
  ];

  const completed = fields.filter((field) => field != null && field !== '').length;
  return Math.round((completed / fields.length) * 100);
}

/**
 * Format player name
 */
export function formatPlayerName(player: Pick<Player, 'first_name' | 'last_name'>): string {
  if (player.first_name && player.last_name) {
    return `${player.first_name} ${player.last_name}`;
  }
  return player.first_name || player.last_name || 'Unknown Player';
}

/**
 * Format coach name
 */
export function formatCoachName(coach: Pick<Coach, 'full_name'>): string {
  return coach.full_name || 'Unknown Coach';
}

/**
 * Format GPA
 */
export function formatGPA(gpa?: number | string | null): string {
  if (!gpa) return 'N/A';
  const numGPA = typeof gpa === 'string' ? parseFloat(gpa) : gpa;
  return numGPA.toFixed(2);
}

/**
 * Format velocity (mph)
 */
export function formatVelocity(velo?: number | string | null): string {
  if (!velo) return 'N/A';
  const numVelo = typeof velo === 'string' ? parseFloat(velo) : velo;
  return `${numVelo.toFixed(1)} mph`;
}

/**
 * Format time (seconds)
 */
export function formatTime(time?: number | string | null): string {
  if (!time) return 'N/A';
  const numTime = typeof time === 'string' ? parseFloat(time) : time;
  return `${numTime.toFixed(2)}s`;
}

/**
 * Get grad year label (e.g., "Class of 2026")
 */
export function getGradYearLabel(year?: number | null): string {
  if (!year) return 'N/A';
  return `Class of ${year}`;
}

/**
 * Check if player can have multiple teams
 */
export function canHaveMultipleTeams(playerType: PlayerType): boolean {
  return playerType === 'high_school' || playerType === 'showcase';
}

/**
 * Get organization type label
 */
export function getOrgTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    college: 'College',
    high_school: 'High School',
    juco: 'JUCO',
    showcase_org: 'Showcase Organization',
    travel_ball: 'Travel Ball',
  };
  return labels[type] || type;
}

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
  | 'comparison_alert'
  // Additional types for AI insights engine
  | 'decline'
  | 'trend'
  | 'alert'
  | 'opportunity'
  | 'milestone';
export type BaseballInsightPriority = 'critical' | 'urgent' | 'high' | 'medium' | 'low';
export type BaseballInsightStatus = 'active' | 'acknowledged' | 'dismissed' | 'resolved' | 'addressed';
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

export interface BaseballPlayerStatsInsert {
  player_id: string;
  team_id: string;
  coach_id: string;
  stat_type: BaseballStatType;
  session_date: string;
  session_name?: string | null;

  at_bats?: number;
  hits?: number;
  doubles?: number;
  triples?: number;
  home_runs?: number;
  rbis?: number;
  walks?: number;
  strikeouts?: number;
  stolen_bases?: number;
  caught_stealing?: number;
  hit_by_pitch?: number;
  sacrifice_bunts?: number;
  sacrifice_flies?: number;

  innings_pitched?: number;
  earned_runs?: number;
  runs_allowed?: number;
  hits_allowed?: number;
  walks_allowed?: number;
  strikeouts_thrown?: number;
  pitches_thrown?: number;
  strikes_thrown?: number;

  putouts?: number;
  assists?: number;
  errors?: number;

  exit_velocity?: number | null;
  launch_angle?: number | null;
  pitch_velocity?: number | null;
  spin_rate?: number | null;

  source?: BaseballStatSource;
  upload_batch_id?: string | null;
  notes?: string | null;
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

export interface BaseballCoachPhilosophyUpdate {
  priority_hitting?: number;
  priority_pitching?: number;
  priority_fielding?: number;
  priority_speed?: number;
  priority_mental_game?: number;

  alert_sensitivity?: BaseballAlertSensitivity;
  decline_threshold?: number;
  pressure_gap_threshold?: number;

  alert_performance_decline?: boolean;
  alert_pressure_gap?: boolean;
  alert_streaks?: boolean;
  alert_breakout_candidates?: boolean;
  alert_plateau?: boolean;
  alert_position_opportunities?: boolean;
}

// Player with aggregates for command center
export interface BaseballRosterPlayer extends Player {
  aggregates?: BaseballPlayerAggregates;
  recentStats?: BaseballPlayerStats[];
  insights?: BaseballCoachInsight[];
}

// Pressure Performance Index
export interface PressurePerformanceIndex {
  playerId: string;
  playerName: string;
  ppi: number; // 0-100 scale
  practiceAvg: number;
  gameAvg: number;
  gap: number;
  trend: BaseballTrend;
  sessionsAnalyzed: number;
}

// Trend Velocity
export interface TrendVelocity {
  playerId: string;
  metric: string;
  velocity: number; // Rate of change per session
  acceleration: number; // Is velocity itself changing?
  projection30Days: number;
  confidence: number; // 0-1
}

// CSV Column Mapping
export interface CSVColumnMapping {
  csvColumn: string;
  dbField: keyof BaseballPlayerStatsInsert | null;
  required: boolean;
}

// Upload Result
export interface StatsUploadResult {
  success: boolean;
  uploadId: string;
  totalRows: number;
  matchedRows: number;
  unmatchedRows: number;
  unmatched: UnmatchedPlayerData[];
  error?: string;
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
 * Player with match score for discover results.
 */
export interface DiscoverPlayerWithScore extends DiscoverPlayer {
  match_score?: number;
  match_breakdown?: MatchScoreBreakdown;
  percentiles?: PlayerPercentiles;
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

