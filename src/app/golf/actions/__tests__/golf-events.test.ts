/**
 * Regression tests for the EVENT actions in golf.ts — calendar audit
 * 2026-06-10 (docs/audits/GOLFHELM_CALENDAR_AUDIT_2026-06-10.md).
 *
 * Covers:
 *  - #5/#15: createGolfEvent persists requires_rsvp / rsvp_deadline /
 *    max_attendees, deadline stored via the timezone-offset convention
 *  - #4: updateGolfEvent attendee semantics are ADDITIVE-ONLY; removals only
 *    via explicit removeAttendeeIds
 *  - #19: deleteGolfEvent soft-cancels by default (RSVPs intact, attendees
 *    notified); hard delete gated on cancelled-or-zero-attendance
 *  - #8: respondToEvent upserts for players WITHOUT a coach-seeded row
 *  - #16: RSVP locks after event start / rsvp_deadline, cancelled events
 *  - #17: end >= start validation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

// ---------------------------------------------------------------------------
// Mocks — the fake client is swapped per test via `fake` / `adminFake`
// ---------------------------------------------------------------------------

let fake: FakeSupabase;
let adminFake: FakeSupabase;
let afterCallbacks: Array<() => Promise<void> | void>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminFake),
}));

vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    afterCallbacks.push(cb);
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => {}),
}));

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-logger', () => ({
  logRoundSubmitted: vi.fn(async () => {}),
}));

vi.mock('@/lib/error-monitoring', () => ({
  logCritical: vi.fn(async () => {}),
  logError: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications', () => ({
  notifyQualifierCreated: vi.fn(async () => {}),
}));

const sendEmailNotification = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: (...args: unknown[]) => sendEmailNotification(...(args as [])),
}));

const sendBulkPushNotification = vi.fn(async () => {});
vi.mock('@/lib/notifications/push', () => ({
  sendBulkPushNotification: (...args: unknown[]) => sendBulkPushNotification(...(args as [])),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createGolfEvent,
  updateGolfEvent,
  deleteGolfEvent,
  deleteGolfEventPermanently,
  respondToEvent,
} from '../golf';

// ---------------------------------------------------------------------------
// Seed data
//
// team-1 (org-1): coach-1 (user u-coach); active players player-1 (u-p1) and
// player-2 (u-p2). team-2: player-3 (u-p3, active).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Known-key seed shape so indexed access is non-optional under strict TS. */
interface SeedTables extends Record<string, Row[]> {
  organizations: Row[];
  golf_teams: Row[];
  golf_coaches: Row[];
  golf_players: Row[];
  golf_team_members: Row[];
  users: Row[];
  golf_events: Row[];
  golf_event_attendance: Row[];
  golf_calendar_notifications: Row[];
}

const FUTURE_START = '2099-07-01T14:00:00+00:00';

function baseTables(): SeedTables {
  return {
    organizations: [{ id: 'org-1' }],
    golf_teams: [{ id: 'team-1', organization_id: 'org-1', created_at: '2025-01-01' }],
    golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
    golf_players: [
      { id: 'player-1', user_id: 'u-p1', first_name: 'Nick', last_name: 'Rini' },
      { id: 'player-2', user_id: 'u-p2', first_name: 'Ava', last_name: 'Smith' },
      { id: 'player-3', user_id: 'u-p3', first_name: 'Sam', last_name: 'Other' },
    ],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
      { id: 'm-2', team_id: 'team-1', player_id: 'player-2', status: 'active' },
      { id: 'm-3', team_id: 'team-2', player_id: 'player-3', status: 'active' },
    ],
    users: [
      { id: 'u-p1', email: 'p1@example.com' },
      { id: 'u-p2', email: 'p2@example.com' },
    ],
    golf_events: [],
    golf_event_attendance: [],
    golf_calendar_notifications: [],
  };
}

function seedAs(userId: string | null, tables: SeedTables) {
  fake = createFakeSupabase({ user: userId ? { id: userId } : null, tables });
  // The admin client shares the same table store so post-response fan-outs
  // are observable through the same seed.
  adminFake = createFakeSupabase({ user: null, tables });
  return tables;
}

