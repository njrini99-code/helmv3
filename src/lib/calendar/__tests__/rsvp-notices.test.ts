/**
 * P-5: writeEventInvitationNotices writes only the Bell rows of an invitation (golf_calendar_notifications) and never
 * touches attendance, so a tournament made from a calendar event keeps R1's replies (sendEventInvitations upserts
 * attendance back to pending). sendEventInvitations writes its rows through it, unchanged: an existing row stays as it
 * is. With `refresh` the row is replaced with the new copy and marked unread.
 */
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

import { sendEventInvitations, writeEventInvitationNotices } from '../rsvp';

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

describe('sendEventInvitations still writes its Bell rows the same way', () => {
  function client(requiresRsvp: boolean) {
    const writes: Array<{ table: string; rows: unknown }> = [];
    const event = { id: 'e1', team_id: 't1', title: 'Short game', start_time: '2099-07-01T14:00:00+00:00', location: 'Range', requires_rsvp: requiresRsvp };
    const supabase = {
      from: (table: string) => {
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          select: () => q,
          eq: () => q,
          in: () => q,
          single: async () => ({ data: event, error: null }),
          upsert: (rows: unknown) => {
            writes.push({ table, rows });
            return { select: async () => ({ data: [{ id: 'a1' }], error: null }) };
          },
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(
              table === 'golf_team_members'
                ? { data: [{ player_id: 'p1' }], error: null }
                : { data: [{ id: 'p1', user_id: 'u1', first_name: 'Mara', last_name: 'Lindqvist' }], error: null },
            ).then(resolve),
        });
        return q;
      },
    } as unknown as SupabaseClient;
    return { supabase, writes };
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
