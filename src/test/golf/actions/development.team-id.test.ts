/**
 * Every focus-area creator writes the team the player is on (swap audit CH13-5). The player's own CoachHelm reads the
 * proposals made to them by team (`team_id` null or their active team), and `createFocusArea` (Fairway's Add focus area,
 * Stats' Add focus area and Ask CoachHelm's action card), `createPlayerFocusArea` and the legacy `createFocusAreaFromInsight`
 * used to insert with `team_id` null, so a proposal made through them never reached the player it was for.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logServerError = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const notifyDevPlanAssigned = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/lib/notifications', () => ({ notifyDevPlanAssigned }));
const clubhouse = vi.hoisted(() => ({ on: false }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseForTeam: () => clubhouse.on }));
const demo = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/demo/golf-read-only', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/demo/golf-read-only')>();
  return { ...real, assertGolfDemoWritable: async () => { if (demo.on) throw new real.GolfDemoReadOnlyError(); } };
});
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({ recordInsightAction: vi.fn().mockResolvedValue(undefined) }));

const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args) }));
const resolveCoachTeamIdMock = vi.fn();
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: (...args: unknown[]) => resolveCoachTeamIdMock(...args) }));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClientMock() }));
const createAdminClientMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClientMock() }));

import { createFocusArea, createFocusAreaFromInsight, createFocusAreaFromInsightV2, createPlayerFocusArea } from '@/app/golf/actions/development';

type Filters = Array<[string, unknown[]]>;

/** A query builder that answers `maybeSingle` and `single` from the filters it was given, and is not itself awaitable. */
function chain(answer: (f: Filters) => unknown) {
  const filters: Filters = [];
  const c: object = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key === 'then') return undefined;
        if (key === 'maybeSingle' || key === 'single') return async () => answer(filters);
        return (...args: unknown[]) => {
          filters.push([key, args]);
          return c;
        };
      },
    },
  );
  return c;
}

const hasFilter = (f: Filters, col: string) => f.some(([k, a]) => k === 'eq' && a[0] === col);

interface World {
  /** What the coach's own team resolves to (the cookie-aware resolver), and whether the player is on it. */
  coachTeam?: string | null;
  onCoachTeam?: boolean;
  /** The team the player is active on, or how reading it goes wrong. */
  playerTeam?: string | null | 'error' | 'throws';
  insightTeam?: string | null;
  /** The player a linked insight is about (defaults to the player the focus area is for). */
  insightPlayer?: string | null;
  organizationId?: string | null;
}

const inserted: Array<{ client: 'scoped' | 'admin'; payload: Record<string, unknown> }> = [];

function client(w: World, which: 'scoped' | 'admin' = 'scoped') {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'golf_coaches') return chain(() => ({ data: { id: 'coach-1', organization_id: w.organizationId === undefined ? 'org-1' : w.organizationId, full_name: 'Coach Reyes' }, error: null }));
      if (table === 'golf_players') return chain(() => ({ data: { id: 'player-1', user_id: 'user-1' }, error: null }));
      if (table === 'users') return chain(() => ({ data: { email: 'jonah@example.com' }, error: null }));
      if (table === 'golf_team_members') {
        return chain((f) => {
          // The coach's roster check names the team; the player's own team lookup does not.
          if (hasFilter(f, 'team_id')) return { data: w.onCoachTeam === false ? null : { id: 'member-1' }, error: null };
          if (w.playerTeam === 'error') return { data: null, error: { message: 'boom' } };
          if (w.playerTeam === 'throws') throw new Error('network');
          return { data: w.playerTeam ? { team_id: w.playerTeam } : null, error: null };
        });
      }
      if (table === 'golf_coach_insights') {
        return {
          select: () => chain(() => ({ data: { metadata: null, content: 'insight body', team_id: w.insightTeam ?? null, player_id: w.insightPlayer === undefined ? 'player-1' : w.insightPlayer }, error: null })),
          update: () => ({ eq: () => Object.assign(Promise.resolve({ error: null }), { eq: async () => ({ error: null }) }) }),
        };
      }
      if (table === 'golf_player_focus_areas') {
        return {
          select: () => chain(() => ({ data: null, error: null })),
          insert: (payload: Record<string, unknown>) => {
            inserted.push({ client: which, payload });
            const res = { error: null };
            return { select: () => ({ single: async () => ({ data: { id: 'fa-1' }, error: null }) }), then: (ok: (v: typeof res) => void) => ok(res) };
          },
        };
      }
      return chain(() => ({ data: null, error: null }));
    },
  };
}

