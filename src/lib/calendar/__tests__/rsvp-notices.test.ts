/**
 * P-5: writeEventInvitationNotices writes only the Bell rows of an invitation (golf_calendar_notifications) and never
 * touches attendance, so a tournament made from a calendar event keeps R1's replies (sendEventInvitations upserts
 * attendance back to pending). sendEventInvitations writes its rows through it, unchanged: an existing row stays as it
 * is. With `refresh` the row is replaced with the new copy and marked unread.
 *
 * F-0001 (audit 2026-10-29): the Bell text is written on the server, which runs in UTC, so it must say the time in the
 * team's zone. The process zone is pinned to UTC here so the test fails the way production did.
 */
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const admin = vi.hoisted(() => ({ calls: [] as Array<{ table: string; rows: unknown; options: unknown }> }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: async (rows: unknown, options: unknown) => {
        admin.calls.push({ table, rows, options });
        return { error: null };
      },
    }),
  }),
}));

import { notifyEventSeriesUpdate, notifyEventUpdate, sendEventInvitations, writeEventInvitationNotices } from '../rsvp';

beforeEach(() => {
  admin.calls = [];
});

describe('writeEventInvitationNotices', () => {
  it('writes one event_invitation row per person and nothing else', async () => {
    await writeEventInvitationNotices({ eventId: 'e1', userIds: ['u1', 'u2'], title: "You're invited: Pinehurst Invitational", message: 'Thu 5 to Sat 7 Nov at Pinehurst No. 2. Reply for each round.' });
    expect(admin.calls).toHaveLength(1);
    expect(admin.calls[0]!.table).toBe('golf_calendar_notifications');
    expect(admin.calls[0]!.options).toEqual({ onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });
    expect(admin.calls[0]!.rows).toEqual([
      expect.objectContaining({ user_id: 'u1', event_id: 'e1', notification_type: 'event_invitation', action_url: '/golf/dashboard/calendar?event=e1' }),
      expect.objectContaining({ user_id: 'u2' }),
    ]);
    expect((admin.calls[0]!.rows as Array<Record<string, unknown>>)[0]).not.toHaveProperty('read_at');
  });

  it('refresh replaces the row and marks it unread', async () => {
    await writeEventInvitationNotices({ eventId: 'e1', userIds: ['u1'], title: 't', message: 'm', refresh: true });
    expect(admin.calls[0]!.options).toEqual({ onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: false });
    expect((admin.calls[0]!.rows as Array<Record<string, unknown>>)[0]).toMatchObject({ read_at: null });
  });

  it('writes nothing for no one', async () => {
    await writeEventInvitationNotices({ eventId: 'e1', userIds: [], title: 't', message: 'm' });
    expect(admin.calls).toHaveLength(0);
  });
});

type FakeEvent = Record<string, unknown>;

/**
 * A client for the RSVP writers: `golf_events` answers `.single()` (and a list for the series read), the roster and
 * players answer as a list, `golf_team_settings` holds the team's zone, and attendance writes are recorded.
 */
function fakeClient(event: FakeEvent | FakeEvent[], zone: string | null = 'America/New_York') {
  const writes: Array<{ table: string; rows: unknown }> = [];
  const events = Array.isArray(event) ? event : [event];
  const listFor = (table: string): unknown[] => {
    switch (table) {
      case 'golf_events':
        return events;
      case 'golf_team_members':
        return [{ player_id: 'p1' }];
      case 'golf_event_attendance':
        return [{ player: { user_id: 'u1' } }];
      case 'golf_team_settings':
        return zone ? [{ team_id: 't1', timezone: zone }] : [];
      default:
        return [{ id: 'p1', user_id: 'u1', first_name: 'Mara', last_name: 'Lindqvist' }];
    }
  };
  const supabase = {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        single: async () => ({ data: events[0], error: null }),
        maybeSingle: async () => ({ data: listFor(table)[0] ?? null, error: null }),
        upsert: (rows: unknown) => {
          writes.push({ table, rows });
          return { select: async () => ({ data: [{ id: 'a1' }], error: null }) };
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: listFor(table), error: null }).then(resolve),
      });
      return q;
    },
  } as unknown as SupabaseClient;
  return { supabase, writes };
}

