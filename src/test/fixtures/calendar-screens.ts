/**
 * Deterministic synthetic fixtures for the calendar-premium screen build
 * (docs/plans/calendar-premium/SCREEN-BUILD-PLAN.md §2.4, §2.5, §2.6, §2.8).
 *
 * Purpose: let S4 (class detail), S5 (attendance), S6 (files), and S8
 * (conflict inbox) get built and tested against realistic, honest server
 * shapes BEFORE their live actions are wired into the calendar — per the
 * plan's Wave A note that "W-People (S3, S4 UI on fixtures)" starts here and
 * moves to the live `getClassOccurrenceDetail` action once Gate A2 passes.
 *
 * NEVER imported by runtime code — test/dev fixtures only. Every fixture
 * type is imported from its real action module (type-only for the two
 * modules owned in this same pass) so `tsc --noEmit` fails loudly the
 * moment a fixture drifts from the contract it is standing in for — no
 * separate hand-maintained shape to fall out of sync.
 *
 * Honesty rules enforced by construction, matching §2 of the plan:
 *  - No fixture ever puts a `title`/`className`/`instructor` alongside
 *    `access: 'free_busy'` or `access: 'none'`.
 *  - No fixture reports `verification: 'complete'` next to a `partial`
 *    source result, or a `state: 'scheduled'` occurrence status next to a
 *    failed exclusion read.
 *  - Every id below is a fixed, fake UUID — nothing random, nothing
 *    `Date.now()`-derived — so a snapshot test of a component built against
 *    these fixtures is stable across runs.
 */

import type {
  ClassOccurrenceDetailResult,
  ClassOccurrenceDetail,
} from '@/app/golf/actions/class-detail';
import type {
  ConflictInboxResult,
  ConflictInboxSnapshot,
  ConflictGroup,
} from '@/app/golf/actions/conflict-inbox';
import type { AttendanceReport, AttendanceRecord } from '@/app/golf/actions/attendance';
import type { EventDocumentRow } from '@/app/golf/actions/event-documents';

// ============================================================================
// Shared fake ids — fixed, never random
// ============================================================================

export const FIXTURE_TEAM_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
export const FIXTURE_EVENT_PRACTICE_ID = 'aaaaaaaa-0000-4000-8000-000000000010';
export const FIXTURE_EVENT_CLASS_ID = 'aaaaaaaa-0000-4000-8000-000000000011';
export const FIXTURE_CLASS_ID = 'aaaaaaaa-0000-4000-8000-000000000020';
export const FIXTURE_PLAYER_OWNER_ID = 'aaaaaaaa-0000-4000-8000-000000000030';
export const FIXTURE_PLAYER_TEAMMATE_ID = 'aaaaaaaa-0000-4000-8000-000000000031';
export const FIXTURE_PLAYER_THIRD_ID = 'aaaaaaaa-0000-4000-8000-000000000032';
export const FIXTURE_DATE = '2026-09-08';

// ============================================================================
// §2.4 — Class occurrence detail. One entry per state the screen must render
// (SCREEN-BUILD-PLAN §2.4 "States"): detail (scheduled), detail (excluded),
// detail (unsynced), free/busy, not found, and a failed read. "Loading" and
// "offline" are client-side compositions over one of these, not separate
// server shapes.
// ============================================================================

const detailBase: ClassOccurrenceDetail = {
  classId: FIXTURE_CLASS_ID,
  eventId: FIXTURE_EVENT_CLASS_ID,
  date: FIXTURE_DATE,
  start: `${FIXTURE_DATE}T14:00:00.000Z`,
  end: `${FIXTURE_DATE}T14:50:00.000Z`,
  synced: true,
  className: 'CS 201 - Introduction to Computer Science',
  instructor: 'Dr. Priya Lee',
  days: ['Mon', 'Wed', 'Fri'],
  startTime: '10:00:00',
  endTime: '10:50:00',
  building: 'Wells Hall',
  room: '101',
  semester: 'Fall 2026',
  notes: null,
  status: { state: 'scheduled', reason: null, startDate: null, endDate: null },
};