const world = (w: World = {}) => {
  createClientMock.mockResolvedValue(client(w));
  createAdminClientMock.mockReturnValue(client(w, 'admin'));
  resolveCoachTeamIdMock.mockResolvedValue(w.coachTeam === undefined ? 'team-coach' : w.coachTeam);
};

const base = { player_id: 'player-1', coach_id: 'coach-1', area_type: 'putting', title: 'Lag putting', description: null, target_metric: null, current_value: null, target_value: null };
const lastInsert = () => inserted[inserted.length - 1]!;

beforeEach(() => {
  inserted.length = 0;
  clubhouse.on = false;
  demo.on = false;
  vi.clearAllMocks();
  verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
});

describe('createFocusArea (the coach’s own, and Ask CoachHelm’s action card)', () => {
  it('writes the coach’s team once the player is confirmed on it', async () => {
    world({ coachTeam: 'team-coach', onCoachTeam: true, playerTeam: 'team-player' });
    expect(await createFocusArea({ ...base, status: 'proposed' })).toMatchObject({ success: true });
    expect(lastInsert().payload).toMatchObject({ player_id: 'player-1', status: 'proposed', team_id: 'team-coach' });
  });

  it('the coach is the caller: a coach id sent by the browser is ignored', async () => {
    world({ coachTeam: 'team-coach', onCoachTeam: true });
    expect(await createFocusArea({ ...base, coach_id: 'coach-someone-else', status: 'proposed' })).toMatchObject({ success: true });
    expect(lastInsert().payload.coach_id).toBe('coach-1');
    const { coach_id: _c, ...noCoachId } = base;
    expect(await createFocusArea({ ...noCoachId, status: 'proposed' })).toMatchObject({ success: true });
    expect(lastInsert().payload.coach_id).toBe('coach-1');
  });

  it('a coach with no team is refused, and nothing is written (the roster check used to be skipped)', async () => {
    world({ organizationId: null, coachTeam: null, playerTeam: 'team-player' });
    expect(await createFocusArea({ ...base, status: 'proposed' })).toMatchObject({ success: false, error: "Couldn't confirm this player is on your team. Please try again." });
    world({ coachTeam: null, playerTeam: 'team-player' });
    expect(await createFocusArea({ ...base, status: 'proposed' })).toMatchObject({ success: false });
    expect(inserted).toEqual([]);
  });

  it('a coach with no organisation but a staffed team is still roster-checked', async () => {
    world({ organizationId: null, coachTeam: 'team-coach', onCoachTeam: false });
    expect(await createFocusArea({ ...base, status: 'proposed' })).toMatchObject({ success: false, error: 'Player is not an active member on your team' });
    expect(resolveCoachTeamIdMock).toHaveBeenCalledWith(expect.anything(), null, 'coach-1');
    expect(inserted).toEqual([]);
    world({ organizationId: null, coachTeam: 'team-coach', onCoachTeam: true });
    expect(await createFocusArea({ ...base, status: 'proposed' })).toMatchObject({ success: true });
    expect(lastInsert().payload).toMatchObject({ coach_id: 'coach-1', team_id: 'team-coach' });
  });

  it('a player who is not on the coach’s team is still refused, and nothing is written', async () => {
    world({ coachTeam: 'team-coach', onCoachTeam: false });
    expect(await createFocusArea({ ...base, status: 'proposed' })).toMatchObject({ success: false, error: 'Player is not an active member on your team' });
    expect(inserted).toEqual([]);
  });
});

