/**
 * Golf Platform Type Exports
 *
 * Centralized type definitions for the GolfHelm platform.
 * All types are derived from the Supabase database schema.
 */

import { Tables } from './database';

// ============================================================================
// CORE ENTITIES
// ============================================================================

export type GolfCoach = Tables<'golf_coaches'>;
export type GolfPlayer = Tables<'golf_players'>;
export type GolfTeam = Tables<'golf_teams'>;
// ============================================================================
// ROUND TRACKING
// ============================================================================

export type GolfRound = Tables<'golf_rounds'>;
export type GolfHole = Tables<'golf_holes'>;
export type GolfShot = Tables<'golf_shots'>; // Using golf_shots instead of golf_hole_shots

// ============================================================================
// TEAM MANAGEMENT
// ============================================================================

export type GolfEvent = Tables<'golf_events'>;
export type GolfEventAttendance = Tables<'golf_event_attendance'>;
export type GolfTask = Tables<'golf_tasks'>;
type GolfAnnouncement = Tables<'golf_announcements'>;
// GolfAnnouncementAcknowledgement - table doesn't exist, define manually
export interface GolfAnnouncementAcknowledgement {
  id: string;
  announcement_id: string;
  player_id: string;
  acknowledged_at: string;
  created_at?: string;
}
export type GolfDocument = Tables<'golf_documents'>;

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

// Enriched announcement with all relations (used by detail views)
export interface GolfAnnouncementEnriched extends GolfAnnouncement {
  recipients: Array<{
    player_id: string;
    player: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  }>;
  documents: Array<{
    id: string;
    document_id: string;
    sort_order: number;
    document: { id: string; title: string; file_url: string; file_type: string; file_size: number } | null;
  }>;
  tasks: Array<{
    id: string;
    task_id: string;
    sort_order: number;
    task: {
      id: string;
      title: string;
      description: string | null;
      due_date: string | null;
    } | null;
    assignments: Array<{
      id: string;
      player_id: string;
      status: string;
      completed_at: string | null;
      player: { first_name: string | null; last_name: string | null } | null;
    }>;
  }>;
  acknowledgements: Array<GolfAnnouncementAcknowledgement & {
    player?: { first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  }>;
  total_recipients: number;
  acknowledged_count: number;
  task_count: number;
  completed_task_count: number;
}

// Announcement meta for list views (lighter than full enriched)
export interface GolfAnnouncementMeta extends GolfAnnouncement {
  recipient_count: number;
  acknowledged_count: number;
  total_recipients: number;
  task_count: number;
  completed_task_count: number;
  document_count: number;
  has_player_acknowledged?: boolean; // for player view
  /** First N players who acknowledged (for avatar stack in list view) */
  acknowledged_players?: Array<{
    player_id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  }>;
}

// ============================================================================
// UI TYPES
// ============================================================================

/**
 * Canonical ShotRecord — the comprehensive shot tracking type.
 * Previously defined in ShotTrackingComprehensive.tsx; moved here for centralization.
 * All files should import from '@/lib/types/golf' or '@/lib/types'.
 */
export interface ShotRecord {
  id?: string;
  shotNumber: number;
  shotType: 'tee' | 'approach' | 'around_green' | 'putting' | 'penalty';
  clubType: 'driver' | 'non_driver' | 'putter';
  lieBefore: 'tee' | 'fairway' | 'rough' | 'sand' | 'green' | 'other';
  distanceToHoleBefore: number;
  distanceUnitBefore: 'yards' | 'feet';
  result: 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other' | 'penalty';
  distanceToHoleAfter: number;
  distanceUnitAfter: 'yards' | 'feet';
  shotDistance: number;
  missDirection?: string;
  puttBreak?: 'right_to_left' | 'left_to_right' | 'straight' | 'multiple';
  puttSlope?: 'uphill' | 'downhill' | 'level' | 'severe';
  isPenalty: boolean;
  penaltyType?: 'ob' | 'water' | 'unplayable' | 'lost';
  puttMissTags?: PuttMissTag[];
  puttDistanceFeet?: number;
  approachMissDirection?: ApproachMissDirection;
  approachMissLieType?: 'fairway' | 'rough' | 'bunker' | 'hazard';
  distanceFromGreenYards?: number;
}

/**
 * Canonical HoleStats — calculated stats for a completed hole.
 * Previously defined in ShotTrackingComprehensive.tsx; moved here for centralization.
 */
export interface HoleStats {
  holeNumber: number;
  par: number;
  yardage: number;
  score: number;
  putts: number;
  fairwayHit: boolean | null;
  greenInRegulation: boolean;
  drivingDistance: number | null;
  usedDriver: boolean | null;
  driveMissDirection: string | null;
  approachDistance: number | null;
  approachLie: string | null;
  approachProximity: number | null;
  approachMissDirection: string | null;
  scrambleAttempt: boolean;
  scrambleMade: boolean;
  sandSaveAttempt: boolean;
  sandSaveMade: boolean;
  penaltyStrokes: number;
  firstPuttDistance: number | null;
  firstPuttLeave: number | null;
  firstPuttBreak: string | null;
  firstPuttSlope: string | null;
  firstPuttMissDirection: string | null;
  holedOutDistance: number | null;
  holedOutType: string | null;
  shots: ShotRecord[];
}

/**
 * Canonical RoundHole — the hole setup/config used across round pages.
 * Replaces the 8+ duplicated `interface Hole { number, par, yardage, score }` definitions.
 */
export interface RoundHole {
  number: number;
  par: number;
  yardage: number;
  score: number | null;
}

// ============================================================================
// PUTT MISS CLASSIFICATION TYPES
// ============================================================================

export type PuttMissTag = 'low' | 'high' | 'short' | 'long';

export interface PlayerPuttTendencies {
  playerId: string;
  fullName: string;
  totalMissedPutts: number;
  missByType: {
    low: number;
    high: number;
    short: number;
    long: number;
    pull: number;
    push: number;
  };
  percentages: {
    lowMissPct: number;
    highMissPct: number;
    underReadTendency: number; // 0-100, >50 means under-reads more
    leaveShortTendency: number; // 0-100, >50 means leaves short more
  };
  byDistance: {
    inside5ft: { attempts: number; made: number; pct: number };
    fiveTo10ft: { attempts: number; made: number; pct: number };
    outside10ft: { attempts: number; made: number; pct: number };
  };
}

// ============================================================================
// APPROACH MISS CLASSIFICATION TYPES
// ============================================================================

export type ApproachMissDirection = 
  | 'short'
  | 'long'
  | 'left'
  | 'right'
  | 'short_left'
  | 'short_right'
  | 'long_left'
  | 'long_right';

export const APPROACH_MISS_CONFIG: Record<ApproachMissDirection, {
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
}> = {
  short: { 
    label: 'Short', 
    shortLabel: 'S',
    icon: '↓', 
    color: 'text-red-400' 
  },
  long: { 
    label: 'Long', 
    shortLabel: 'L',
    icon: '↑', 
    color: 'text-orange-400' 
  },
  left: { 
    label: 'Left', 
    shortLabel: 'L',
    icon: '←', 
    color: 'text-blue-400' 
  },
  right: { 
    label: 'Right', 
    shortLabel: 'R',
    icon: '→', 
    color: 'text-purple-400' 
  },
  short_left: { 
    label: 'Short Left', 
    shortLabel: 'SL',
    icon: '↙', 
    color: 'text-red-400' 
  },
  short_right: { 
    label: 'Short Right', 
    shortLabel: 'SR',
    icon: '↘', 
    color: 'text-red-400' 
  },
  long_left: { 
    label: 'Long Left', 
    shortLabel: 'LL',
    icon: '↖', 
    color: 'text-orange-400' 
  },
  long_right: {
    label: 'Long Right',
    shortLabel: 'LR',
    icon: '↗',
    color: 'text-orange-400'
  },
};

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  file_url?: string;
  created_by: string;
  created_at: string;
  notes?: string;
  change_notes?: string;
  uploader?: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
}

