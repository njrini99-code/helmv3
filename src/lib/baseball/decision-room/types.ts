/**
 * Decision Room read-model types.
 *
 * Lives in src/lib so read-models and actions share shapes without
 * lib → app imports. Re-exported from decision-room.ts for backwards compat.
 */

import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

/** A cited source reference shown under an agenda item ("decide with evidence"). */
export interface DecisionRoomSourceRef {
  label: string;
  detail: string | null;
}

/** Severity tint for an agenda item / conflict (null = neutral). */
export type DecisionRoomSeverity = 'critical' | 'warning' | 'info';

/**
 * An item on the meeting agenda. `kind` is 'meeting_item' for a materialized,
 * staff-created/raised item and 'signal' for an open signal surfaced for
 * triage. `status` is 'discussed' once marked, otherwise 'open'.
 */
export interface DecisionRoomAgendaItem {
  id: string;
  kind: 'meeting_item' | 'signal';
  title: string;
  detail: string | null;
  status: 'open' | 'discussed';
  /** Severity tint; null when the item carries no severity signal. */
  severityHint: DecisionRoomSeverity | null;
  /** The player the item concerns, when player-scoped. */
  playerId: string | null;
  playerName: string | null;
  /** The originating signal id, when this item came from / can convert a signal. */
  sourceSignalId: string | null;
  /** Count of structured sources backing the item (shown as "N src"). */
  sourceRefCount: number;
  /** The structured sources themselves, rendered in the detail panel. */
  sourceRefs: DecisionRoomSourceRef[];
}

/** A coaching insight surfaced in the Decision Room insight rail. */
export interface DecisionRoomInsight {
  id: string;
  title: string;
  body: string | null;
  insightType: string;
  priority: string | null;
  status: string;
  authorName: string | null;
  createdAt: string;
}

/** A player + missed-session count inside an attendance/lift summary. */
export interface DecisionRoomSummaryPlayer {
  playerId: string;
  playerName: string | null;
  missedCount: number;
}

/** A decision-ledger entry — a record of a decision MADE, threaded to evidence. */
export interface DecisionRoomLedgerEntry {
  id: string;
  kind:
    | 'invite_accepted'
    | 'invite_pending'
    | 'discussed'
    | 'resolved'
    | 'converted_task'
    | 'converted_note'
    | 'converted_practice'
    | 'raised'
    | 'reopened'
    | 'note';
  label: string;
  detail: string | null;
  at: string;
}

/** A player flagged for discussion, with open/critical signal counts. */
export interface DecisionRoomPlayerFocus {
  playerId: string;
  name: string;
  openCount: number;
  criticalCount: number;
}

/** An import-quality issue surfaced onto the agenda. */
export interface DecisionRoomImportIssue {
  /** The originating signal id — also the React key for the row. */
  signalId: string;
  title: string;
  detail: string | null;
  severity: DecisionRoomSeverity;
}

/** A practice-effectiveness review summary ("did the practice move the metric"). */
export interface DecisionRoomEffectivenessReview {
  id: string;
  practiceTitle: string;
  focusArea: string | null;
  metricLabel: string | null;
  direction: 'improved' | 'regressed' | 'no_change' | null;
  conclusion: string | null;
  recommendedLabel: string | null;
}

/** A tracked action-outcome ("did-it-move") row. */
export interface DecisionRoomActionOutcome {
  id: string;
  title: string;
  playerName: string | null;
  metricLabel: string | null;
  unit: string | null;
  baselineValue: number | null;
  observedValue: number | null;
  sampleN: number | null;
  /** Whether a measurement has been taken yet (false = still tracking). */
  measured: boolean;
  verdict: BaseballActionOutcomeVerdict | null;
}

/** A recent completed game result. */
export interface DecisionRoomGameResult {
  id: string;
  gameDate: string;
  opponentName: string | null;
  homeAway: 'home' | 'away' | null;
  ourScore: number | null;
  opponentScore: number | null;
  result: 'win' | 'loss' | 'tie' | null;
}

/** A player availability concern (injury / limitation window). */
export interface DecisionRoomAvailabilityConcern {
  id: string;
  playerId: string;
  playerName: string | null;
  status: 'out' | 'limited' | 'available';
  reasonCategory: string | null;
  note: string | null;
  /** Window start; the row renders "Since {startsAt}" unconditionally. */
  startsAt: string;
  endsAt: string | null;
}