describe('createFocusArea refuses what the browser cannot vouch for', () => {
  it('a linked insight must be this player’s, on the coach’s team or none', async () => {
    world({ coachTeam: 'team-coach', onCoachTeam: true, insightTeam: 'team-coach' });
    expect(await createFocusArea({ ...base, from_insight_id: 'insight-1' })).toMatchObject({ success: true });
    expect(lastInsert().payload.from_insight_id).toBe('insight-1');
    world({ coachTeam: 'team-coach', onCoachTeam: true, insightTeam: null });
    expect(await createFocusArea({ ...base, from_insight_id: 'insight-1' })).toMatchObject({ success: true });
    inserted.length = 0;

    world({ coachTeam: 'team-coach', onCoachTeam: true, insightTeam: 'team-coach', insightPlayer: 'player-2' });
    expect(await createFocusArea({ ...base, from_insight_id: 'insight-1' })).toMatchObject({ success: false, error: 'Not authorized to link this insight' });
    world({ coachTeam: 'team-coach', onCoachTeam: true, insightTeam: 'team-other' });
    expect(await createFocusArea({ ...base, from_insight_id: 'insight-1' })).toMatchObject({ success: false, error: 'Not authorized to link this insight' });
    expect(inserted).toEqual([]);
  });

  it('the shared demo account cannot create one', async () => {
    demo.on = true;
    world({ coachTeam: 'team-coach', onCoachTeam: true });
    await expect(createFocusArea({ ...base, status: 'proposed' })).rejects.toThrow();
    expect(inserted).toEqual([]);
  });
});

describe('createPlayerFocusArea (the player’s own)', () => {
  it('writes the team they are on, through the service-role client the create already used', async () => {
    world({ playerTeam: 'team-player' });
    const { coach_id: _c, ...own } = base;
    expect(await createPlayerFocusArea(own)).toMatchObject({ success: true });
    expect(lastInsert()).toMatchObject({ client: 'admin', payload: { player_id: 'player-1', status: 'active', coach_id: null, team_id: 'team-player' } });
  });

  it('a player with no team is written with none', async () => {
    world({ playerTeam: null });
    const { coach_id: _c, ...own } = base;
    await createPlayerFocusArea(own);
    expect(lastInsert().payload.team_id).toBeNull();
  });

  it('a team read that fails or throws is logged and never fails the create', async () => {
    const { coach_id: _c, ...own } = base;
    world({ playerTeam: 'error' });
    expect(await createPlayerFocusArea(own)).toMatchObject({ success: true });
    expect(lastInsert().payload.team_id).toBeNull();
    world({ playerTeam: 'throws' });
    expect(await createPlayerFocusArea(own)).toMatchObject({ success: true });
    expect(lastInsert().payload.team_id).toBeNull();
    expect(logServerError).toHaveBeenCalledWith(expect.stringContaining('written without a team'), expect.objectContaining({ action: 'development.resolvePlayerTeamId' }));
  });
});

describe('createFocusAreaFromInsight (the legacy coach path)', () => {
  const args = { insight_id: 'insight-1', player_id: 'player-1', coach_id: 'coach-1', title: 'Work on putts', description: null, insight_type: 'stat_regression' };

  it('writes the player’s team now, not the team the insight happened to be generated under', async () => {
    world({ playerTeam: 'team-player', insightTeam: 'team-old' });
    expect(await createFocusAreaFromInsight(args)).toMatchObject({ success: true });
    expect(lastInsert().payload).toMatchObject({ from_insight_id: 'insight-1', status: 'proposed', team_id: 'team-player' });
  });

  it('falls back to the insight’s team when the player’s cannot be read, and to none without either', async () => {
    world({ playerTeam: 'error', insightTeam: 'team-old' });
    await createFocusAreaFromInsight(args);
    expect(lastInsert().payload.team_id).toBe('team-old');
    world({ playerTeam: null, insightTeam: null });
    await createFocusAreaFromInsight(args);
    expect(lastInsert().payload.team_id).toBeNull();
  });
});

