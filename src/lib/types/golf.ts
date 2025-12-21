// Golf-specific types - completely separate from baseball types

// ============================================================================
// ENUMS / CONSTANTS
// ============================================================================

export type GolfPlayerYear = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'fifth_year' | 'graduate';
export type GolfPlayerStatus = 'active' | 'injured' | 'redshirt' | 'inactive';
export type GolfRoundType = 'tournament' | 'qualifier' | 'practice' | 'casual';
export type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';
export type GolfQualifierStatus = 'upcoming' | 'in_progress' | 'completed';
export type GolfUrgencyLevel = 'low' | 'normal' | 'high' | 'urgent';
export type GolfTaskStatus = 'pending' | 'completed' | 'overdue';
export type GolfTransportationType = 'bus' | 'van' | 'fly' | 'carpool';

// ============================================================================
// CORE ENTITIES
// ============================================================================

export interface GolfOrganization {
  id: string;
  name: string;
  division?: string;
  conference?: string;
  city?: string;
  state?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface GolfTeam {
  id: string;
  organization_id: string;
  name: string; // e.g., "Men's Golf", "Women's Golf"
  season?: string; // e.g., "2024-25"
  invite_code?: string;
  created_at: string;
  updated_at: string;
  organization?: GolfOrganization;
}

export interface GolfCoach {
  id: string;
  user_id: string;
  team_id?: string;
  organization_id?: string;
  full_name: string;
  email?: string;
  phone?: string;
  title?: string;
  avatar_url?: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
  team?: GolfTeam;
  organization?: GolfOrganization;
}

export interface GolfPlayer {
  id: string;
  user_id?: string;
  team_id?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  year?: GolfPlayerYear;
  graduation_year?: number;
  major?: string;
  hometown?: string;
  state?: string;
  handicap?: number;
  scholarship_percentage?: number;
  gpa?: number;
  status: GolfPlayerStatus;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
  team?: GolfTeam;
}

// ============================================================================
// ROUNDS & HOLES
// ============================================================================

export interface GolfHole {
  id: string;
  round_id: string;
  hole_number: number;
  par: number;
  score: number;
  score_to_par: number; // calculated: score - par
  putts?: number;
  fairway_hit?: boolean;
  green_in_regulation?: boolean;
  penalties?: number;
  notes?: string;
}

export interface GolfRound {
  id: string;
  player_id: string;
  qualifier_id?: string;
  round_number?: number; // For qualifiers (1, 2, 3, etc.)
  course_name: string;
  course_city?: string;
  course_state?: string;
  course_rating?: number;
  course_slope?: number;
  tees_played?: string;
  round_type: GolfRoundType;
  round_date: string;
  total_score?: number;
  total_to_par?: number;
  total_putts?: number;
  fairways_hit?: number;
  fairways_total?: number;
  greens_in_regulation?: number;
  greens_total?: number;
  total_penalties?: number;
  notes?: string;
  is_verified: boolean;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
  updated_at: string;
  player?: GolfPlayer;
  holes?: GolfHole[];
}

// ============================================================================
// EVENTS & CALENDAR
// ============================================================================

export interface GolfEvent {
  id: string;
  team_id: string;
  title: string;
  event_type: GolfEventType;
  start_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  all_day: boolean;
  location?: string;
  course_name?: string;
  description?: string;
  is_mandatory: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface GolfEventAttendance {
  id: string;
  event_id: string;
  player_id: string;
  status: 'attending' | 'not_attending' | 'maybe' | 'pending';
  responded_at?: string;
}

// ============================================================================
// QUALIFIERS
// ============================================================================

export interface GolfQualifier {
  id: string;
  team_id: string;
  name: string;
  description?: string;
  course_name?: string;
  location?: string;
  num_rounds: number;
  holes_per_round: number;
  start_date: string;
  end_date?: string;
  status: GolfQualifierStatus;
  show_live_leaderboard: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  entries?: GolfQualifierEntry[];
}

export interface GolfQualifierEntry {
  id: string;
  qualifier_id: string;
  player_id: string;
  position?: number;
  is_tied: boolean;
  total_score?: number;
  total_to_par?: number;
  rounds_completed: number;
  created_at: string;
  player?: GolfPlayer;
  rounds?: GolfRound[];
}

// ============================================================================
// COMMUNICATION
// ============================================================================

export interface GolfAnnouncement {
  id: string;
  team_id: string;
  title: string;
  body: string;
  urgency: GolfUrgencyLevel;
  requires_acknowledgement: boolean;
  send_push: boolean;
  send_email: boolean;
  publish_at?: string;
  published_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  acknowledgements?: GolfAnnouncementAcknowledgement[];
}

export interface GolfAnnouncementAcknowledgement {
  id: string;
  announcement_id: string;
  player_id: string;
  acknowledged_at: string;
  player?: GolfPlayer;
}

// ============================================================================
// TASKS
// ============================================================================

export interface GolfTask {
  id: string;
  team_id: string;
  title: string;
  description?: string;
  assigned_to?: string; // null = all players
  due_date?: string;
  requires_upload: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  completions?: GolfTaskCompletion[];
}

export interface GolfTaskCompletion {
  id: string;
  task_id: string;
  player_id: string;
  completed_at: string;
  upload_url?: string;
  player?: GolfPlayer;
}

// ============================================================================
// DOCUMENTS
// ============================================================================

export interface GolfDocument {
  id: string;
  team_id: string;
  title: string;
  description?: string;
  file_url: string;
  file_type: string;
  file_size: number;
  category?: string;
  player_visible: boolean;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// TRAVEL
// ============================================================================

export interface GolfTravelItinerary {
  id: string;
  team_id: string;
  event_id?: string;
  event_name: string;
  destination: string;
  transportation_type: GolfTransportationType;
  departure_date: string;
  departure_time?: string;
  departure_location?: string;
  return_date?: string;
  return_time?: string;
  flight_info?: string;
  hotel_name?: string;
  hotel_address?: string;
  hotel_phone?: string;
  hotel_confirmation?: string;
  check_in_date?: string;
  check_out_date?: string;
  room_assignments?: string;
  uniform_requirements?: string;
  gear_list?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// COACH NOTES
// ============================================================================

export interface GolfCoachNote {
  id: string;
  coach_id: string;
  player_id: string;
  title?: string;
  content: string;
  meeting_date?: string;
  meeting_type?: string;
  shared_with_player: boolean;
  created_at: string;
  updated_at: string;
  player?: GolfPlayer;
}

// ============================================================================
// ACADEMICS
// ============================================================================

export interface GolfPlayerClass {
  id: string;
  player_id: string;
  course_code?: string;
  course_name: string;
  instructor?: string;
  location?: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, etc.
  start_time: string;
  end_time: string;
  semester?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// STATS & CALCULATIONS
// ============================================================================

export interface GolfPlayerStats {
  scoringAverage: number;
  bestRound: number;
  roundsPlayed: number;
  handicap?: number;
  puttingAverage?: number;
  fairwayPercentage?: number;
  girPercentage?: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  par3Average?: number;
  par4Average?: number;
  par5Average?: number;
}

export interface GolfTeamStats {
  teamScoringAverage: number;
  bestTeamRound: number;
  totalRoundsRecorded: number;
  averagePuttsPerRound?: number;
  playerLeaderboard: {
    player: GolfPlayer;
    scoringAverage: number;
    roundsPlayed: number;
  }[];
}

export interface GolfScoreDistribution {
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  triplePlus: number;
}

// ============================================================================
// FORM DATA / INPUT TYPES
// ============================================================================

export interface GolfRoundInput {
  courseName: string;
  courseCity?: string;
  courseState?: string;
  courseRating?: number;
  courseSlope?: number;
  teesPlayed?: string;
  roundType: GolfRoundType;
  roundDate: string;
  qualifierId?: string;
  holes: {
    holeNumber: number;
    par: number;
    score: number;
    putts?: number;
    fairwayHit?: boolean;
    greenInRegulation?: boolean;
    penalties?: number;
    notes?: string;
  }[];
}

export interface GolfEventInput {
  title: string;
  eventType: GolfEventType;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  courseName?: string;
  description?: string;
  isMandatory?: boolean;
  notifyTeam?: boolean;
}

export interface GolfQualifierInput {
  name: string;
  description?: string;
  courseName?: string;
  location?: string;
  numRounds: number;
  holesPerRound: number;
  startDate: string;
  endDate?: string;
  playerIds: string[];
  showLiveLeaderboard?: boolean;
}