export interface VersionComparison {
  version1: DocumentVersion;
  version2: DocumentVersion;
  changes?: string[];
  sizeDiff?: number;
  daysBetween?: number;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Preview strategy for documents
 * - 'custom': PDF, text files - rendered with custom viewers (PDFViewer, TextPreview)
 * - 'native': Images, video, audio - rendered with native browser elements
 * - 'iframe': Office documents - rendered via Google Docs Viewer
 * - 'download': Unsupported types - show download option only
 */
type PreviewStrategy = 'custom' | 'native' | 'iframe' | 'download';

/**
 * Get preview strategy based on mime type
 */
export function getPreviewStrategy(mimeType: string): PreviewStrategy {
  // PDF and text files use custom viewers
  if (mimeType === 'application/pdf') return 'custom';
  if (mimeType.startsWith('text/') || mimeType === 'application/json') return 'custom';

  // Images, video, and audio use native browser elements
  if (mimeType.startsWith('image/')) return 'native';
  if (mimeType.startsWith('video/')) return 'native';
  if (mimeType.startsWith('audio/')) return 'native';

  // Office documents use Google Docs Viewer iframe
  if (
    mimeType.includes('word') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType.includes('powerpoint') ||
    mimeType.includes('presentation')
  ) {
    return 'iframe';
  }

  // Everything else falls back to download
  return 'download';
}

// ============================================================================
// TASK REMINDER TYPES
// ============================================================================

export type ReminderType = 'in_app' | 'email' | 'push' | 'all';

export interface ReminderPreset {
  label: string;
  value: string;
  offsetDays?: number;
  offsetHours?: number;
}

interface TaskReminder {
  id: string;
  task_id: string;
  scheduled_for: string;
  reminder_type: ReminderType;
  sent: boolean;
  sent_at?: string;
  created_at?: string;
}

export interface TaskReminderWithTask extends TaskReminder {
  task: GolfTask;
}

// ============================================================================
// TASK TEMPLATE TYPES
// ============================================================================

export type TaskCategory =
  | 'practice'
  | 'fitness'
  | 'mental'
  | 'academic'
  | 'equipment'
  | 'administrative'
  | 'other';

export interface TaskTemplate {
  id: string;
  team_id: string;
  name: string;
  description?: string;
  category: TaskCategory;
  default_priority: 'low' | 'normal' | 'high' | 'urgent';
  default_due_days?: number;
  is_active: boolean;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// ROUND REVIEW TYPES
// ============================================================================

/**
 * Review status enum for round reviews
 */
export type ReviewStatus =
  | 'pending'
  | 'generating'
  | 'draft'
  | 'coach_review'
  | 'approved'
  | 'shared'
  | 'failed';

/**
 * Key statistics extracted from a round for review
 */
export interface ReviewKeyStats {
  scoring_avg: number | null;
  score_vs_par: number | null;
  putts_per_round: number | null;
  putts_per_gir: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
  scramble_pct: number | null;
  three_putt_pct: number | null;
  one_putt_pct: number | null;
  penalty_count: number | null;
  strokes_gained?: {
    total: number | null;
    off_tee: number | null;
    approach: number | null;
    around_green: number | null;
    putting: number | null;
  };
}

/**
 * Drill recommendation from AI or coach
 */
export interface DrillRecommendation {
  id: string;
  name: string;
  description: string;
  focus_area: string;
  duration_minutes?: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  video_url?: string;
}

/**
 * Coach feedback input for round reviews
 */
export interface CoachFeedbackInput {
  coach_notes?: string;
  coach_rating?: number;
  coach_highlights?: string[];
  coach_focus_areas?: string[];
  coach_drill_recommendations?: DrillRecommendation[];
}

/**
 * Response from generate review action
 */
export interface GenerateReviewResponse {
  success: boolean;
  review_id?: string;
  status?: ReviewStatus;
  message?: string;
  error?: string;
}

/**
 * Extended GolfRoundReview type that includes all fields used by the review system.
 * This extends beyond the database schema to include computed/virtual fields.
 */
export interface GolfRoundReview {
  id: string;
  round_id: string;
  player_id: string;
  created_at: string | null;
  updated_at: string | null;

