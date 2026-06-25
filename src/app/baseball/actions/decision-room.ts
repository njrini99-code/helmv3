'use server';

// =============================================================================
// src/app/baseball/actions/decision-room.ts
//
// Wave 11 / packet: decision-room
//
// TYPED PLACEHOLDER backend for the Staff Decision Room + Staff Settings UIs.
//
// These stubs exist so the Decision Room and Staff Settings surfaces COMPILE and
// render HONEST EMPTY states ahead of the real DB pass. They define the accurate
// shape the read/write API will take, return well-typed EMPTY/zero data, and
// perform NO Supabase/DB work. Every body carries a `// TODO(db): ...` marker
// pointing at the table(s) the real implementation will read/write.
//
// IMPORTANT: never fabricate rows. Empty arrays + zero counts only. The UI's
// empty states are the intended render until the DB pass lands.
//
// SECURITY MODEL (to be enforced in the DB pass): every function here will run
// through withBaseballAction with a requiredCapability (can_manage_settings for
// the Decision Room read/writes; can_invite_staff for staff edits), resolving
// auth + active-team context server-side. The placeholders are auth-free by
// necessity (no DB) but the page.tsx entries already gate on auth.
// =============================================================================

import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

// =============================================================================
// DECISION ROOM — TYPES
// =============================================================================

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

// =============================================================================
// DECISION ROOM — READ (placeholder: honest-empty)
// =============================================================================

const EMPTY_ATTENDANCE_SUMMARY: DecisionRoomAttendanceSummary = {
  totalPractices: 0,
  totalAttended: 0,
  totalMissed: 0,
  concernedPlayers: [],
};

const EMPTY_LIFT_SUMMARY: DecisionRoomLiftSummary = {
  scheduledCount: 0,
  completedCount: 0,
  nonCompliantPlayers: [],
};

/**
 * Resolve the Staff Decision Room read model for the viewer's active team.
 *
 * PLACEHOLDER: returns a fully-typed EMPTY workspace so the surface renders its
 * honest empty states. No rows are fabricated.
 *
 * TODO(db): wire to baseball_meeting_items (agenda + status), baseball_signals
 * (open-signal agenda + import-quality issues), baseball_coach_insights
 * (insights), baseball_decision_ledger (ledger), baseball_action_outcomes
 * (did-it-move), baseball_games (recent results), baseball_player_availability
 * (availability), baseball_practice_attendance + baseball_lift_sessions
 * (attendance/lift summaries), baseball_tasks (open tasks), and the class/travel
 * conflict engine (conflicts). Gate via withBaseballAction(requiredCapability:
 * 'can_manage_settings').
 */
export async function getDecisionRoomData(): Promise<DecisionRoomData> {
  return {
    agenda: [],
    insights: [],
    ledger: [],
    playersToDiscuss: [],
    importIssues: [],
    effectivenessReviews: [],
    actionOutcomes: [],
    recentGameResults: [],
    availabilityConcerns: [],
    attendanceSummary: EMPTY_ATTENDANCE_SUMMARY,
    liftSummary: EMPTY_LIFT_SUMMARY,
    openTasks: [],
    conflicts: [],
    staffCount: 0,
    decisionCount: 0,
    openAgendaCount: 0,
    openInsightCount: 0,
    outcomeMovedCount: 0,
  };
}

// =============================================================================
// DECISION ROOM — WRITES (placeholder: no-op, honest failure)
//
// Each returns a typed mutation result. Until the DB pass wires the real writes,
// they report `success: false` with a clear message so the UI never claims a
// decision was persisted when nothing was written.
// =============================================================================

const NOT_WIRED = 'Decision Room persistence is not enabled yet.';

/**
 * Record a free-text decision note threaded to a subject (signal or meeting item).
 *
 * TODO(db): insert into baseball_decision_ledger (kind:'note') linked to
 * subjectTable/subjectId + optional sourceSignalId/playerId; gate on
 * can_manage_settings.
 */
export async function recordDecisionNote(_args: {
  title: string;
  note: string;
  subjectTable: string;
  subjectId: string;
  sourceSignalId: string | null;
  playerId: string | null;
}): Promise<DecisionRoomMutationResult> {
  return { success: false, error: NOT_WIRED };
}

/**
 * Mark a meeting agenda item as discussed.
 *
 * TODO(db): update baseball_meeting_items.status -> 'discussed' for itemId and
 * append a 'discussed' ledger entry; gate on can_manage_settings.
 */
export async function markMeetingItemDiscussed(
  _itemId: string,
): Promise<DecisionRoomMutationResult> {
  return { success: false, error: NOT_WIRED };
}

/**
 * Reopen a previously-discussed/resolved meeting item.
 *
 * TODO(db): update baseball_meeting_items.status -> 'open' for itemId and append
 * a 'reopened' ledger entry; gate on can_manage_settings.
 */
export async function reopenMeetingItem(
  _itemId: string,
): Promise<DecisionRoomMutationResult> {
  return { success: false, error: NOT_WIRED };
}

/**
 * Resolve a meeting item with a resolution note.
 *
 * TODO(db): update baseball_meeting_items (status:'resolved', resolution) and
 * append a 'resolved' ledger entry threaded to its evidence; gate on
 * can_manage_settings.
 */
export async function resolveMeetingItem(_args: {
  itemId: string;
  resolution: string;
}): Promise<DecisionRoomMutationResult> {
  return { success: false, error: NOT_WIRED };
}

/**
 * Create a new staff-authored agenda item.
 *
 * TODO(db): insert into baseball_meeting_items (title, detail, status:'open')
 * for the active team; gate on can_manage_settings.
 */
export async function createMeetingItem(_args: {
  title: string;
  detail: string | null;
}): Promise<DecisionRoomMutationResult> {
  return { success: false, error: NOT_WIRED };
}

// =============================================================================
// STAFF SETTINGS — TYPES
// =============================================================================

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
}

/** The full Staff Settings read model rendered by StaffSettingsClient. */
export interface StaffSettingsData {
  staff: StaffMemberView[];
  invitations: StaffInvitationView[];
  /** Whether the VIEWER may edit/invite/remove (is_head_coach || can_invite_staff). */
  canManageStaff: boolean;
}

// =============================================================================
// STAFF SETTINGS — READ (placeholder: honest-empty)
// =============================================================================

/**
 * Resolve the Staff Settings read model for the viewer's active team.
 *
 * PLACEHOLDER: returns an EMPTY roster + no invitations and canManageStaff:false
 * so the surface renders its honest empty state without claiming any staff exist.
 *
 * TODO(db): wire to baseball_team_coach_staff (roster + per-member capabilities +
 * primary/head flags), baseball_staff_invitations (pending/used invites), and
 * resolve the viewer's own can_invite_staff/is_head_coach to set canManageStaff.
 * Gate via withBaseballAction(requiredCapability:'can_invite_staff') for the
 * editable surface (read is allowed for any staffer).
 */
export async function getStaffSettingsData(): Promise<StaffSettingsData> {
  return {
    staff: [],
    invitations: [],
    canManageStaff: false,
  };
}