/** A seeded future event on team-1 with two attendance rows. */
function withEvent(tables: SeedTables, eventOverrides: Row = {}): SeedTables {
  tables.golf_events.push({
    id: 'event-1',
    team_id: 'team-1',
    title: 'Practice',
    event_type: 'practice',
    start_time: FUTURE_START,
    end_time: null,
    all_day: false,
    status: 'scheduled',
    location: 'Range',
    requires_rsvp: true,
    rsvp_deadline: null,
    created_by: 'coach-1',
    ...eventOverrides,
  });
  tables.golf_event_attendance.push(
    // `player` is pre-embedded so the fake (which has no join support)
    // satisfies the `player:golf_players(user_id)` select in fan-outs.
    { id: 'att-1', event_id: 'event-1', player_id: 'player-1', status: 'accepted', player: { user_id: 'u-p1' } },
    { id: 'att-2', event_id: 'event-1', player_id: 'player-2', status: 'pending', player: { user_id: 'u-p2' } },
  );
  return tables;
}

async function runAfterCallbacks() {
  for (const cb of afterCallbacks) {
    await cb();
  }
  afterCallbacks = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks = [];
});

// ===========================================================================
// createGolfEvent — RSVP config persisted (audit #5, #15)
// ===========================================================================

describe('createGolfEvent RSVP config', () => {
  it('persists requires_rsvp / rsvp_deadline / max_attendees, deadline in the coach timezone', async () => {
    const tables = seedAs('u-coach', baseTables());

    const result = await createGolfEvent({
      title: 'Qualifier Round 1',
      eventType: 'qualifier',
      startDate: '2099-07-01',
      startTime: '14:00',
      endTime: '16:00',
      allDay: false,
      requiresRsvp: true,
      rsvpDeadline: '2099-06-30T18:00',
      maxAttendees: 12,
      timezoneOffset: 240, // ET (UTC-4)
    });

    expect(result.success).toBe(true);
    const event = tables.golf_events[0]!;
    expect(event.requires_rsvp).toBe(true);
    expect(event.max_attendees).toBe(12);
    // Same timezone-offset convention as start_time — NOT UTC wall-time.
    expect(event.rsvp_deadline).toBe('2099-06-30T18:00-04:00');
    expect(event.start_time).toBe('2099-07-01T14:00-04:00');
    expect(event.end_time).toBe('2099-07-01T16:00-04:00');
  });

  it('defaults requires_rsvp to false and deadline to null when omitted', async () => {
    const tables = seedAs('u-coach', baseTables());

    const result = await createGolfEvent({
      title: 'Team Meeting',
      eventType: 'meeting',
      startDate: '2099-07-01',
    });

    expect(result.success).toBe(true);
    const event = tables.golf_events[0]!;
    expect(event.requires_rsvp).toBe(false);
    expect(event.rsvp_deadline).toBeNull();
    expect(event.max_attendees).toBeNull();
  });

  it('rejects a timed event whose end precedes its start (audit #17)', async () => {
    seedAs('u-coach', baseTables());

    const result = await createGolfEvent({
      title: 'Inverted',
      eventType: 'practice',
      startDate: '2099-07-01',
      startTime: '14:00',
      endTime: '12:00',
      allDay: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('End time must be after the start time');
    }
  });

  it('rejects an all-day event whose end date precedes its start date', async () => {
    seedAs('u-coach', baseTables());

    const result = await createGolfEvent({
      title: 'Inverted trip',
      eventType: 'travel',
      startDate: '2099-07-05',
      endDate: '2099-07-03',
      allDay: true,
    });

    expect(result.success).toBe(false);
  });

  it('returns immediately and runs the notification fan-out via after()', async () => {
    const tables = seedAs('u-coach', baseTables());

    const result = await createGolfEvent({
      title: 'Practice',
      eventType: 'practice',
      startDate: '2099-07-01',
    });

    expect(result.success).toBe(true);
    // Nothing sent inline — the save returned before any channel ran.
    expect(sendEmailNotification).not.toHaveBeenCalled();
    expect(tables.golf_calendar_notifications).toHaveLength(0);
    expect(afterCallbacks.length).toBeGreaterThan(0);

    await runAfterCallbacks();

    // Both team-1 players notified in-app + via email after the response.
    expect(tables.golf_calendar_notifications).toHaveLength(2);
    expect(sendEmailNotification).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// updateGolfEvent — ADDITIVE attendee semantics (audit #4)
// ===========================================================================

const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
const P3 = '00000000-0000-4000-8000-000000000003';

/** Variant seed with UUID player ids (attendeeIds is zod-uuid-validated). */
function withUuidPlayers(tables: SeedTables): SeedTables {
  tables.golf_players = [
    { id: P1, user_id: 'u-p1', first_name: 'Nick', last_name: 'Rini' },
    { id: P2, user_id: 'u-p2', first_name: 'Ava', last_name: 'Smith' },
    { id: P3, user_id: 'u-p3', first_name: 'Sam', last_name: 'Third' },
  ];
  tables.golf_team_members = [
    { id: 'm-1', team_id: 'team-1', player_id: P1, status: 'active' },
    { id: 'm-2', team_id: 'team-1', player_id: P2, status: 'active' },
    { id: 'm-3', team_id: 'team-1', player_id: P3, status: 'active' },
  ];
  tables.golf_event_attendance = [
    { id: 'att-1', event_id: 'event-1', player_id: P1, status: 'accepted', player: { user_id: 'u-p1' } },
    { id: 'att-2', event_id: 'event-1', player_id: P2, status: 'pending', player: { user_id: 'u-p2' } },
  ];
  return tables;
}

describe('updateGolfEvent attendee semantics', () => {
  it('legacy attendeeIds is additive-only: missing players are inserted, absent players are NEVER deleted', async () => {
    const tables = seedAs('u-coach', withUuidPlayers(withEvent(baseTables())));

    // The historical wipe: an edit form sending ONLY the newly-picked player.
    const result = await updateGolfEvent('event-1', { attendeeIds: [P3] });

    expect(result.success).toBe(true);
    const playerIds = tables.golf_event_attendance.map((r) => r.player_id);
    // P3 was inserted...
    expect(playerIds).toContain(P3);
    // ...and the players absent from the list were NOT deleted.
    expect(playerIds).toContain(P1);
    expect(playerIds).toContain(P2);
    expect(tables.golf_event_attendance).toHaveLength(3);
    // RSVP state preserved exactly; the new invite is pending.
    expect(tables.golf_event_attendance.find((r) => r.player_id === P1)!.status).toBe('accepted');
    expect(tables.golf_event_attendance.find((r) => r.player_id === P3)!.status).toBe('pending');
  });

  it('addAttendeeIds behaves identically to legacy attendeeIds (additive)', async () => {
    const tables = seedAs('u-coach', withUuidPlayers(withEvent(baseTables())));

    const result = await updateGolfEvent('event-1', { addAttendeeIds: [P3] });

    expect(result.success).toBe(true);
    expect(tables.golf_event_attendance).toHaveLength(3);
  });

  it('attendeeIds: [] (the old wipe trigger) deletes nothing', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables()));

    const result = await updateGolfEvent('event-1', { title: 'Renamed', attendeeIds: [] });

    expect(result.success).toBe(true);
    expect(tables.golf_event_attendance).toHaveLength(2);
    expect(tables.golf_events[0]!.title).toBe('Renamed');
  });

  it('removeAttendeeIds removes exactly the listed players and nothing else', async () => {
    const tables = seedAs('u-coach', withUuidPlayers(withEvent(baseTables())));

    const result = await updateGolfEvent('event-1', { removeAttendeeIds: [P2] });

    expect(result.success).toBe(true);
    expect(tables.golf_event_attendance).toHaveLength(1);
    expect(tables.golf_event_attendance[0]!.player_id).toBe(P1);
  });

  it('rejects non-coach callers', async () => {
    seedAs('u-p1', withEvent(baseTables()));
    const result = await updateGolfEvent('event-1', { title: 'Hijack' });
    expect(result.success).toBe(false);
  });
});

// ===========================================================================
// deleteGolfEvent — soft-cancel lifecycle (audit #19)
// ===========================================================================

describe('deleteGolfEvent soft-cancel', () => {
  it('default delete soft-cancels: row kept, status=cancelled, RSVPs intact', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables()));

    const result = await deleteGolfEvent('event-1');

    expect(result.success).toBe(true);
    expect(tables.golf_events).toHaveLength(1);
    const event = tables.golf_events[0]!;
    expect(event.status).toBe('cancelled');
    expect(event.cancelled_at).toBeTruthy();
    // RSVP rows preserved.
    expect(tables.golf_event_attendance).toHaveLength(2);
  });

  it('notifies every attendee (in-app + email) after the response', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables()));

    const result = await deleteGolfEvent('event-1', { reason: 'Rain' });
    expect(result.success).toBe(true);
    expect(tables.golf_calendar_notifications).toHaveLength(0);

    await runAfterCallbacks();

    expect(tables.golf_calendar_notifications).toHaveLength(2);
    const notif = tables.golf_calendar_notifications[0]!;
    expect(notif.notification_type).toBe('event_cancelled');
    expect(String(notif.message)).toContain('Rain');
    expect(sendEmailNotification).toHaveBeenCalledTimes(2);
  });

  it('is idempotent: cancelling an already-cancelled event does not re-notify', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables(), { status: 'cancelled' }));

    const result = await deleteGolfEvent('event-1');

    expect(result.success).toBe(true);
    expect(afterCallbacks).toHaveLength(0);
    expect(tables.golf_event_attendance).toHaveLength(2);
  });

  it('hard delete is REJECTED while the event is live and has attendance rows', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables()));

    const result = await deleteGolfEvent('event-1', { hard: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Cancel it first');
    }
    expect(tables.golf_events).toHaveLength(1);
    expect(tables.golf_event_attendance).toHaveLength(2);
  });

  it('hard delete succeeds once the event is cancelled', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables(), { status: 'cancelled' }));

    const result = await deleteGolfEventPermanently('event-1');

    expect(result.success).toBe(true);
    expect(tables.golf_events).toHaveLength(0);
  });

  it('hard delete succeeds for a live event with ZERO attendance rows', async () => {
    const tables = seedAs('u-coach', withEvent(baseTables()));
    tables.golf_event_attendance.length = 0;

    const result = await deleteGolfEvent('event-1', { hard: true });

    expect(result.success).toBe(true);
    expect(tables.golf_events).toHaveLength(0);
  });
});

