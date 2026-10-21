import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Game detail's "CoachHelm sees…" reads (P005, spec D build A): counts per section from the visible reads, a coach's only through
 * the branded scope, a player's only for the session's own id, and nothing read at all when the scope or a gate says no.
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
const gates = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: gates.coach, isCoachHelmEnabledForPlayer: gates.player }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForCoach: vi.fn(), getInsightsForPlayer: vi.fn(), getTopInsightsForPlayers: vi.fn(), getThemesForCoach: vi.fn(), getThemesForPlayer: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));
const visibleSpy = vi.hoisted(() => ({ fn: null as null | ReturnType<typeof vi.fn> }));
vi.mock('../coachhelm', async (importOriginal) => {
  const real = await importOriginal<typeof import('../coachhelm')>();
  visibleSpy.fn = vi.fn(real.loadVisible);
  return { ...real, loadVisible: visibleSpy.fn };
});

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { loadCoachPlayerScope, type ChCoachPlayerScope } from '../coachhelm-player';
import { loadStatsReads, readsForScope } from '../stats-reads';
import { bigNumber, MANY_FINDINGS, MANY_STALE, MANY_STRENGTHS, parType, penalties, PREVIEW_TOUR, slope, teeInconclusive } from '../../preview/fixtures-coachhelm';

const COACH = 'c0000000-0000-4000-8000-000000000001';
const TEAM = 'a0000000-0000-4000-8000-000000000001';
const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NEWEST = '2026-10-14';
const on = { effectivelyEnabled: true, disabledBy: null, disabledReason: null };
type Filters = Array<[string, unknown[]]>;
const eqOf = (f: Filters, col: string) => f.find(([k, a]) => k === 'eq' && a[0] === col)?.[1][1];
const visible = () => visibleSpy.fn!;

const mine = (i: EvidenceInsight): EvidenceInsight => ({ ...i, player_id: PID });
const byId = (id: string) => [...MANY_FINDINGS, ...MANY_STRENGTHS].find((i) => i.id === id)!;
/** A pressure read: Standing's, drawn on no Game detail section. */
const pressure = (): EvidenceInsight => ({ ...mine(byId('in-fw')), id: 'in-press', category: 'pressure', evidence: { ...byId('in-fw').evidence, metric: 'pressure_gap' } });

/**
 * Jonah's reads: putting has one finding (slope); course management (penalties, a finding, and big numbers, a strength) and a
 * scoring note count under scoring; one tee finding and a tee note; an approach finding out of date; a pressure read; and a row of
 * someone else's.
 */
const READS = (): EvidenceInsight[] => [slope(PID), penalties(PID), bigNumber(PID), parType(PID), mine(byId('in-fw')), teeInconclusive(PID), mine(MANY_STALE), pressure(), penalties(OTHER, 'in-not-theirs')];

function world(over: Record<string, unknown> = {}) {
  tables.current = {
    golf_team_members: (f) => (eqOf(f, 'team_id') === TEAM && eqOf(f, 'player_id') === PID ? { data: { player_id: PID } } : { data: null }),
    golf_players: { data: { id: PID, first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2028 } },
    // The scope's newest-round read (`.limit(1)`) and newestRounds (`.range`), both answering Oct 14.
    golf_rounds: (f) =>
      f.some(([k]) => k === 'range')
        ? { data: [{ id: 'r1', player_id: PID, round_date: NEWEST, total_score: 74, front_nine: 37, back_nine: 37, holes_played: 18, total_putts: 31 }] }
        : { data: { round_date: NEWEST } },
    golf_teams: { data: { gender: 'mens' } },
    golf_pga_standards: { data: [...PREVIEW_TOUR.values].map(([metric_id, pga_tour_value]) => ({ metric_id, pga_tour_value })) },
    golf_coach_insights: { data: READS() },
    golf_insight_player_feedback: { data: [] },
    ...over,
  } as import('../../__tests__/supabase-fake').ChFakeTables;
}

beforeEach(() => {
  logServer.mockClear();
  visible().mockClear();
  gates.coach.mockReset().mockResolvedValue(on);
  gates.player.mockReset().mockResolvedValue(on);
  world();
});

async function okScope(): Promise<ChCoachPlayerScope> {
  const r = await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID });
  if (r.status !== 'ok') throw new Error(r.status);
  return r.scope;
}

