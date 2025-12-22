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
export type Player = Tables['players']['Row'];
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
export interface PlayerComparison {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  player_ids: string[];
  comparison_data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PlayerComparisonInsert {
  coach_id: string;
  name: string;
  description?: string | null;
  player_ids: string[];
  comparison_data?: Record<string, any>;
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