export const classDetailFixtures: Record<string, ClassOccurrenceDetailResult> = {
  /** The owner, or their active coach: full identity, this meeting scheduled. */
  scheduled: { success: true, access: 'detail', data: detailBase },

  /** Detail access, but an academic exclusion covers this specific date. */
  excluded: {
    success: true,
    access: 'detail',
    data: {
      ...detailBase,
      status: { state: 'excluded', reason: 'Midterm exam — no class today', startDate: FIXTURE_DATE, endDate: FIXTURE_DATE },
    },
  },

  /** Detail access, but the exclusion table could not be read — 'unknown',
   * never 'scheduled': a failed read is not evidence of no exclusion. */
  exclusionUnknown: {
    success: true,
    access: 'detail',
    data: { ...detailBase, status: { state: 'unknown', reason: null, startDate: null, endDate: null } },
  },

  /** Owner/coach detail for an occurrence that was never synced to the team
   * calendar: no eventId, no start/end for this specific meeting. */
  unsynced: {
    success: true,
    access: 'detail',
    data: {
      ...detailBase,
      eventId: null,
      start: null,
      end: null,
      synced: false,
    },
  },

  /** A teammate (or anyone else who can read the team calendar row but is
   * neither the owner nor an active coach): time only, nothing else. */
  freeBusy: {
    success: true,
    access: 'free_busy',
    data: {
      eventId: FIXTURE_EVENT_CLASS_ID,
      date: FIXTURE_DATE,
      start: `${FIXTURE_DATE}T14:00:00.000Z`,
      end: `${FIXTURE_DATE}T14:50:00.000Z`,
    },
  },

  /** The event/class could not be resolved for this viewer at all — either
   * it does not exist, or RLS hides it entirely (a viewer on another team). */
  notFound: { success: true, access: 'none' },

  /** A read failed outright. Distinct from `notFound`: the UI shows Retry,
   * never "This class is no longer in Helm". */
  failedRead: { success: false, error: 'This class could not be checked right now. Please retry.' },
};

// ============================================================================
// §2.8 — Conflict inbox. One entry per SCREEN-BUILD-PLAN §2.8 "States":
// none, unverified-only, partial, and failed. "Loading" and "offline" are
// client-side compositions over one of these.
// ============================================================================

const conflictGroupClean: ConflictGroup = {
  event: { id: FIXTURE_EVENT_PRACTICE_ID, title: 'Team Practice', start: `${FIXTURE_DATE}T14:00:00.000Z`, end: `${FIXTURE_DATE}T16:00:00.000Z`, type: 'practice' },
  overlaps: [
    {
      playerId: FIXTURE_PLAYER_OWNER_ID,
      name: 'Braeden Grant',
      avatarUrl: null,
      // The overlap is a class the coach (this fixture's imagined viewer)
      // has detail access to: title present, no `access` override.
      conflictingEvent: { id: FIXTURE_EVENT_CLASS_ID, title: 'CS 201 - Introduction to Computer Science', start: `${FIXTURE_DATE}T14:30:00.000Z`, end: `${FIXTURE_DATE}T15:20:00.000Z`, type: 'class' },
    },
  ],
  unverifiedAttendeeIds: [],
  verification: 'complete',
};

const conflictGroupRedactedClass: ConflictGroup = {
  event: { id: FIXTURE_EVENT_PRACTICE_ID, title: 'Team Practice', start: `${FIXTURE_DATE}T14:00:00.000Z`, end: `${FIXTURE_DATE}T16:00:00.000Z`, type: 'practice' },
  overlaps: [
    {
      playerId: FIXTURE_PLAYER_THIRD_ID,
      name: 'Sam Rivera',
      avatarUrl: null,
      // The overlap is a class the viewer does NOT have detail access to
      // (e.g. the owner is no longer an active roster member): no `title`,
      // never the "Busy" fallback `checkEventConflicts` would fabricate.
      conflictingEvent: { start: `${FIXTURE_DATE}T15:00:00.000Z`, end: `${FIXTURE_DATE}T15:50:00.000Z`, type: 'class', access: 'free_busy' },
    },
  ],
  unverifiedAttendeeIds: [],
  verification: 'complete',
};

