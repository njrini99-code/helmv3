import type {
  TracerData,
  TracerPlayerSummary,
  TracerRoundDetail,
  TracerStatsAccuracy,
  TracerErrorLog,
  TracerActivityEvent,
} from '@/app/golf/actions/admin-tracer-data';

// Re-export base types for convenience
export type {
  TracerData,
  TracerPlayerSummary,
  TracerRoundDetail,
  TracerStatsAccuracy,
  TracerErrorLog,
  TracerActivityEvent,
};

// ============================================================================
// SUB-TAB TYPES
// ============================================================================

export type TracerSubTab = 'health' | 'rounds' | 'quality' | 'errors';

export interface TracerSubTabConfig {
  id: TracerSubTab;
  label: string;
  badge?: number;
}

// ============================================================================
// ENRICHED DATA (from getTracerEnrichedData)
// ============================================================================

export interface DailyCount {
  date: string;
  count: number;
}

export interface TracerEnrichedData {
  dailyRoundCounts: DailyCount[];
  dailyErrorCounts: DailyCount[];
  stuckRounds: StuckRound[];
}

export interface StuckRound {
  round_id: string;
  player_id: string;
  player_name: string;
  course_name: string | null;
  updated_at: string;
  hours_stuck: number;
}

// ============================================================================
// ROUND DIAGNOSTIC (from getTracerRoundDiagnostic)
// ============================================================================

export interface HoleDiagnostic {
  hole_number: number;
  par: number | null;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
}

export interface ShotDiagnostic {
  shot_number: number;
  hole_number: number;
  club: string | null;
  shot_type: string | null;
  distance: number | null;
}

export interface RoundDiagnosticData {
  round: TracerRoundDetail;
  holes: HoleDiagnostic[];
  shots: ShotDiagnostic[];
  errors: TracerErrorLog[];
  playerName: string;
}

// ============================================================================
// FLAT ROUND (for Round Inspector table)
// ============================================================================

export interface FlatRound extends TracerRoundDetail {
  player_id: string;
  player_name: string;
}

// ============================================================================
// ERROR GROUPING (for Error Analytics)
// ============================================================================

export interface ErrorGroup {
  key: string;
  message: string;
  count: number;
  severity: string;
  firstSeen: string;
  lastSeen: string;
  affectedPlayers: string[];
}

export interface AffectedPlayer {
  player_id: string;
  player_name: string;
  errorCount: number;
}

// ============================================================================
// OUTLIER DETECTION (for Data Quality)
// ============================================================================

export interface Outlier {
  player_id: string;
  player_name: string;
  round_id: string;
  field: string;
  value: number;
  threshold: number;
  course_name: string | null;
}

// ============================================================================
// COMPLETENESS GRID (for Data Quality)
// ============================================================================

export type CompletenessCategory = 'Putts' | 'FW' | 'GIR' | 'Details' | 'SG' | 'Cache';

export interface PlayerCompleteness {
  player_id: string;
  player_name: string;
  categories: Record<CompletenessCategory, number>; // 0-100 percentage
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export type AlertSeverityLevel = 'critical' | 'warning' | 'info';

export interface TracerAlert {
  id: string;
  severity: AlertSeverityLevel;
  title: string;
  detail: string;
  navigateTo?: TracerSubTab;
  roundId?: string;
}
