import { beforeEach, describe, expect, it, vi } from 'vitest';

const teamId = '11111111-1111-4111-8111-111111111111';
const playerId = '22222222-2222-4222-8222-222222222222';
const coachId = '33333333-3333-4333-8333-333333333333';
const state = vi.hoisted(() => ({ coach: true, member: true, partial: false, roster: true }));
const getBusy = vi.hoisted(() => vi.fn(async () => ({ periods: [], partial: state.partial })));
function query(table: string) {
  const data = () => table === 'golf_teams' ? { timezone: 'America/New_York' }
    : table === 'golf_coaches' ? state.coach ? { id: coachId, user_id: 'viewer', full_name: 'Coach', avatar_url: null } : null
    : table === 'golf_players' ? state.coach ? [{ id: playerId, user_id: 'player', first_name: 'Player', last_name: 'One', avatar_url: null }] : { id: playerId, user_id: 'viewer', first_name: 'Player', last_name: 'One', avatar_url: null }
    : table === 'golf_team_members' ? state.roster ? [{ player_id: playerId }] : [] : null;
  let mode = 'rows';
  const node = {
    select: () => node, eq: () => node, in: () => node, order: () => node, range: () => node,
    single: () => { mode = 'single'; return node; }, maybeSingle: () => { mode = 'single'; return node; },
    then: (resolve: (value: unknown) => unknown) => {
      const value = table === 'golf_players' && state.coach && mode === 'single' ? null : data();
      return Promise.resolve({ data: value, error: null }).then(resolve);
    },
  }; return node;
}
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }) },
  rpc: async (name: string) => ({ data: name === 'is_golf_team_coach' ? state.coach : state.member, error: null }), from: query,
}) }));
vi.mock('@/lib/calendar/availability', () => ({ getUserBusyPeriodsWithStatus: getBusy }));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRows: async (build: (a: number, b: number) => Promise<{data: unknown}>) => (await build(0, 999)).data }));
import { getScheduleWindow } from '../scheduling';

beforeEach(() => { state.coach = true; state.member = true; state.partial = false; state.roster = true; getBusy.mockClear(); });
describe('authorized scheduling snapshots', () => {
  it('includes organizer and roster in a named-zone day', async () => {
    const result = await getScheduleWindow({ teamId, date: '2026-09-08', participantIds: [playerId] });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.window).toEqual({ start: '2026-09-08T04:00:00.000Z', end: '2026-09-09T04:00:00.000Z' });
    expect(result.data.participants.map((p) => p.id)).toEqual([coachId, playerId]);
  });
  it('rejects another team, off-roster people and peer schedule probing', async () => {
    state.coach = false; state.member = false;
    expect((await getScheduleWindow({ teamId, date: '2026-09-08', participantIds: [] })).success).toBe(false);
    state.coach = true; state.roster = false;
    expect((await getScheduleWindow({ teamId, date: '2026-09-08', participantIds: [playerId] })).success).toBe(false);
    state.coach = false; state.member = true;
    expect((await getScheduleWindow({ teamId, date: '2026-09-08', participantIds: [coachId] })).success).toBe(false);
    expect(getBusy).not.toHaveBeenCalled();
  });
  it('preserves partial verification and rejects impossible dates', async () => {
    state.partial = true;
    const result = await getScheduleWindow({ teamId, date: '2026-09-08', participantIds: [] });
    expect(result.success && result.data.participants[0]?.verification).toBe('partial');
    expect((await getScheduleWindow({ teamId, date: '2026-02-30', participantIds: [] })).success).toBe(false);
  });
});