const conflictGroupPartial: ConflictGroup = {
  event: { id: 'aaaaaaaa-0000-4000-8000-000000000012', title: 'Team Meeting', start: `2026-09-09T10:00:00.000Z`, end: `2026-09-09T11:00:00.000Z`, type: 'meeting' },
  overlaps: [],
  // A read failed for this attendee — hatched in the UI, never counted as
  // clear.
  unverifiedAttendeeIds: [FIXTURE_PLAYER_TEAMMATE_ID],
  verification: 'partial',
};

function snapshot(groups: ConflictGroup[]): ConflictInboxSnapshot {
  return {
    teamId: FIXTURE_TEAM_ID,
    window: { start: `${FIXTURE_DATE}T00:00:00.000Z`, end: '2026-09-22T00:00:00.000Z' },
    checkedAt: '2026-09-08T12:00:00.000Z',
    groups,
  };
}

export const conflictInboxFixtures: Record<string, ConflictInboxResult> = {
  /** Two real overlaps: one class title visible (coach detail access), one
   * withheld (redacted class access) — proves both honesty paths render. */
  withOverlaps: { success: true, data: snapshot([conflictGroupClean, conflictGroupRedactedClass]) },

  /** Nothing to resolve, and nothing unverified either. */
  none: { success: true, data: snapshot([]) },

  /** No confirmed overlap, but an attendee's schedule could not be checked —
   * the "Unverified" filter's only content, never folded into "none". */
  unverifiedOnly: { success: true, data: snapshot([conflictGroupPartial]) },

  /** A mix: one clean conflict, one partially-verified group. */
  partial: { success: true, data: snapshot([conflictGroupClean, conflictGroupPartial]) },

  /** The whole read failed — stale list, Retry, never a silent "none". */
  failed: { success: false, error: 'Conflicts could not be loaded. Your selection has been kept.' },
};

// ============================================================================
// §2.5 — Attendance report. Covers SCREEN-BUILD-PLAN §2.5 "States": a full
// coach view spanning every RSVP group (Accepted / Tentative / Declined / No
// response) and every mark (present / late / no-show / unmarked), an empty
// roster, and the player-scoped view with teammates' notes stripped
// (attendance.ts finding #30).
// ============================================================================

function attendanceRow(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 'fixture-att-0',
    event_id: FIXTURE_EVENT_PRACTICE_ID,
    player_id: FIXTURE_PLAYER_OWNER_ID,
    status: 'pending',
    rsvp_at: null,
    attendance_status: null,
    checked_in: false,
    checked_in_at: null,
    notes: null,
    player: { first_name: 'Player', last_name: 'One', jersey_number: null },
    ...overrides,
  };
}

