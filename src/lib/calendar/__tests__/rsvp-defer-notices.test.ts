/**
 * F-0029 (audit 2026-10-29): publishing an event waited for the Bell rows (an admin-client upsert) before the coach saw
 * anything. The attendance upsert stays inline (its failure is the coach's `invitationsError`); the Bell rows can be
 * handed to the caller's `after()`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const admin = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: async () => {
        admin.calls++;
        return { error: null };
      },
    }),
  }),
}));

import { sendEventInvitations } from '../rsvp';

function client() {
  const writes: string[] = [];
  const event = { id: 'e1', team_id: 't1', title: 'Qualifier', start_time: '2099-07-01T14:00:00+00:00', location: null, requires_rsvp: true };
  const supabase = {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        single: async () => ({ data: event, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: () => {
          writes.push(table);
          return { select: async () => ({ data: [{ id: 'a1' }], error: null }) };
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(table === 'golf_team_members' ? { data: [{ player_id: 'p1' }], error: null } : { data: [{ id: 'p1', user_id: 'u1' }], error: null }).then(resolve),
      });
      return q;
    },
  } as unknown as SupabaseClient;
  return { supabase, writes };
}

beforeEach(() => {
  admin.calls = 0;
});

describe('sendEventInvitations can defer the Bell rows (F-0029)', () => {
  it('writes attendance inline and hands the Bell rows to deferNotices', async () => {
    const { supabase, writes } = client();
    const deferred: Array<() => Promise<void>> = [];
    await sendEventInvitations('e1', ['p1'], supabase, { deferNotices: (task) => deferred.push(task) });
    expect(writes).toEqual(['golf_event_attendance']);
    expect(admin.calls).toBe(0);
    expect(deferred).toHaveLength(1);
    await deferred[0]!();
    expect(admin.calls).toBe(1);
  });
});
