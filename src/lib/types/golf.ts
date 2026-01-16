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
export type GolfOrganization = Tables<'golf_organizations'>;

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
// GolfTaskCompletion - table doesn't exist, define manually
export interface GolfTaskCompletion {
  id: string;
  task_id: string;
  player_id: string;
  completed_at: string;
  created_at?: string;
}
export type GolfAnnouncement = Tables<'golf_announcements'>;
// GolfAnnouncementAcknowledgement - table doesn't exist, define manually
export interface GolfAnnouncementAcknowledgement {
  id: string;
  announcement_id: string;
  player_id: string;
  acknowledged_at: string;
  created_at?: string;
}
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

// GolfCoachNote - table doesn't exist, define manually
export interface GolfCoachNote {
  id: string;
  coach_id: string;
  player_id: string;
  note: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// ENUMS (manually defined - not in database schema)
// ============================================================================

export type GolfPlayerYear = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'graduate';
export type GolfPlayerStatus = 'active' | 'inactive' | 'redshirt' | 'medical' | 'transfer';
export type GolfEventType = 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other';
export type GolfQualifierStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type GolfTaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

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
  shots: GolfShot[];
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

// ============================================================================
// PUTT MISS CLASSIFICATION TYPES
// ============================================================================

export type PuttMissTag = 'low' | 'high' | 'short';

export type PuttBreakDirection = 'left_to_right' | 'right_to_left' | 'straight';

export interface PuttDetails {
  id: string;
  shotId: string;
  missTags: PuttMissTag[];
  breakDirection?: PuttBreakDirection;
  estimatedBreakInches?: number;
  distanceFeet?: number;
  made: boolean;
  createdAt: string;
  updatedAt: string;
}

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

export const PUTT_MISS_TAG_CONFIG: Record<PuttMissTag, { 
  label: string; 
  description: string; 
  category: 'read' | 'speed' | 'stroke';
  color: string;
}> = {
  low: { 
    label: 'Low (More Break)', 
    description: 'Broke more than read', 
    category: 'read',
    color: 'text-blue-400'
  },
  high: { 
    label: 'High (Less Break)', 
    description: 'Broke less than read', 
    category: 'read',
    color: 'text-amber-400'
  },
  short: { 
    label: 'Short', 
    description: 'Left it short', 
    category: 'speed',
    color: 'text-red-400'
  },
};

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

export interface ApproachMissDetails {
  id: string;
  shotId: string;
  missDirection: ApproachMissDirection;
  distanceFromGreenYards?: number;
  lieType?: 'fairway' | 'rough' | 'bunker' | 'hazard';
  createdAt: string;
  updatedAt: string;
}

export interface ApproachTendencies {
  playerId: string;
  fullName: string;
  totalMisses: number;
  byDirection: Record<ApproachMissDirection, number>;
  shortTendencyPct: number;
  leftTendencyPct: number;
  bunkerMissPct: number;
}

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
export type PreviewStrategy = 'custom' | 'native' | 'iframe' | 'download';

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

export const REMINDER_PRESETS: ReminderPreset[] = [
  { label: '1 hour before', value: '1h', offsetHours: 1 },
  { label: '2 hours before', value: '2h', offsetHours: 2 },
  { label: '1 day before', value: '1d', offsetDays: 1 },
  { label: '2 days before', value: '2d', offsetDays: 2 },
  { label: '1 week before', value: '1w', offsetDays: 7 },
  { label: 'Custom', value: 'custom' },
];

export interface TaskReminder {
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

export const TASK_CATEGORIES: Record<TaskCategory, { label: string; color: string }> = {
  practice: { label: 'Practice', color: 'bg-green-100 text-green-800' },
  fitness: { label: 'Fitness', color: 'bg-blue-100 text-blue-800' },
  mental: { label: 'Mental', color: 'bg-purple-100 text-purple-800' },
  academic: { label: 'Academic', color: 'bg-yellow-100 text-yellow-800' },
  equipment: { label: 'Equipment', color: 'bg-gray-100 text-gray-800' },
  administrative: { label: 'Admin', color: 'bg-orange-100 text-orange-800' },
  other: { label: 'Other', color: 'bg-slate-100 text-slate-800' },
};

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

export interface TaskTemplateInsert {
  team_id: string;
  name: string;
  description?: string;
  category?: TaskCategory;
  default_priority?: 'low' | 'normal' | 'high' | 'urgent';
  default_due_days?: number;
  is_active?: boolean;
  created_by: string;
}

// ============================================================================
// STROKES GAINED & STATISTICS TYPES
// ============================================================================

export interface StrokesGainedBreakdown {
  tee: number;
  approach: number;
  around_green: number;
  putting: number;
}

export interface StrokesGainedResult {
  total: number;
  breakdown: StrokesGainedBreakdown;
  roundsAnalyzed: number;
  benchmarkType: 'pga' | 'scratch' | 'team';
}

export type TrendDirection = 'improving' | 'declining' | 'stable' | 'insufficient_data';

export interface TrendPoint {
  date: string;
  value: number;
  label?: string;
}

export interface TrendAnalysis {
  direction: TrendDirection;
  changePercent: number;
  dataPoints: TrendPoint[];
  periodLabel: string;
}

export interface StatCardProps {
  label: string;
  value: string | number;
  trend?: TrendDirection;
  trendValue?: string;
  description?: string;
  icon?: React.ReactNode;
}
