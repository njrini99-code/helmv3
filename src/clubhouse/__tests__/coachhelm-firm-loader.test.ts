import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Round 2C through the coach board's loader: with `coachhelm_support_v1` on, a head rated Not enough yet gives way to the player's
 * firm read, the held-back reads come back as `notEnough`, a player all of whose reads are held back has no card and is not counted
 * as a player with no read, and a held-back read is not an open signal. With the flag off the board data is what it was.
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
const delivery = vi.hoisted(() => ({ feed: vi.fn(), heads: vi.fn(), themes: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: delivery.feed, getTopInsightsForPlayers: delivery.heads, getThemesForPlayer: delivery.themes }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: vi.fn(), isCoachHelmEnabledForCoach: vi.fn() }));
const pulseRead = vi.hoisted(() => ({ pulse: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: pulseRead.pulse, getCoachChatContext: pulseRead.context }));
const flags = vi.hoisted(() => ({ support: false }));
vi.mock('../data/coachhelm-engine', async (orig) => ({
  ...(await orig<typeof import('../data/coachhelm-engine')>()),
  readEngineFlags: () => ({ support: flags.support, cause: false, recheck: false, verdicts: false }),
}));

import { isCoachHelmEnabledForCoach } from '@/lib/coachhelm/v2/gate';
import { loadCoachCoachHelm } from '../data/coachhelm';
import { breakBias, HELM_PLAYERS, penalties, slope, teeInconclusive } from '../preview/fixtures-coachhelm';

const { jonah, eli, priya } = HELM_PLAYERS;
const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
const rated = (row: EvidenceInsight, ladder: string): EvidenceInsight => ({
  ...row,
  evidence: { ...row.evidence, ladder, support: { version: 'support_v1', testable: true, n: 14, n_unit: 'attempts', floor: 40, rounds_n: 4, round_floor: 3 } } as EvidenceInsight['evidence'],
});

const jonahSlope = rated(slope(jonah.id), 'observed');
const eliTee = rated(teeInconclusive(eli.id, 'in-tee-eli'), 'not_enough_yet');
const eliPen = rated(penalties(eli.id, 'in-pen-eli'), 'working_hypothesis');
const priyaBreak = rated(breakBias(priya.id, 'in-brk-priya'), 'not_enough_yet');

beforeEach(() => {
  vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
  delivery.heads.mockResolvedValue(
    new Map([
      [jonah.id, [jonahSlope]],
      [eli.id, [eliTee]],
      [priya.id, [priyaBreak]],
    ]),
  );
  pulseRead.pulse.mockResolvedValue({ items: [], latest_round_at: null, players_without_rounds: 0, players_with_recent_rounds: 3, recent_window_days: 30, active_roster: 3, as_of: '2026-10-14T12:00:00Z' });
  pulseRead.context.mockResolvedValue({ roster: [{ id: jonah.id }, { id: eli.id }, { id: priya.id }] });
  tables.current = {
    golf_team_members: { data: [{ player_id: jonah.id }, { player_id: eli.id }, { player_id: priya.id }] },
    golf_players: {
      data: [
        { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor' },
        { id: eli.id, first_name: 'Eli', last_name: 'Brandt' },
        { id: priya.id, first_name: 'Priya', last_name: 'Natarajan' },
      ],
    },
    golf_coach_insights: { data: [jonahSlope, eliTee, eliPen, priyaBreak] },
    golf_drills: { data: [] },
    golf_player_focus_areas: { data: [] },
    golf_teams: { data: { gender: 'mens' } },
    golf_pga_standards: { data: [] },
    golf_rounds: { data: [] },
  };
});
afterEach(() => {
  tables.current = {};
  flags.support = false;
});

describe('the coach board loader with reads rated Not enough yet', () => {
  it('flag off: the delivery’s heads are the cards and nothing is held back', async () => {
    const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
    expect(d.players.list.map((p) => p.top.id).sort()).toEqual(['in-brk-priya', 'in-slope', 'in-tee-eli']);
    expect(d.notEnough).toBeUndefined();
  });

  it('flag on: a held-back head gives way to the firm read, the rest is one list, and an all-held player has no card', async () => {
    flags.support = true;
    const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
    expect(d.players.list.map((p) => [p.id, p.top.id])).toEqual(
      expect.arrayContaining([
        [jonah.id, 'in-slope'],
        [eli.id, 'in-pen-eli'],
      ]),
    );
    expect(d.players.list.some((p) => p.id === priya.id)).toBe(false);
    expect(d.notEnough?.count).toBe(2);
    expect(d.notEnough?.players.map((p) => [p.id, p.card, p.reads.map((r) => r.id)])).toEqual([
      [eli.id, true, ['in-tee-eli']],
      [priya.id, false, ['in-brk-priya']],
    ]);
    expect(d.notEnough?.players[1]?.reads[0]?.watching).toBe('Watching: 14 attempts so far. 26 more and this read can say something.');
    // Priya has reads, held back: she is not a player with no read yet.
    expect(d.withoutSignals).toBe(0);
    expect(d.withoutNames).toEqual([]);
  });
});
