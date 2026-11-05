import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { CoachChatContext } from '../context';

// get_upcoming_events read replies its own way: the legacy values the calendar still reads ('attending', 'tentative',
// 'excused') counted as no reply and named those players as not having responded; today's all-day event (stored at
// UTC midnight) was already "past"; and a failed replies read reported everyone as not having replied.
vi.mock('@/lib/coachhelm/v3/ranking/score', () => ({ loadCoachWeightsForPlayer: vi.fn(async () => ({})) }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => []) }));

import { getUpcomingEvents } from '../read-tools';

const ctx = {
  team_id: 't1',
  team_name: 'Demo',
  timezone: 'America/New_York',
  roster: [
    { id: 'p1', name: 'Ann' },
    { id: 'p2', name: 'Bea' },
    { id: 'p3', name: 'Cal' },
    { id: 'p4', name: 'Dee' },
    { id: 'p5', name: 'Eve' },
  ],
} as unknown as CoachChatContext;

const event = (over: Record<string, unknown>) => ({
  id: 'e1',
  team_id: 't1',
  title: 'Qualifier',
  event_type: 'tournament',
  start_time: '2026-10-31T00:00:00+00:00',
  end_time: null,
  all_day: true,
  location: null,
  requires_rsvp: true,
  rsvp_deadline: null,
  status: 'scheduled',
  ...over,
});

type Detail = { events: Record<string, unknown>[] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-31T16:00:00.000Z')); // Noon in New York.
});
afterEach(() => vi.useRealTimers());

describe('get_upcoming_events', () => {
  it('counts replies the way the calendar does and keeps today’s all-day event', async () => {
    const sb = createFakeSupabase({
      tables: {
        golf_events: [event({}), event({ id: 'yesterday', start_time: '2026-10-30T00:00:00+00:00' })],
        golf_event_attendance: [
          { event_id: 'e1', player_id: 'p1', status: 'attending' },
          { event_id: 'e1', player_id: 'p2', status: 'tentative' },
          { event_id: 'e1', player_id: 'p3', status: 'excused' },
          { event_id: 'e1', player_id: 'p4', status: 'not_attending' },
          { event_id: 'e1', player_id: 'p5', status: 'pending' },
        ],
      },
    });
    const env = await getUpcomingEvents(sb as never, ctx, { days_ahead: 7 });
    const events = (env.detail as Detail).events;
    expect(events.map((e) => e.event_id)).toEqual(['e1']);
    expect(events[0]).toMatchObject({ rsvp_accepted: 1, rsvp_maybe: 1, rsvp_declined: 2, rsvp_pending_count: 1, rsvp_pending_names: ['Eve'] });
    expect(env.coverage).toBe('complete');
  });

  it('names no one as not having replied when the replies did not read', async () => {
    const fake = createFakeSupabase({ tables: { golf_events: [event({})] } });
    const failing = {
      select: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }),
    };
    const sb = { from: (t: string) => (t === 'golf_event_attendance' ? failing : fake.from(t as never)) };
    const env = await getUpcomingEvents(sb as never, ctx, { days_ahead: 7 });
    const [only] = (env.detail as Detail).events;
    expect(only).toMatchObject({ rsvp_unknown: true });
    expect(only).not.toHaveProperty('rsvp_pending_names');
    expect(env.coverage).toBe('partial');
  });
});
