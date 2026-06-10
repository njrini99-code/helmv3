/**
 * Regression tests for src/lib/calendar/rsvp.ts — calendar audit 2026-06-10.
 *
 *  - #16: updateRSVP locks (post-start, post-deadline, cancelled) and the
 *    coachOverride escape hatch
 *  - #18: notifyEventUpdate idempotency key is CONTENT-BEARING — every
 *    reschedule yields exactly one fresh notification, repeat saves of the
 *    same time still dedupe, and nothing is delete-then-reinserted
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

let adminFake: FakeSupabase;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminFake),
}));

import {
  updateRSVP,
  notifyEventUpdate,
  RSVPLockedError,
  RSVPDeadlinePassedError,
} from '@/lib/calendar/rsvp';

type Row = Record<string, unknown>;

/** Known-key seed shape so indexed access is non-optional under strict TS. */
interface SeedTables extends Record<string, Row[]> {
  golf_events: Row[];
  golf_players: Row[];
  golf_event_attendance: Row[];
  golf_calendar_notifications: Row[];
}

const FUTURE = '2099-07-01T14:00:00+00:00';
const PAST = '2020-01-01T10:00:00+00:00';

function seed(eventOverrides: Row = {}): { tables: SeedTables; supabase: SupabaseClient } {
  const tables: SeedTables = {
    golf_events: [
      {
        id: 'event-1',
        team_id: 'team-1',
        title: 'Practice',
        event_type: 'practice',
        start_time: FUTURE,
        end_time: null,
        all_day: false,
        status: 'scheduled',
        rsvp_deadline: null,
        created_by: null,
        location: 'Range',
        ...eventOverrides,
      },
    ],
    golf_players: [
      { id: 'player-1', user_id: 'u-p1', first_name: 'Nick', last_name: 'Rini' },
    ],
    golf_event_attendance: [
      // player pre-embedded: the fake has no join support, and
      // notifyEventUpdate selects player:golf_players(user_id).
      { id: 'att-1', event_id: 'event-1', player_id: 'player-1', status: 'pending', player: { user_id: 'u-p1' } },
    ],
    golf_calendar_notifications: [],
  };
  const fake = createFakeSupabase({ user: { id: 'u-p1' }, tables });
  adminFake = createFakeSupabase({ user: null, tables });
  return { tables, supabase: fake as unknown as SupabaseClient };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// updateRSVP locks
// ===========================================================================

describe('updateRSVP locks', () => {
  it('writes the RSVP for a live future event', async () => {
    const { tables, supabase } = seed();

    await updateRSVP('event-1', 'player-1', 'accepted', supabase);

    expect(tables.golf_event_attendance[0]!.status).toBe('accepted');
  });

  it('throws event_started once the event start time has passed', async () => {
    const { tables, supabase } = seed({ start_time: PAST });

    await expect(updateRSVP('event-1', 'player-1', 'accepted', supabase))
      .rejects.toMatchObject({ name: 'RSVPLockedError', code: 'event_started' });
    expect(tables.golf_event_attendance[0]!.status).toBe('pending');
  });

  it('gives all-day events a 24h grace window from their UTC-midnight start', async () => {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const { tables, supabase } = seed({
      start_time: startOfToday.toISOString(),
      all_day: true,
    });

    // Today's all-day event is still RSVP-able...
    await updateRSVP('event-1', 'player-1', 'accepted', supabase);
    expect(tables.golf_event_attendance[0]!.status).toBe('accepted');

    // ...but yesterday's (or older) all-day event is locked.
    const { supabase: supabase2 } = seed({ start_time: PAST, all_day: true });
    await expect(updateRSVP('event-1', 'player-1', 'accepted', supabase2))
      .rejects.toBeInstanceOf(RSVPLockedError);
  });

  it('throws RSVPDeadlinePassedError after the rsvp_deadline', async () => {
    const { supabase } = seed({ rsvp_deadline: PAST });

    await expect(updateRSVP('event-1', 'player-1', 'accepted', supabase))
      .rejects.toBeInstanceOf(RSVPDeadlinePassedError);
  });

  it('throws event_cancelled for soft-cancelled events', async () => {
    const { supabase } = seed({ status: 'cancelled' });

    await expect(updateRSVP('event-1', 'player-1', 'accepted', supabase))
      .rejects.toMatchObject({ code: 'event_cancelled' });
  });

  it('coachOverride bypasses every lock', async () => {
    const { tables, supabase } = seed({ start_time: PAST, rsvp_deadline: PAST });

    await updateRSVP('event-1', 'player-1', 'declined', supabase, { coachOverride: true });

    expect(tables.golf_event_attendance[0]!.status).toBe('declined');
  });

  it('throws when the event does not exist instead of writing blind', async () => {
    const { supabase } = seed();

    await expect(updateRSVP('event-404', 'player-1', 'accepted', supabase))
      .rejects.toThrow('Event not found');
  });
});

// ===========================================================================
// notifyEventUpdate — content-bearing idempotency (audit #18)
// ===========================================================================

describe('notifyEventUpdate reschedule re-notification', () => {
  it('each reschedule yields exactly one fresh notification; repeats of the same time dedupe', async () => {
    const { tables, supabase } = seed();

    // First update notification.
    await notifyEventUpdate('event-1', supabase);
    expect(tables.golf_calendar_notifications).toHaveLength(1);

    // Saving again with UNCHANGED timing must not duplicate.
    await notifyEventUpdate('event-1', supabase);
    expect(tables.golf_calendar_notifications).toHaveLength(1);

    // Reschedule: the event's timing changes → a SECOND, fresh notification.
    tables.golf_events[0]!.start_time = '2099-07-02T16:00:00+00:00';
    await notifyEventUpdate('event-1', supabase);
    expect(tables.golf_calendar_notifications).toHaveLength(2);

    // A third reschedule notifies again (the old one-shot key never did).
    tables.golf_events[0]!.start_time = '2099-07-03T09:00:00+00:00';
    await notifyEventUpdate('event-1', supabase);
    expect(tables.golf_calendar_notifications).toHaveLength(3);

    // Every row carries a distinct content-bearing type; none were deleted.
    const types = tables.golf_calendar_notifications.map((n) => String(n.notification_type));
    expect(new Set(types).size).toBe(3);
    for (const t of types) {
      expect(t.startsWith('event_updated:')).toBe(true);
    }
  });

  it('notification rows target the attendee user ids', async () => {
    const { tables, supabase } = seed();

    await notifyEventUpdate('event-1', supabase, 'Moved to the back nine');

    expect(tables.golf_calendar_notifications).toHaveLength(1);
    const notif = tables.golf_calendar_notifications[0]!;
    expect(notif.user_id).toBe('u-p1');
    expect(notif.message).toBe('Moved to the back nine');
  });
});
