/**
 * createFocusArea under the HELM_COACHHELM_TEAMS canary: the Slice 4 verdict
 * flag is read in the focus area's team scope, so a create linked to a read on
 * a listed team still gets its prescription stamped. Outside any scope the
 * canary would read the flag as off for every team. Synthetic ids only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ notifyDevPlanAssigned: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/clubhouse/gate', () => ({ isClubhouseForTeam: () => false }));
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({ recordInsightAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => id === 'coachhelm_verdicts_v1' }));
const stamp = vi.hoisted(() => vi.fn().mockResolvedValue({ status: 'stamped', criterion: true, reason: null }));
vi.mock('@/lib/coachhelm/v3/verdicts/stamp-prescription', () => ({ stampPrescriptionFromRead: stamp }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'coach' }) }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn().mockResolvedValue('team-coach') }));

/** A builder that answers `maybeSingle` / `single` and is not itself awaitable. */
function chain(answer: () => unknown) {
  const c: object = new Proxy(
    {},
    {
      get(_, key: string) {
        if (key === 'then') return undefined;
        if (key === 'maybeSingle' || key === 'single') return async () => answer();
        return () => c;
      },
    },
  );
  return c;
}

const scoped = {
  auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  from: (table: string) => {
    if (table === 'golf_coaches') return chain(() => ({ data: { id: 'coach-1', organization_id: 'org-1', full_name: 'Coach Reyes' }, error: null }));
    if (table === 'golf_team_members') return chain(() => ({ data: { id: 'member-1' }, error: null }));
    if (table === 'golf_coach_insights') return chain(() => ({ data: { player_id: 'player-1', team_id: null }, error: null }));
    if (table === 'golf_player_focus_areas') {
      return {
        select: () => chain(() => ({ data: null, error: null })),
        insert: () => {
          const res = { error: null };
          return { select: () => ({ single: async () => ({ data: { id: 'fa-1' }, error: null }) }), then: (ok: (v: typeof res) => void) => ok(res) };
        },
      };
    }
    return chain(() => ({ data: null, error: null }));
  },
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => scoped }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => scoped }));

import { createFocusArea } from '@/app/golf/actions/development';

const linked = {
  player_id: 'player-1',
  area_type: 'putting',
  title: 'Lag putting',
  description: null,
  target_metric: null,
  current_value: null,
  target_value: null,
  status: 'proposed' as const,
  from_insight_id: 'ins-1',
};

beforeEach(() => {
  stamp.mockClear();
});
afterEach(() => {
  delete process.env.HELM_COACHHELM_TEAMS;
});

describe('createFocusArea: verdict flag under the team canary', () => {
  it('the focus area’s team is listed: the prescription is stamped', async () => {
    process.env.HELM_COACHHELM_TEAMS = 'team-coach';
    expect(await createFocusArea(linked)).toMatchObject({ success: true });
    expect(stamp).toHaveBeenCalledTimes(1);
    expect(stamp.mock.calls[0]![1]).toMatchObject({ focusAreaId: 'fa-1', insightId: 'ins-1', playerId: 'player-1' });
  });

  it('the focus area’s team is not listed: no stamp', async () => {
    process.env.HELM_COACHHELM_TEAMS = 'team-other';
    expect(await createFocusArea(linked)).toMatchObject({ success: true });
    expect(stamp).not.toHaveBeenCalled();
  });

  it('no team list: the flag alone decides, as before', async () => {
    expect(await createFocusArea(linked)).toMatchObject({ success: true });
    expect(stamp).toHaveBeenCalledTimes(1);
  });
});
