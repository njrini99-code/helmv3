import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('../../lib/phone-hint', () => ({ marksHint: () => Promise.resolve([]) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ getTeamJoinRequests: async () => ({ success: true, data: [] }) }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));

import { classYearKey } from '../../lib/class-year';
import { loadCoachHome } from '../home';
import { loadPlayerHome } from '../player-home';

/** W-CRH-23: each player's year reaches the coach's Home only, from the roster read it already makes. A player's payload has none of it. */

const ZONE = 'America/New_York';
const member = (id: string, graduation_year: number | null) => ({ availability: 'available', player: { id, first_name: id, last_name: 'Stone', graduation_year } });

function keysUnder(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysUnder(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysUnder(v, out);
    }
  }
  return out;
}

beforeEach(() => {
  tables.current = {
    golf_team_settings: { data: { timezone: ZONE } },
    golf_team_members: { data: [member('mate-1', 2028), member('mate-2', 1999)] },
    golf_events: { data: [] },
    golf_rounds: { data: [] },
    golf_players: { data: { handicap_index: 2.1, handicap: null } },
    golf_teams: { data: { gender: 'men', created_by: 'c-head', organization_id: 'o1' } },
    golf_coaches: { data: [{ id: 'c-head', user_id: 'u-head' }] },
    golf_holes: { data: [] },
    golf_round_stats_cache: { data: [] },
    golf_pga_standards: { data: [{ metric_id: 'gir_pct', pga_tour_value: 60 }] },
  };
});

describe('yearById, by viewer', () => {
  it('a player Home has no yearById anywhere in its payload, on either stats flag setting', async () => {
    for (const shs of [false, true]) {
      const data = await loadPlayerHome({ teamId: 't1', playerId: 'p1', firstName: 'Theo', shs });
      const keys = keysUnder(data);
      expect(keys.has('greeting')).toBe(true);
      expect(keys.has('yearById')).toBe(false);
      expect(JSON.stringify(data)).not.toContain('mate-1');
    }
  });

  it('a coach Home with the lane on maps this roster, leaving out a year outside the four', async () => {
    const data = await loadCoachHome({ teamId: 't1', coachName: 'Maya Reyes', crh: true });
    expect(data.yearById).toEqual({ 'mate-1': classYearKey(2028, new Date(), ZONE) });
  });

  it('with the lane off a coach Home has no yearById either', async () => {
    const data = await loadCoachHome({ teamId: 't1', coachName: 'Maya Reyes' });
    expect(keysUnder(data).has('yearById')).toBe(false);
  });
});
