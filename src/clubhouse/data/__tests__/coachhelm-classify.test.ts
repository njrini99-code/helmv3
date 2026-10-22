import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `countReads` (spec D): the one count of what CoachHelm sees, which the coach's Game profile line, Game detail's line per section
 * and the roster's CoachHelm block all use. The Game profile line is checked against it on one fixture, so the three never disagree.
 */

vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/lib/coachhelm/v2/gate', () => ({
  isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: true, disabledBy: null, disabledReason: null })),
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: true, disabledBy: null, disabledReason: null })),
}));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForCoach: vi.fn(), getInsightsForPlayer: vi.fn(), getTopInsightsForPlayers: vi.fn(), getThemesForCoach: vi.fn(), getThemesForPlayer: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/genome/loader', () => ({ loadGenome: vi.fn(async () => null) }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));

import { countReads, readAreaOf } from '../coachhelm-classify';
import { loadCoachPlayerProfile, loadCoachPlayerScope } from '../coachhelm-player';
import { bigNumber, MANY_STALE, parType, penalties, PREVIEW_TOUR, slope, teeInconclusive } from '../../preview/fixtures-coachhelm';

const COACH = 'c0000000-0000-4000-8000-000000000001';
const TEAM = 'a0000000-0000-4000-8000-000000000001';
const PID = '11111111-1111-4111-8111-111111111111';
const NEWEST = '2026-10-14';

/** Two findings, one strength, one read older than the newest round, and two notes: 2 costing, 1 working. */
const rows = () => [penalties(PID), slope(PID), bigNumber(PID), { ...MANY_STALE, player_id: PID }, parType(PID), teeInconclusive(PID)];

beforeEach(() => {
  type Filters = Array<[string, unknown[]]>;
  const eq = (f: Filters, col: string) => f.find(([k, a]) => k === 'eq' && a[0] === col)?.[1][1];
  tables.current = {
    golf_team_members: (f) => (eq(f, 'player_id') === PID ? { data: { player_id: PID } } : { data: null }),
    golf_players: { data: { id: PID, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2028 } },
    golf_rounds: { data: { round_date: NEWEST } },
    golf_teams: { data: { gender: 'mens' } },
    golf_pga_standards: { data: [...PREVIEW_TOUR.values].map(([metric_id, pga_tour_value]) => ({ metric_id, pga_tour_value })) },
    golf_coach_insights: { data: rows() },
  };
});

describe('countReads', () => {
  it('counts current findings as costing and current strengths as working; a note and an out-of-date read are neither', () => {
    expect(countReads(rows(), PREVIEW_TOUR, NEWEST)).toEqual({ costing: 2, working: 1 });
    // Before the newest round the stale read is current again, and costs strokes.
    expect(countReads(rows(), PREVIEW_TOUR, null)).toEqual({ costing: 3, working: 1 });
    expect(countReads([], PREVIEW_TOUR, NEWEST)).toEqual({ costing: 0, working: 0 });
  });

  it('equals the coach’s Game profile line on the same reads (readSeen counts with it)', async () => {
    const scope = await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID });
    if (scope.status !== 'ok') throw new Error(scope.status);
    const profile = await loadCoachPlayerProfile({ scope: scope.scope });
    if (profile.status !== 'ready') throw new Error(profile.status);
    expect(profile.data.seen).toEqual({ ...countReads(rows(), PREVIEW_TOUR, scope.scope.lastRound), error: false });
    expect(profile.data.seen).toEqual({ costing: 2, working: 1, error: false });
  });
});

describe('readAreaOf: a read’s category to a Game detail section', () => {
  it('maps the five sections, puts course management under scoring, and draws pressure nowhere', () => {
    expect(readAreaOf('tee')).toBe('tee');
    expect(readAreaOf('approach')).toBe('approach');
    expect(readAreaOf('short_game')).toBe('short');
    expect(readAreaOf('putting')).toBe('putting');
    expect(readAreaOf('scoring')).toBe('scoring');
    expect(readAreaOf('course_management')).toBe('scoring');
    expect(readAreaOf('pressure')).toBeNull();
    expect(readAreaOf(null)).toBeNull();
  });
});