// ===========================================================================
// respondToEvent — self-RSVP upsert + locks (audit #8, #16)
// ===========================================================================

describe('respondToEvent', () => {
  it('lets an UNSEEDED active team member RSVP (upsert inserts their row)', async () => {
    const tables = seedAs('u-p1', withEvent(baseTables()));
    // No pre-seeded row for player-1 — the coach never picked them.
    tables.golf_event_attendance.length = 0;

    const result = await respondToEvent('event-1', 'accepted');

    expect(result.success).toBe(true);
    expect(tables.golf_event_attendance).toHaveLength(1);
    const row = tables.golf_event_attendance[0]!;
    expect(row.player_id).toBe('player-1');
    expect(row.status).toBe('accepted');
    expect(row.rsvp_at).toBeTruthy();
  });

  it('updates an existing row in place (no duplicate)', async () => {
    const tables = seedAs('u-p2', withEvent(baseTables()));

    const result = await respondToEvent('event-1', 'declined');

    expect(result.success).toBe(true);
    expect(tables.golf_event_attendance).toHaveLength(2);
    expect(tables.golf_event_attendance.find((r) => r.player_id === 'player-2')!.status).toBe('declined');
  });

  it('rejects RSVP changes after the event has started (code event_started)', async () => {
    const tables = seedAs('u-p1', withEvent(baseTables(), { start_time: '2020-01-01T10:00:00+00:00' }));

    const result = await respondToEvent('event-1', 'accepted');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('event_started');
    }
    // The previously-accepted row was not flipped.
    expect(tables.golf_event_attendance.find((r) => r.player_id === 'player-1')!.status).toBe('accepted');
  });

  it('rejects RSVPs after the deadline (code rsvp_deadline_passed)', async () => {
    seedAs('u-p1', withEvent(baseTables(), { rsvp_deadline: '2020-01-01T10:00:00+00:00' }));

    const result = await respondToEvent('event-1', 'declined');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('rsvp_deadline_passed');
    }
  });

  it('rejects RSVPs on cancelled events (code event_cancelled)', async () => {
    seedAs('u-p1', withEvent(baseTables(), { status: 'cancelled' }));

    const result = await respondToEvent('event-1', 'accepted');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('event_cancelled');
    }
  });

  it("rejects players who are not active members of the event's team (code not_team_member)", async () => {
    seedAs('u-p3', withEvent(baseTables()));

    const result = await respondToEvent('event-1', 'accepted');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('not_team_member');
    }
  });

  it('rejects unknown events', async () => {
    seedAs('u-p1', withEvent(baseTables()));
    const result = await respondToEvent('event-404', 'accepted');
    expect(result.success).toBe(false);
  });
});
