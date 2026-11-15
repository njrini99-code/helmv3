import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * sendEventReminderToPlayers answers with who the reminder was written for (`sentPlayerIds`) beside the count it always
 * gave. A caller that names players can then say who was not reminded: someone off the event's team, or with no account.
 */
type Row = Record<string, unknown>;

const TEAM = 'team-1';
const EVENT = 'event-1';
const ON_TEAM = '11111111-1111-4111-8111-111111111111';
const NO_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const OTHER_TEAM = '33333333-3333-4333-8333-333333333333';

const { world } = vi.hoisted(() => ({ world: { client: null as unknown, tables: {} as Record<string, Record<string, unknown>[]> } }));

function seed(over: Record<string, Row[]> = {}) {
  world.tables = {
    golf_events: [{ id: EVENT, title: 'Tuesday range', start_time: '2026-11-12T20:00:00Z', all_day: false, location: 'Range', team_id: TEAM }],
    golf_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
    golf_team_coach_staff: [{ id: 's1', team_id: TEAM, coach_id: 'coach-1' }],
    golf_team_members: [
      { player_id: ON_TEAM, team_id: TEAM, status: 'active' },
      { player_id: NO_ACCOUNT, team_id: TEAM, status: 'active' },
      { player_id: OTHER_TEAM, team_id: 'team-2', status: 'active' },
    ],
    golf_players: [
      { id: ON_TEAM, user_id: 'u-a' },
      { id: NO_ACCOUNT, user_id: null },
      { id: OTHER_TEAM, user_id: 'u-c' },
    ],
    golf_calendar_notifications: [],
    ...over,
  };
  world.client = createFakeSupabase({ user: { id: 'user-1' }, tables: world.tables });
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => world.client) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => world.client) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: string, _opts: unknown, fn: unknown) => fn }));
vi.mock('@/lib/calendar/availability', async (orig) => ({ ...(await orig<Record<string, unknown>>()), resolveTeamTimeZone: vi.fn(async () => 'America/New_York') }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => unknown) => cb()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerException: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));

import { sendEventReminderToPlayers } from '../calendar-events';

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

describe('sendEventReminderToPlayers says who was reminded', () => {
  it('names the players the reminder was written for, and counts them as before', async () => {
    const res = await sendEventReminderToPlayers(EVENT, [ON_TEAM]);
    expect(res).toEqual({ success: true, data: { sent: 1, sentPlayerIds: [ON_TEAM] } });
    expect(world.tables.golf_calendar_notifications).toHaveLength(1);
    expect(world.tables.golf_calendar_notifications?.[0]).toMatchObject({ user_id: 'u-a', event_id: EVENT, title: 'Reminder: Tuesday range' });
  });

  it('leaves out a player with no account and a player on another team: neither was reminded', async () => {
    const res = await sendEventReminderToPlayers(EVENT, [ON_TEAM, NO_ACCOUNT, OTHER_TEAM]);
    expect(res).toEqual({ success: true, data: { sent: 1, sentPlayerIds: [ON_TEAM] } });
    expect(world.tables.golf_calendar_notifications?.map((n) => n.user_id)).toEqual(['u-a']);
  });

  it('names nobody when nobody could be reminded', async () => {
    expect(await sendEventReminderToPlayers(EVENT, [NO_ACCOUNT])).toEqual({ success: true, data: { sent: 0, sentPlayerIds: [] } });
    expect(await sendEventReminderToPlayers(EVENT, [OTHER_TEAM])).toEqual({ success: true, data: { sent: 0, sentPlayerIds: [] } });
    expect(world.tables.golf_calendar_notifications).toHaveLength(0);
  });

  it('a coach who is not on the event’s staff is refused and nobody is named', async () => {
    seed({ golf_team_coach_staff: [] });
    const res = await sendEventReminderToPlayers(EVENT, [ON_TEAM]);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res)).not.toContain(ON_TEAM);
  });
});
