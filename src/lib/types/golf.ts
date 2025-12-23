/**
 * Golf Platform Type Exports
 *
 * Centralized type definitions for the GolfHelm platform.
 * All types are derived from the Supabase database schema.
 */

import { Tables, Enums } from './database';

// ============================================================================
// CORE ENTITIES
// ============================================================================

export type GolfCoach = Tables<'golf_coaches'>;
export type GolfPlayer = Tables<'golf_players'>;
export type GolfTeam = Tables<'golf_teams'>;
export type GolfOrganization = Tables<'golf_organizations'>;

// ============================================================================
// ROUND TRACKING
// ============================================================================

export type GolfRound = Tables<'golf_rounds'>;
export type GolfHole = Tables<'golf_holes'>;
export type GolfHoleShot = Tables<'golf_hole_shots'>;

// ============================================================================
// TEAM MANAGEMENT
// ============================================================================

export type GolfEvent = Tables<'golf_events'>;
export type GolfEventAttendance = Tables<'golf_event_attendance'>;
export type GolfTask = Tables<'golf_tasks'>;
export type GolfTaskCompletion = Tables<'golf_task_completions'>;
export type GolfAnnouncement = Tables<'golf_announcements'>;
export type GolfAnnouncementAcknowledgement = Tables<'golf_announcement_acknowledgements'>;
export type GolfDocument = Tables<'golf_documents'>;
export type GolfTravelItinerary = Tables<'golf_travel_itineraries'>;

// ============================================================================
// QUALIFIERS & COMPETITION
// ============================================================================

export type GolfQualifier = Tables<'golf_qualifiers'>;
export type GolfQualifierEntry = Tables<'golf_qualifier_entries'>;

// ============================================================================
// ACADEMICS
// ============================================================================

export type GolfPlayerClass = Tables<'golf_player_classes'>;

// ============================================================================
// COACH NOTES
// ============================================================================

export type GolfCoachNote = Tables<'golf_coach_notes'>;

// ============================================================================
// ENUMS
// ============================================================================

export type GolfPlayerYear = Enums<'golf_player_year'>;
export type GolfPlayerStatus = Enums<'golf_player_status'>;
export type GolfEventType = Enums<'golf_event_type'>;
export type GolfQualifierStatus = Enums<'golf_qualifier_status'>;
export type GolfTaskStatus = Enums<'golf_task_status'>;

// ============================================================================
// EXTENDED TYPES (with relations)
// ============================================================================

export type GolfPlayerWithTeam = GolfPlayer & {
  team: GolfTeam | null;
};

export type GolfRoundWithHoles = GolfRound & {
  holes: GolfHole[];
};

export type GolfHoleWithShots = GolfHole & {
  shots: GolfHoleShot[];
};

export type GolfEventWithAttendance = GolfEvent & {
  attendance: GolfEventAttendance[];
};

export type GolfTaskWithCompletions = GolfTask & {
  completions: GolfTaskCompletion[];
};

export type GolfAnnouncementWithAcknowledgements = GolfAnnouncement & {
  acknowledgements: GolfAnnouncementAcknowledgement[];
};

// ============================================================================
// FORM DATA TYPES
// ============================================================================

export interface CreateRoundData {
  player_id: string;
  course_name: string;
  course_location?: string;
  played_at: string;
  total_score?: number;
  total_putts?: number;
  fairways_hit?: number;
  greens_in_regulation?: number;
  notes?: string;
}

export interface CreateHoleData {
  round_id: string;
  hole_number: number;
  par: number;
  yardage: number;
  score: number;
  putts?: number;
  fairway_hit?: boolean;
  green_in_regulation?: boolean;
}

export interface CreateShotData {
  hole_id: string;
  shot_number: number;
  club?: string;
  distance_yards?: number;
  result?: string;
  notes?: string;
}

export interface CreateEventData {
  team_id: string;
  title: string;
  description?: string;
  event_type: GolfEventType;
  start_time: string;
  end_time?: string;
  location?: string;
  is_mandatory?: boolean;
}

export interface CreateTaskData {
  team_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  assigned_to?: string[];
}

export interface CreateAnnouncementData {
  team_id: string;
  title: string;
  content: string;
  priority?: 'normal' | 'high' | 'urgent';
}

// ============================================================================
// STATISTICS TYPES
// ============================================================================

export interface PlayerStats {
  rounds_played: number;
  scoring_average: number;
  best_round: number;
  worst_round: number;
  putts_per_round: number;
  fairways_hit_percentage: number;
  greens_in_regulation_percentage: number;
  handicap_index?: number;
}

// Alias for consistency
export type GolfPlayerStats = PlayerStats;

export interface TeamStats {
  total_players: number;
  active_players: number;
  total_rounds: number;
  team_scoring_average: number;
  upcoming_events: number;
  pending_tasks: number;
}

// ============================================================================
// UI TYPES
// ============================================================================

export interface ShotRecord {
  shot_number: number;
  club?: string;
  distance_yards?: number;
  result?: string;
  notes?: string;
}

export interface HoleData {
  hole_number: number;
  par: number;
  yardage: number;
  score?: number;
  putts?: number;
  fairway_hit?: boolean;
  green_in_regulation?: boolean;
  shots: ShotRecord[];
}

export interface RoundData {
  course_name: string;
  course_location?: string;
  played_at: string;
  holes: HoleData[];
}
