/**
 * P006 VERIFY "Retry can create the same event twice when a create's answer is lost": events and series were keyed in
 * C-17 (event-create-idempotency.test.ts). Busy time was the last create the Calendar's toast can retry without a key:
 * a Retry after a reply that was lost AFTER the server stored the block added a second one. addCoachBlockedTime now
 * takes an optional `requestId` that becomes the row's primary key; a repeat hits the key, and the existing row, read
 * back as this coach's own block with the same title and start, is the answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: unknown;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { addCoachBlockedTime } from '../calendar-blocked-time';

type Row = Record<string, unknown>;

const REQUEST = '44444444-4444-4444-8444-444444444444';

function tables(): Record<string, Row[]> {
  return {
    golf_coaches: [
      { id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' },
      { id: 'coach-2', user_id: 'u-coach-2', organization_id: 'org-1' },
    ],
    golf_coach_blocked_time: [],
  };
}

/** The fake store has no primary key, so model one: an insert whose `id` is taken answers 23505, as Postgres does. */
function install(userId: string, t: Record<string, Row[]>) {
  const real = createFakeSupabase({ user: { id: userId }, tables: t });
  fake = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      if (table !== 'golf_coach_blocked_time') return b;
      return {
        ...b,
        insert: (payload: unknown) => {
          const rows = Array.isArray(payload) ? (payload as Row[]) : [payload as Row];
          const clash = rows.some((r) => r.id !== undefined && t.golf_coach_blocked_time!.some((e) => e.id === r.id));
          if (!clash) return (b as { insert: (p: unknown) => unknown }).insert(payload);
          const n: Record<string, unknown> = {};
          Object.assign(n, {
            select: () => n,
            single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "golf_coach_blocked_time_pkey"' } }),
          });
          return n;
        },
      };
    },
  };
  return t;
}

const block = (over: Record<string, unknown> = {}) => ({
  title: 'Film',
  startDate: '2099-07-01',
  endDate: '2099-07-01',
  startTime: '09:00',
  endTime: '10:00',
  allDay: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addCoachBlockedTime with a request id', () => {
  it('stores the block under that id', async () => {
    const t = install('u-coach', tables());
    const r = await addCoachBlockedTime(block({ requestId: REQUEST }));
    expect(r).toEqual({ success: true, data: { id: REQUEST } });
    expect(t.golf_coach_blocked_time!.map((e) => e.id)).toEqual([REQUEST]);
  });

  it('a Retry after a lost reply adds no second block and answers with the one that landed', async () => {
    const t = install('u-coach', tables());
    const first = await addCoachBlockedTime(block({ requestId: REQUEST }));
    expect(first.success).toBe(true);

    const again = await addCoachBlockedTime(block({ requestId: REQUEST }));

    expect(again).toEqual({ success: true, data: { id: REQUEST } });
    expect(t.golf_coach_blocked_time).toHaveLength(1);
  });

  it('a stored time with seconds still matches the HH:MM that was sent', async () => {
    const t = tables();
    t.golf_coach_blocked_time!.push({ id: REQUEST, coach_id: 'coach-1', title: 'Film', start_date: '2099-07-01', start_time: '09:00:00' });
    install('u-coach', t);
    const again = await addCoachBlockedTime(block({ requestId: REQUEST }));
    expect(again).toEqual({ success: true, data: { id: REQUEST } });
    expect(t.golf_coach_blocked_time).toHaveLength(1);
  });

  it("refuses an id that belongs to a different block of this coach, and to another coach's", async () => {
    const mine = install('u-coach', tables());
    await addCoachBlockedTime(block({ requestId: REQUEST }));
    const different = await addCoachBlockedTime(block({ requestId: REQUEST, title: 'Recruiting call' }));
    expect(different).toEqual({ success: false, error: 'Failed to add blocked time' });
    expect(mine.golf_coach_blocked_time).toHaveLength(1);

    const theirs = tables();
    theirs.golf_coach_blocked_time!.push({ id: REQUEST, coach_id: 'coach-2', title: 'Film', start_date: '2099-07-01', start_time: '09:00' });
    install('u-coach', theirs);
    const other = await addCoachBlockedTime(block({ requestId: REQUEST }));
    expect(other).toEqual({ success: false, error: 'Failed to add blocked time' });
    expect(theirs.golf_coach_blocked_time).toHaveLength(1);
  });

  it('without a request id it behaves as before: no id is sent, and two adds are two blocks', async () => {
    const t = install('u-coach', tables());
    const one = await addCoachBlockedTime(block());
    const two = await addCoachBlockedTime(block());
    expect(one.success && two.success).toBe(true);
    expect(t.golf_coach_blocked_time).toHaveLength(2);
    expect(t.golf_coach_blocked_time![0]!.id).not.toBe(t.golf_coach_blocked_time![1]!.id);
  });

  it('refuses a request id that is not a UUID before writing anything', async () => {
    const t = install('u-coach', tables());
    const r = await addCoachBlockedTime(block({ requestId: 'not-a-uuid' }));
    expect(r).toEqual({ success: false, error: 'Invalid blocked time data' });
    expect(t.golf_coach_blocked_time).toHaveLength(0);
  });
});
