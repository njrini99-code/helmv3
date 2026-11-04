import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../team', () => ({ resolveClubhouseTeam: vi.fn() }));
vi.mock('../../data/stats-team', () => ({ loadTeamStats: vi.fn() }));
vi.mock('../../data/stats-player', () => ({ loadPlayerProfile: vi.fn() }));
vi.mock('../../data/coachhelm-player', () => ({ loadCoachPlayerScope: vi.fn(async () => ({ status: 'off' })) }));
vi.mock('../../data/stats-reads', () => ({ loadStatsReads: vi.fn(async () => ({ status: 'ready', byLeg: {} })), readsForScope: vi.fn(() => ({ status: 'failed' })) }));
vi.mock('../../gate', () => ({ statsRedesignEnabled: vi.fn() }));
vi.mock('../../screens/stats/StatsTeam', () => ({ StatsTeam: function StatsTeam() { return null; } }));
vi.mock('../../screens/stats/StatsPlayer', () => ({ StatsPlayer: function StatsPlayer() { return null; } }));

import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadPlayerProfile } from '../../data/stats-player';
import { loadTeamStats } from '../../data/stats-team';
import { statsRedesignEnabled } from '../../gate';
import { StatsPlayer } from '../../screens/stats/StatsPlayer';
import { StatsTeam } from '../../screens/stats/StatsTeam';
import { ClubhouseStatsRoute } from '../stats';
import { resolveClubhouseTeam } from '../team';

const TEAMMATE = '22222222-2222-4222-8222-222222222222';
const ME = '11111111-1111-4111-8111-111111111111';
type El = { type: unknown; props: Record<string, unknown> };

const asPlayer = () => {
  vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: { id: ME } } as never);
  vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'player', teamId: 't1', playerId: ME } as never);
};
const asCoach = () => {
  vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: { id: 'c1' }, player: null } as never);
  vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't1', coachId: 'c1' } as never);
};

beforeEach(() => {
  vi.mocked(loadPlayerProfile).mockReset().mockResolvedValue({ id: ME } as never);
  vi.mocked(loadTeamStats).mockReset().mockResolvedValue({ teamName: 'T' } as never);
});

/** SHARED-11 and stats-home criteria 27 and 48, in both flag states: the route is what keeps team figures from a player. */
describe.each([true, false])('the stats route with clubhouse_stats_redesign_v1 %s', (flag) => {
  beforeEach(() => {
    vi.mocked(statsRedesignEnabled).mockReturnValue(flag);
  });

  it('a player naming a teammate in the address still reads only their own profile', async () => {
    asPlayer();
    const el = (await ClubhouseStatsRoute({ player: TEAMMATE })) as unknown as El;
    expect(el.type).toBe(StatsPlayer);
    expect(vi.mocked(loadPlayerProfile)).toHaveBeenCalledTimes(1);
    const args = vi.mocked(loadPlayerProfile).mock.calls[0]![0];
    expect(args).toMatchObject({ viewer: 'player', teamId: 't1', playerId: ME });
    expect(JSON.stringify(args)).not.toContain(TEAMMATE);
  });

  it('never loads team stats for a player, with or without an address', async () => {
    asPlayer();
    await ClubhouseStatsRoute({});
    await ClubhouseStatsRoute({ player: TEAMMATE });
    expect(vi.mocked(loadTeamStats)).not.toHaveBeenCalled();
  });

  it('gives a player no coach id, so no coach write is reachable', async () => {
    asPlayer();
    const el = (await ClubhouseStatsRoute({})) as unknown as El;
    expect(el.props.coachId).toBeNull();
  });

  it('a coach with no player gets the team page, and the flag is what reaches it', async () => {
    asCoach();
    const el = (await ClubhouseStatsRoute({})) as unknown as El;
    expect(el.type).toBe(StatsTeam);
    expect(el.props.shs).toBe(flag);
    expect(vi.mocked(loadPlayerProfile)).not.toHaveBeenCalled();
  });

  it('asks the loaders for the redesign only when the flag is on', async () => {
    asCoach();
    await ClubhouseStatsRoute({});
    const team = vi.mocked(loadTeamStats).mock.calls[0]![0] as { shs?: boolean };
    asPlayer();
    await ClubhouseStatsRoute({});
    const player = vi.mocked(loadPlayerProfile).mock.calls[0]![0] as { shs?: boolean };
    if (flag) {
      expect(team.shs).toBe(true);
      expect(player.shs).toBe(true);
    } else {
      // Off, the keys are absent: the loaders' calls are byte for byte main's.
      expect('shs' in team).toBe(false);
      expect('shs' in player).toBe(false);
    }
  });
});