const fullRosterRows: AttendanceRecord[] = [
  attendanceRow({
    id: 'fixture-att-1', player_id: FIXTURE_PLAYER_OWNER_ID,
    status: 'accepted', rsvp_at: '2026-09-01T00:00:00.000Z',
    attendance_status: 'present', checked_in: true, checked_in_at: `${FIXTURE_DATE}T13:55:00.000Z`,
    notes: 'Arrived on time', player: { first_name: 'Braeden', last_name: 'Grant', jersey_number: 7 },
  }),
  attendanceRow({
    id: 'fixture-att-2', player_id: FIXTURE_PLAYER_TEAMMATE_ID,
    status: 'accepted', rsvp_at: '2026-09-01T00:00:00.000Z',
    attendance_status: 'late', checked_in: true, checked_in_at: `${FIXTURE_DATE}T14:10:00.000Z`,
    notes: 'Traffic — 10 minutes late', player: { first_name: 'Sam', last_name: 'Rivera', jersey_number: 12 },
  }),
  attendanceRow({
    id: 'fixture-att-3', player_id: FIXTURE_PLAYER_THIRD_ID,
    status: 'tentative', rsvp_at: '2026-09-02T00:00:00.000Z',
    attendance_status: null, checked_in: false, checked_in_at: null,
    notes: null, player: { first_name: 'Ava', last_name: 'Smith', jersey_number: 4 },
  }),
  attendanceRow({
    id: 'fixture-att-4', player_id: 'aaaaaaaa-0000-4000-8000-000000000033',
    status: 'declined', rsvp_at: '2026-09-02T12:00:00.000Z',
    attendance_status: null, checked_in: false, checked_in_at: null,
    notes: null, player: { first_name: 'Jordan', last_name: 'Lee', jersey_number: 21 },
  }),
  attendanceRow({
    id: 'fixture-att-5', player_id: 'aaaaaaaa-0000-4000-8000-000000000034',
    status: 'pending', rsvp_at: null,
    attendance_status: 'no_show', checked_in: false, checked_in_at: `${FIXTURE_DATE}T16:30:00.000Z`,
    notes: null, player: { first_name: 'Casey', last_name: 'Nguyen', jersey_number: 9 },
  }),
];

export const attendanceReportFixtures: Record<string, AttendanceReport> = {
  /** Coach view: every RSVP bucket, every mark, and both players' notes
   * visible. */
  coachFullRoster: {
    attendance: fullRosterRows,
    eventStartTime: `${FIXTURE_DATE}T14:00:00.000Z`,
    viewerIsCoach: true,
    viewerPlayerId: null,
  },

  /** No one invited yet — the "Invite players from Edit event" empty state. */
  empty: {
    attendance: [],
    eventStartTime: `${FIXTURE_DATE}T14:00:00.000Z`,
    viewerIsCoach: true,
    viewerPlayerId: null,
  },

  /** Player view: the SAME roster, but every note besides the caller's own
   * (player-1) is stripped server-side — the fixture mirrors that instead
   * of leaving it for the UI to (incorrectly) redact client-side. */
  playerOwnRowOnly: {
    attendance: fullRosterRows.map((row) =>
      row.player_id === FIXTURE_PLAYER_OWNER_ID ? row : { ...row, notes: null }),
    eventStartTime: `${FIXTURE_DATE}T14:00:00.000Z`,
    viewerIsCoach: false,
    viewerPlayerId: FIXTURE_PLAYER_OWNER_ID,
  },
};

// ============================================================================
// §2.6 — Files on an event. Covers "loading→loaded", "empty", and the shape
// a failed attach/detach leaves the list in (unchanged — the row that failed
// to attach was never added).
// ============================================================================

export const eventDocumentFixtures: Record<string, EventDocumentRow[]> = {
  attached: [
    {
      document: {
        id: 'aaaaaaaa-0000-4000-8000-000000000040',
        title: 'Practice Plan — Week 3',
        description: 'Short-game focus, ball-striking drills',
        file_url: 'https://example.invalid/docs/practice-plan-week-3.pdf',
        file_type: 'application/pdf',
        file_size: 245_760,
        category: 'practice_plan',
      },
      attachedAt: '2026-09-05T09:00:00.000Z',
      note: 'Bring wedges',
    },
    {
      document: {
        id: 'aaaaaaaa-0000-4000-8000-000000000041',
        title: 'Roster.xlsx',
        description: null,
        file_url: 'https://example.invalid/docs/roster.xlsx',
        file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        file_size: 18_432,
        category: 'roster',
      },
      attachedAt: '2026-09-06T15:30:00.000Z',
      note: null,
    },
  ],
  empty: [],
};