/** Aggregate practice-attendance summary over the trailing window. */
export interface DecisionRoomAttendanceSummary {
  totalPractices: number;
  totalAttended: number;
  totalMissed: number;
  concernedPlayers: DecisionRoomSummaryPlayer[];
}

/** Aggregate lift-compliance summary over the trailing window. */
export interface DecisionRoomLiftSummary {
  scheduledCount: number;
  completedCount: number;
  nonCompliantPlayers: DecisionRoomSummaryPlayer[];
}

/** An open staff/operational task surfaced onto the agenda. */
export interface DecisionRoomOpenTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
}

/** A scheduling/obligation conflict (e.g. class vs. travel). */
export interface DecisionRoomConflict {
  id: string;
  playerName: string | null;
  severity: DecisionRoomSeverity;
  obligationKind: string;
  obligationLabel: string | null;
  whyItMatters: string | null;
  recommendedActionLabel: string | null;
}

/** The full Decision Room read model rendered by StaffDecisionRoomClient. */
export interface DecisionRoomData {
  agenda: DecisionRoomAgendaItem[];
  insights: DecisionRoomInsight[];
  ledger: DecisionRoomLedgerEntry[];
  playersToDiscuss: DecisionRoomPlayerFocus[];
  importIssues: DecisionRoomImportIssue[];
  effectivenessReviews: DecisionRoomEffectivenessReview[];
  actionOutcomes: DecisionRoomActionOutcome[];
  recentGameResults: DecisionRoomGameResult[];
  availabilityConcerns: DecisionRoomAvailabilityConcern[];
  attendanceSummary: DecisionRoomAttendanceSummary;
  liftSummary: DecisionRoomLiftSummary;
  openTasks: DecisionRoomOpenTask[];
  conflicts: DecisionRoomConflict[];
  // headline counters
  staffCount: number;
  decisionCount: number;
  openAgendaCount: number;
  openInsightCount: number;
  outcomeMovedCount: number;
}

/** Result envelope shared by the Decision Room mutations. */
export interface DecisionRoomMutationResult {
  success: boolean;
  error?: string;
}

/** A coaching-staff member as shown in the Staff Settings roster + matrix. */
export interface StaffMemberView {
  id: string;
  name: string;
  email: string | null;
  /** Free-text role label (e.g. "Assistant Coach"). */
  role: string | null;
  /** Optional formal title, shown as a fallback to role. */
  title: string | null;
  status: 'active' | 'removed' | string;
  isPrimary: boolean;
  isHeadCoach: boolean;
  /** capability_key -> granted. */
  capabilities: Record<string, boolean>;
  /** The underlying baseball_coaches.id for this staff member (null for invited-but-not-joined). */
  coachId: string | null;
  /** Avatar / profile photo URL from the coach's profile, if set. */
  avatarUrl: string | null;
  /** Whether this staff member is visible on player-facing roster views. */
  visibleToPlayers: boolean;
  /** Optional bio shown on player-facing profile. */
  bio: string | null;
  /** Contact phone shown to players (when visibility allows). */
  phone: string | null;
  /** When non-empty, restricts this staff member's view to these player ids. */
  scopePlayerIds: string[];
  /** When non-empty, restricts this staff member's view to these group ids. */
  scopeGroupIds: string[];
  /** ISO timestamp when this staff record was created. */
  createdAt: string | null;
}

/** A pending/used staff invitation. */
export interface StaffInvitationView {
  id: string;
  email: string;
  role: string | null;
  /**
   * Invite token used to build the copyable join link. Empty string once the
   * invite is consumed/revoked (the Copy button is `disabled` when empty), so
   * this stays a plain string rather than nullable.
   */
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | string;
  expiresAt: string;
  isExpired: boolean;
  invitedByName: string | null;
  /** ISO timestamp when the invitee accepted the invitation (null while pending/revoked). */
  acceptedAt?: string | null;
  /** ISO timestamp when the invitation was created. */
  createdAt?: string;
}

/** The full Staff Settings read model rendered by StaffSettingsClient. */
export interface StaffSettingsData {
  staff: StaffMemberView[];
  invitations: StaffInvitationView[];
  /** Whether the VIEWER may edit/invite/remove (is_head_coach || can_invite_staff). */
  canManageStaff: boolean;
}