describe('the coach’s reads: the scope first, then the counts', () => {
  it('counts per section; stale and note rows are left out, course management is scoring and pressure is dropped', async () => {
    const out = await loadStatsReads({ role: 'coach', scope: await okScope() });
    if (out.status !== 'ready') throw new Error(out.status);
    expect(Object.keys(out.byArea).sort()).toEqual(['putting', 'scoring', 'tee']);
    expect(out.byArea.scoring).toMatchObject({ costing: 1, working: 1 });
    expect(out.byArea.tee).toMatchObject({ costing: 1, working: 0 });
    expect(out.byArea.putting).toMatchObject({ costing: 1, working: 0 });
    // The out-of-date approach read leaves approach with nothing to say.
    expect(out.byArea.approach).toBeUndefined();
    expect(visible()).toHaveBeenCalledWith(expect.anything(), [PID]);
  });

  it('links to the coach’s Deep dive of the player, on the read itself only when the section has exactly one', async () => {
    const out = await loadStatsReads({ role: 'coach', scope: await okScope() });
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.byArea.scoring?.href).toBe(`/golf/dashboard/coachhelm?view=deep-dive&player=${PID}`);
    expect(out.byArea.tee?.href).toBe(`/golf/dashboard/coachhelm?view=deep-dive&player=${PID}&insight=in-fw`);
    expect(out.byArea.putting?.href).toBe(`/golf/dashboard/coachhelm?view=deep-dive&player=${PID}&insight=in-slope`);
  });

  it('a player not on this coach’s team, or an id that is not one, reads nothing', async () => {
    expect(await readsForScope(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: OTHER }))).toEqual({ status: 'off' });
    expect(await readsForScope(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: 'pl-jonah' }))).toEqual({ status: 'off' });
    expect(visible()).not.toHaveBeenCalled();
  });

  it('CoachHelm off for the coach or for the player reads nothing and draws nothing', async () => {
    gates.coach.mockResolvedValue({ effectivelyEnabled: false, disabledBy: 'user', disabledReason: null });
    expect(await readsForScope(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID }))).toEqual({ status: 'off' });
    gates.coach.mockResolvedValue(on);
    gates.player.mockResolvedValue({ effectivelyEnabled: false, disabledBy: 'coach', disabledReason: null });
    expect(await readsForScope(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID }))).toEqual({ status: 'off' });
    expect(visible()).not.toHaveBeenCalled();
  });

  it('a scope check that did not load is failed, and reads nothing', async () => {
    tables.current = { ...tables.current, golf_team_members: { error: { message: 'boom' } } };
    expect(await readsForScope(await loadCoachPlayerScope({ coachId: COACH, teamId: TEAM, playerId: PID }))).toEqual({ status: 'failed' });
    expect(visible()).not.toHaveBeenCalled();
  });

  it('a Tour baseline that does not load is failed: cohort comparisons would read as findings and the counts would be wrong', async () => {
    const scope = await okScope();
    world({ golf_pga_standards: { error: { message: 'boom' } } });
    expect(await loadStatsReads({ role: 'coach', scope })).toEqual({ status: 'failed' });
    world({ golf_pga_standards: { error: { message: 'boom' } }, golf_team_members: { data: { team_id: TEAM, golf_teams: { gender: 'mens' } } } });
    expect(await loadStatsReads({ role: 'player', playerId: PID })).toEqual({ status: 'failed' });
  });

  it('visible reads that fail are failed, never "no reads"; so are newest rounds that fail', async () => {
    const scope = await okScope();
    world({ golf_coach_insights: { error: { message: 'boom' } } });
    expect(await loadStatsReads({ role: 'coach', scope })).toEqual({ status: 'failed' });
    world({ golf_rounds: { error: { message: 'boom' } } });
    expect(await loadStatsReads({ role: 'coach', scope })).toEqual({ status: 'failed' });
  });

  it('takes the branded scope only: a raw id, or an object shaped like one, does not compile', () => {
    const fake = { coachId: COACH, teamId: TEAM, playerId: OTHER, head: { playerId: OTHER, name: 'X', first: 'X', line: '' }, lastRound: null };
    // @ts-expect-error a raw id is not a scope
    void (() => loadStatsReads({ role: 'coach', scope: OTHER }));
    // @ts-expect-error an object shaped like one is not either
    void (() => loadStatsReads({ role: 'coach', scope: fake }));
    // @ts-expect-error nor does the coach's read take a player id
    void (() => loadStatsReads({ role: 'coach', playerId: OTHER }));
    expect(visible()).not.toHaveBeenCalled();
  });
});

describe('the player’s own reads', () => {
  it('reads the session’s id, hides the reads they dismissed, and links to their own Deep dive', async () => {
    world({
      golf_team_members: { data: { team_id: TEAM, golf_teams: { gender: 'mens' } } },
      golf_insight_player_feedback: { data: [{ insight_id: 'in-slope', rating: 'dismissed', created_at: '2026-10-15T00:00:00Z' }] },
    });
    const out = await loadStatsReads({ role: 'player', playerId: PID });
    expect(gates.player).toHaveBeenCalledWith(PID);
    expect(visible()).toHaveBeenCalledWith(expect.anything(), [PID]);
    if (out.status !== 'ready') throw new Error(out.status);
    // Their dismissed putting read is gone, so putting says nothing.
    expect(out.byArea.putting).toBeUndefined();
    expect(out.byArea.tee).toEqual({ costing: 1, working: 0, href: '/golf/dashboard/coachhelm?view=deep-dive&insight=in-fw' });
    expect(out.byArea.scoring).toEqual({ costing: 1, working: 1, href: '/golf/dashboard/coachhelm?view=deep-dive' });
  });

  it('CoachHelm off for the player reads nothing; a gate or feedback read that fails is failed', async () => {
    gates.player.mockResolvedValue({ effectivelyEnabled: false, disabledBy: 'team', disabledReason: null });
    expect(await loadStatsReads({ role: 'player', playerId: PID })).toEqual({ status: 'off' });
    expect(visible()).not.toHaveBeenCalled();
    gates.player.mockRejectedValueOnce(new Error('down'));
    expect(await loadStatsReads({ role: 'player', playerId: PID })).toEqual({ status: 'failed' });
    gates.player.mockResolvedValue(on);
    world({ golf_insight_player_feedback: { error: { message: 'boom' } } });
    expect(await loadStatsReads({ role: 'player', playerId: PID })).toEqual({ status: 'failed' });
  });
});
