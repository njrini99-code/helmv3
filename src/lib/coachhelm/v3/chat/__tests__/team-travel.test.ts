import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import type { CoachChatContext } from '../context';

// Owner, 2026-10-31: asked for a travel plan, CoachHelm said it had no tool for trips though the team keeps them
// (golf_travel_itineraries, Clubhouse Travel). get_team_travel reads them.
vi.mock('@/lib/coachhelm/v3/ranking/score', () => ({ loadCoachWeightsForPlayer: vi.fn(async () => ({})) }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => []) }));

import { getTeamTravel } from '../read-tools';

const ctx = { team_id: 't1', team_name: 'Demo', timezone: 'America/New_York', roster: [] } as unknown as CoachChatContext;
const trip = (over: Record<string, unknown>) => ({
  id: 'i1',
  team_id: 't1',
  is_test: false,
  event_name: 'Spring Invitational',
  destination: 'Austin, TX',
  departure_date: '2099-03-02',
  departure_time: '07:30',
  departure_location: 'Athletics lot',
  return_date: '2099-03-05',
  return_time: '18:00',
  transportation_type: 'van',
  hotel_name: 'Lakeway Inn',
  notes: null,
  ...over,
});

describe('get_team_travel', () => {
  it('returns the team’s trips, soonest first, with no test rows', async () => {
    const sb = createFakeSupabase({
      tables: {
        golf_travel_itineraries: [
          trip({ id: 'later', event_name: 'Conference', departure_date: '2099-04-10' }),
          trip({ id: 'test', is_test: true }),
          trip({ id: 'other-team', team_id: 't2' }),
          trip({}),
        ],
      },
    });
    const env = await getTeamTravel(sb as never, ctx);
    const trips = (env.detail as { trips: { trip_id: string; destination: string; hotel: string }[] }).trips;
    expect(trips.map((t) => t.trip_id)).toEqual(['i1', 'later']);
    expect(trips[0]).toMatchObject({ destination: 'Austin, TX', hotel: 'Lakeway Inn' });
    expect(env.summary).toBe('2 trips.');
    expect(env.coverage).toBe('complete');
  });

  it('says so when there are none', async () => {
    const sb = createFakeSupabase({ tables: { golf_travel_itineraries: [] } });
    const env = await getTeamTravel(sb as never, ctx);
    expect(env.coverage).toBe('empty');
    expect(env.summary).toBe('No upcoming or recent trips are set up.');
  });
});
