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

// ============================================================================
// ROUND INTEGRITY DATA (from hole-level aggregation)
// ============================================================================

export interface RoundIntegrityData {
  round_id: string;
  hole_count: number;
  holes_sum_score: number | null;
  holes_sum_putts: number | null;
  holes_sum_fairways_hit: number;
  holes_sum_fairways_total: number;
  holes_sum_gir: number;
  holes_sum_gir_total: number;
  null_score_count: number;
  null_putts_count: number;
  max_hole_score: number | null;
}

// ============================================================================
// DATA QUALITY ISSUE — The universal diagnostic result
// ============================================================================

export type IssueSeverity = 'critical' | 'warning' | 'info';

export type IssueCategory =
  | 'missing_data'
  | 'outlier'
  | 'integrity'
  | 'cache_divergence'
  | 'completeness'
  | 'stuck_round';

export type FixType =
  | 'recalculate_round_totals'
  | 'recalculate_round_gir'
  | 'refresh_player_stats_cache'
  | 'recalculate_strokes_gained';

export interface DataQualityIssue {
  id: string;
  checkId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  category: IssueCategory;
  player_id: string;
  player_name: string;
  round_id: string | null;
  course_name: string | null;
  round_date: string | null;
  actual_value: string | number | null;
  expected_value: string | number | null;
  fixable: boolean;
  fix_type: FixType | null;
}

export interface FixResult {
  success: boolean;
  fix_type: string;
  round_id: string | null;
  player_id: string | null;
  message: string;
  changes?: Record<string, { before: string | number | null; after: string | number | null }>;
}

export interface PlayerQualityScore {
  player_id: string;
  player_name: string;
  overall_score: number;
  category_scores: Record<IssueCategory, number>;
  critical_count: number;
  warning_count: number;
  info_count: number;
  total_issues: number;
  fixable_count: number;
}

export type GroupByOption = 'none' | 'category' | 'player' | 'severity';

export interface DataQualityFilterState {
  severity: IssueSeverity | 'all';
  category: IssueCategory | 'all';
  player_id: string | 'all';
  fixable_only: boolean;
  search: string;
  group_by: GroupByOption;
}