describe('createFocusAreaFromInsightV2 (Clubhouse’s Assign as focus) keeps writing the team', () => {
  it('a coach’s proposal carries the player’s team', async () => {
    world({ playerTeam: 'team-player' });
    expect(await createFocusAreaFromInsightV2({ playerId: 'player-1', insightId: 'insight-1', title: 'Lag putting', description: 'x', areaType: 'putting' })).toMatchObject({ success: true });
    expect(lastInsert().payload).toMatchObject({ status: 'proposed', team_id: 'team-player' });
  });
});

describe('CH13-7 the "New focus area" notification goes where the player can see the focus area', () => {
  it('Clubhouse on: Stats, Development tab (a rebuilt screen), not the Fairway address that redirects to a drill Clubhouse does not draw', async () => {
    clubhouse.on = true;
    world({ coachTeam: 'team-coach', onCoachTeam: true });
    expect(await createFocusArea({ ...base, status: 'proposed' })).toMatchObject({ success: true });
    expect(notifyDevPlanAssigned).toHaveBeenCalledTimes(1);
    expect(notifyDevPlanAssigned).toHaveBeenCalledWith('user-1', 'jonah@example.com', 'Lag putting', 'putting', 'Coach Reyes', '/golf/dashboard/stats?tab=dev');
  });

  it('Clubhouse off: no link is passed, so it is Fairway’s, as it always was', async () => {
    clubhouse.on = false;
    world({ coachTeam: 'team-coach', onCoachTeam: true });
    await createFocusArea({ ...base, status: 'proposed' });
    expect(notifyDevPlanAssigned).toHaveBeenCalledWith('user-1', 'jonah@example.com', 'Lag putting', 'putting', 'Coach Reyes', undefined);
  });
});

describe('CH13-24 Assign as focus tells the player, as every coach proposal does', () => {
  it('Clubhouse’s Assign (V2) sends the "New focus area" notice', async () => {
    clubhouse.on = true;
    world({ playerTeam: 'team-player' });
    expect(await createFocusAreaFromInsightV2({ playerId: 'player-1', insightId: 'insight-1', title: 'Lag putting', description: 'x', areaType: 'putting' })).toMatchObject({ success: true });
    expect(notifyDevPlanAssigned).toHaveBeenCalledTimes(1);
    expect(notifyDevPlanAssigned).toHaveBeenCalledWith('user-1', 'jonah@example.com', 'Lag putting', 'putting', 'Coach Reyes', '/golf/dashboard/stats?tab=dev');
  });

  it('the legacy insight path sends it too', async () => {
    clubhouse.on = false;
    world({ playerTeam: 'team-player', insightTeam: 'team-player' });
    const args = { insight_id: 'insight-1', player_id: 'player-1', coach_id: 'coach-1', title: 'Work on putts', description: null, insight_type: 'stat_regression' };
    expect(await createFocusAreaFromInsight(args)).toMatchObject({ success: true });
    expect(notifyDevPlanAssigned).toHaveBeenCalledTimes(1);
  });
});

describe('CH13-22 Assign as focus carries the starting value', () => {
  it('writes the player’s value now as the current and baseline value; no target', async () => {
    world({ playerTeam: 'team-player' });
    await createFocusAreaFromInsightV2({ playerId: 'player-1', insightId: 'insight-1', title: 'Lag putting', description: 'x', areaType: 'putting', targetMetric: 'putts_per_round', currentValue: 33.4 });
    expect(lastInsert().payload).toMatchObject({ current_value: 33.4, baseline_value: 33.4, target_value: null });
  });

  it('without a value it writes none, as before', async () => {
    world({ playerTeam: 'team-player' });
    await createFocusAreaFromInsightV2({ playerId: 'player-1', insightId: 'insight-1', title: 'Lag putting', description: 'x', areaType: 'putting' });
    expect(lastInsert().payload).toMatchObject({ current_value: null, baseline_value: null });
  });
});