  // Core review content (from database)
  summary: string | null;
  highlights: unknown | null;
  areas_to_review: unknown | null;
  patterns_detected: unknown | null;
  primary_takeaway: string | null;
  next_practice_priority: string | null;
  round_stats: unknown | null;
  round_score: number | null;
  round_score_to_par: number | null;
  scoring_avg_before: number | null;
  scoring_avg_after: number | null;
  engine_version: string | null;

  // Sharing (from database)
  shared_with_coach: boolean | null;
  shared_at: string | null;
  coach_notes: string | null;
  coach_viewed_at: string | null;

  // Extended fields for review system (may need migration)
  status?: ReviewStatus;
  status_message?: string | null;
  generation_attempts?: number;
  generation_started_at?: string | null;
  generation_completed_at?: string | null;
  last_error?: string | null;

  // AI-generated content
  strengths?: string[];
  areas_for_improvement?: string[];
  key_stats?: ReviewKeyStats;
  ai_recommendations?: string[];
  ai_model_used?: string | null;
  ai_generation_duration_ms?: number | null;

  // Coach feedback
  coach_rating?: number | null;
  coach_highlights?: string[];
  coach_focus_areas?: string[];
  coach_drill_recommendations?: DrillRecommendation[];
  coach_approved?: boolean;
  coach_approved_at?: string | null;
  coach_approved_by?: string | null;

  // Player interaction
  shared_with_player?: boolean;
  player_viewed_at?: string | null;
  player_feedback?: string | null;
  player_acknowledged?: boolean;
}

/**
 * Round review with full round and player details
 */
export interface RoundReviewWithDetails extends GolfRoundReview {
  round: GolfRound & {
    player: GolfPlayer & {
      profile?: {
        id: string;
        first_name: string;
        last_name: string;
        email?: string;
        avatar_url?: string;
      };
    };
    course?: {
      id: string;
      name: string;
      city?: string;
      state?: string;
    };
  };
}

// ============================================================================
// TASK TEMPLATE DATA TYPES
// ============================================================================

export interface CreateTemplateData {
  team_id: string;
  name: string;
  description?: string;
  category?: TaskCategory;
  default_priority?: 'low' | 'normal' | 'high' | 'urgent';
  default_due_days?: number;
  created_by: string;
}

export interface UpdateTemplateData {
  name?: string;
  description?: string;
  category?: TaskCategory;
  default_priority?: 'low' | 'normal' | 'high' | 'urgent';
  default_due_days?: number;
  is_active?: boolean;
}

export interface CreateTaskFromTemplate {
  template_id: string;
  team_id: string;
  assigned_to?: string[];
  due_date?: string;
  custom_title?: string;
  custom_description?: string;
}