const messageOf = (i = 0) => String((admin.calls[i]!.rows as Array<Record<string, unknown>>)[0]!.message);

describe('sendEventInvitations still writes its Bell rows the same way', () => {
  function client(requiresRsvp: boolean) {
    return fakeClient({ id: 'e1', team_id: 't1', title: 'Short game', start_time: '2099-07-01T14:00:00+00:00', location: 'Range', requires_rsvp: requiresRsvp });
  }

  it('with RSVP on: the attendance row, then one Bell row that keeps an existing one', async () => {
    const { supabase, writes } = client(true);
    await sendEventInvitations('e1', ['p1'], supabase);
    expect(writes.map((w) => w.table)).toEqual(['golf_event_attendance']);
    expect(admin.calls).toHaveLength(1);
    expect(admin.calls[0]!.options).toEqual({ onConflict: 'event_id,user_id,notification_type', ignoreDuplicates: true });
    expect((admin.calls[0]!.rows as Array<Record<string, unknown>>)[0]).toMatchObject({ user_id: 'u1', title: "You're invited: Short game" });
  });

  it('with RSVP off: the attendance row only, no Bell row', async () => {
    const { supabase, writes } = client(false);
    await sendEventInvitations('e1', ['p1'], supabase);
    expect(writes.map((w) => w.table)).toEqual(['golf_event_attendance']);
    expect(admin.calls).toHaveLength(0);
  });
});

describe("F-0001: the Bell says the time in the team's zone, whatever zone the server runs in", () => {
  const timed = { id: 'e1', team_id: 't1', title: 'Qualifier', start_time: '2026-10-31T14:00:00Z', end_time: null, all_day: false, location: null, requires_rsvp: true };
  const allDay = { ...timed, start_time: '2026-10-31T00:00:00+00:00', all_day: true };

  it('runs in UTC, so the old zone-less text would say 2:00 PM', () => {
    expect(new Date('2026-10-31T14:00:00Z').getHours()).toBe(14);
  });

  it('notifyEventUpdate: a 14:00Z start on a New York team reads 10:00 AM', async () => {
    const { supabase } = fakeClient(timed);
    await notifyEventUpdate('e1', supabase);
    expect(messageOf()).toBe('Sat, Oct 31 at 10:00 AM');
    expect(messageOf()).not.toContain('2:00 PM');
  });

  it('sendEventInvitations: the invitation reads 10:00 AM', async () => {
    const { supabase } = fakeClient(timed);
    await sendEventInvitations('e1', ['p1'], supabase);
    expect(messageOf()).toBe('Sat, Oct 31 at 10:00 AM');
  });

  it('notifyEventSeriesUpdate: the series row reads 10:00 AM', async () => {
    const { supabase } = fakeClient([timed, { ...timed, id: 'e2', start_time: '2026-11-07T15:00:00Z' }]);
    await notifyEventSeriesUpdate('root', ['e1', 'e2'], supabase);
    expect(messageOf()).toBe('Sat, Oct 31 at 10:00 AM and 1 later');
  });

  it('an all-day event gives its written date and no time', async () => {
    const { supabase } = fakeClient(allDay);
    await notifyEventUpdate('e1', supabase);
    expect(messageOf()).toBe('Sat, Oct 31');
  });

  it("a team with no zone row falls back to the app's default zone (New York), never the server's", async () => {
    const { supabase } = fakeClient(timed, null);
    await notifyEventUpdate('e1', supabase);
    expect(messageOf()).toBe('Sat, Oct 31 at 10:00 AM');
  });
});
