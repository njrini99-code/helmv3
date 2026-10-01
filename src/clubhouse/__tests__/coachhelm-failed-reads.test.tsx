import { LazyMotion, domAnimation } from 'framer-motion';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CoachHelm (P013), the owner's rule 1 (2026-10-01): a read that failed is never drawn as "none", "nothing flagged", "not
 * assigned", "no comparison" or "up to date". Every read beside the board's top card is failed here, one at a time, through the
 * loader (`supabase-fake`) and then the screen, and what is drawn is the failure and never the empty or zero copy, and never Assign.
 * Codes: CH-13206, CH-13207, CH-13208, CH-13226 and CH-13272 (docs/clubhouse/catalog/coachhelm.md).
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
const delivery = vi.hoisted(() => ({ feed: vi.fn(), heads: vi.fn(), themes: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: delivery.feed, getTopInsightsForPlayers: delivery.heads, getThemesForPlayer: delivery.themes }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => []), loadRecentlyAchievedGoals: vi.fn(async () => []) }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: vi.fn(), isCoachHelmEnabledForCoach: vi.fn() }));
const pulseRead = vi.hoisted(() => ({ pulse: vi.fn(), context: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: pulseRead.pulse, getCoachChatContext: pulseRead.context }));
const standingRead = vi.hoisted(() => ({ load: vi.fn(), cohort: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadPlayerStandingMap: standingRead.load }));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({ loadPlayerCohort: standingRead.cohort }));

import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { getProgramPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
import { createClient } from '@/lib/supabase/server';
import { loadCoachCoachHelm, loadPlayerCoachHelm } from '../data/coachhelm';
import { pulseLanded } from './coachhelm-pulse';
import { loadAskCoachHelm } from '../data/coachhelm-chat';
import { loadPlayerDeepDive } from '../data/coachhelm-dive';
import { loadPlayerStanding } from '../data/coachhelm-standing';
import { pulseItemsThatStand, pulseMissing, type ChCoachHelmData, type ChPlayerHelm, type ChPulse } from '../data/coachhelm-shape';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { Standing } from '../screens/coachhelm/views/Standing';
import { AskHome } from '../screens/coachhelm/chat/Home';
import { bigNumber, HELM_PLAYERS, penalties, slope } from '../preview/fixtures-coachhelm';
import { PREVIEW_STANDING } from '../preview/fixtures-coachhelm-views';
import { ToastProvider } from '../ui/Toast';

const jonah = HELM_PLAYERS.jonah;
const eli = HELM_PLAYERS.eli;
const on = { userEnabled: true, teamEnabled: true, effectivelyEnabled: true, disabledReason: null, disabledBy: null } as const;
type Filters = Array<[string, unknown[]]>;
const has = (f: Filters, key: string, col: string, value: unknown) => f.some(([k, a]) => k === key && a[0] === col && a[1] === value);

const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const button = (name: RegExp) => screen.queryByRole('button', { name });
const refreshedOn = (i: EvidenceInsight, iso: string): EvidenceInsight => ({ ...i, metadata: { last_refreshed_at: iso } });
const countable = (player_id: string, round_date: string) => ({ id: `r-${round_date}`, player_id, round_date, total_score: 80, front_nine: 40, back_nine: 40, holes_played: 18, total_putts: 31 });
const pulseOf = (items: unknown[], over: Record<string, unknown> = {}) => ({ items, latest_round_at: null, players_without_rounds: 0, players_with_recent_rounds: 2, recent_window_days: 30, active_roster: 2, as_of: '2026-10-14T12:00:00Z', ...over });

beforeEach(() => {
  logServer.mockClear();
  router.refresh.mockClear();
  for (const m of [delivery.feed, delivery.heads, delivery.themes, pulseRead.pulse, pulseRead.context, standingRead.load, standingRead.cohort, vi.mocked(isCoachHelmEnabledForCoach), vi.mocked(isCoachHelmEnabledForPlayer)]) m.mockReset();
});
afterEach(() => {
  cleanup();
  tables.current = {};
});

// ── The coach's board ──────────────────────────────────────────────────────

describe('the coach’s board, with a read beside the top card failed', () => {
  // Jonah's top card was refreshed before his newest round, so the rounds read is made (the floor for it is the refresh day).
  const top = refreshedOn(slope(jonah.id), '2026-09-28T02:30:43Z');
  const base = (): ChFakeTablesLike => ({
    golf_team_members: { data: [{ player_id: jonah.id }, { player_id: eli.id }] },
    golf_players: {
      data: [
        { id: eli.id, first_name: 'Eli', last_name: 'Brandt' },
        { id: jonah.id, first_name: 'Jonah', last_name: 'Okafor' },
      ],
    },
    golf_coach_insights: { data: [top, penalties(eli.id, 'in-pen-eli')] },
    golf_drills: { data: [{ id: 'dr-ladder', description: 'Start 2 ft below the hole.' }] },
    golf_player_focus_areas: { data: [] },
    golf_teams: { data: { gender: 'mens' } },
    golf_pga_standards: { data: [{ metric_id: 'penalty_rate_per_round', pga_tour_value: 0.3 }] },
    golf_rounds: { data: [countable(jonah.id, '2026-09-30')] },
  });
  type ChFakeTablesLike = typeof tables.current;
  // The loader hands the pulse over still on its way (CH-13405); these tests are about what the board says, so it is handed the one that landed.
  type Landed = Omit<ChCoachHelmData, 'pulse'> & { pulse: ChPulse };
  const load = async (): Promise<Landed> => {
    const d = await loadCoachCoachHelm({ coachId: 'c1', teamId: 't1' });
    return { ...d, pulse: await pulseLanded(d) };
  };
  const show = (d: ChCoachHelmData) => render(wrap(<CoachBoard data={d} />));

  beforeEach(() => {
    vi.mocked(isCoachHelmEnabledForCoach).mockResolvedValue({ ...on });
    delivery.heads.mockResolvedValue(
      new Map([
        [jonah.id, [top]],
        [eli.id, [penalties(eli.id, 'in-pen-eli')]],
      ]),
    );
    pulseRead.pulse.mockResolvedValue(pulseOf([]));
    pulseRead.context.mockResolvedValue({ roster: [{ id: jonah.id }, { id: eli.id }] });
    tables.current = base();
  });

  it('every read landing is a board with nothing marked missing (the shape is what it was) and Assign on offer', async () => {
    const d = await load();
    expect(d.missing).toBeUndefined();
    show(d);
    expect(button(/assign as focus/i)).not.toBeNull();
    expect(code('CH-13207')).toBeNull();
    expect(code('CH-13208')).toBeNull();
  });

  it('CH-13207 the assigned read failing: Assign is not offered, the focus status could not be checked, Dismiss stays, and Try again asks the server again', async () => {
    tables.current = { ...base(), golf_player_focus_areas: () => ({ error: { message: 'boom' } }) };
    const d = await load();
    expect(d.missing).toMatchObject({ assigned: true, declined: true });
    show(d);
    expect(button(/assign as focus/i)).toBeNull();
    expect(button(/propose again/i)).toBeNull();
    expect(code('CH-13207')?.textContent).toMatch(/already has a focus from this read, or declined one, couldn’t be checked/);
    expect(button(/dismiss/i)).not.toBeNull();
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'assigned', expect.anything(), 'coachhelm');
  });

  it('CH-13207 only the assigned read failing (the declined one landed) is the same: Assign is not offered', async () => {
    tables.current = { ...base(), golf_player_focus_areas: (f) => (has(f, 'eq', 'status', 'declined') ? { data: [] } : { error: { message: 'boom' } }) };
    const d = await load();
    expect(d.missing).toEqual({ assigned: true });
    show(d);
    expect(button(/assign as focus/i)).toBeNull();
    expect(code('CH-13207')).not.toBeNull();
  });

  it('CH-13207 only the declined read failing (the assigned one landed) does not offer Assign, nor hide Propose again as if never declined', async () => {
    tables.current = { ...base(), golf_player_focus_areas: (f) => (has(f, 'eq', 'status', 'declined') ? { error: { message: 'boom' } } : { data: [] }) };
    const d = await load();
    expect(d.missing).toEqual({ declined: true });
    show(d);
    expect(button(/assign as focus/i)).toBeNull();
    expect(button(/propose again/i)).toBeNull();
    expect(code('CH-13207')).not.toBeNull();
    expect(code('CH-13907')).toBeNull();
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'declined', expect.anything(), 'coachhelm');
  });

  it('CH-13207 the declined read landing with a decline still says so and offers Propose again (the rule is not weakened)', async () => {
    // No round newer than the read, so it is current: a stale read is not assignable at all (CH-13906).
    tables.current = { ...base(), golf_rounds: { data: [] }, golf_player_focus_areas: (f) => (has(f, 'eq', 'status', 'declined') ? { data: [{ from_insight_id: 'in-slope' }] } : { data: [] }) };
    const d = await load();
    expect(d.missing).toBeUndefined();
    // The decline is Jonah's: Roster's View insights opens the board on him.
    render(wrap(<CoachBoard data={d} initialPlayer={jonah.id} />));
    expect(button(/propose again/i)).not.toBeNull();
    expect(code('CH-13907')).not.toBeNull();
  });

  it('CH-13207 the newest-round read failing: the board does not draw a clean one (out of date is unknown), and does not offer Assign on a read that may be stale', async () => {
    tables.current = { ...base(), golf_rounds: { error: { message: 'boom' } } };
    const d = await load();
    expect(d.missing).toEqual({ newest: true });
    expect(d.players.error).toBe(false);
    show(d);
    expect(code('CH-13208')?.textContent).toMatch(/older than a newer round could not be checked, so a read and the counts may be out of date/);
    expect(code('CH-13207')?.textContent).toMatch(/still current couldn’t be checked/);
    expect(button(/assign as focus/i)).toBeNull();
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'newestRounds', expect.anything(), 'coachhelm');
  });

  it('CH-13208 the Tour read failing says "Tour comparison unavailable", on the board, not "no comparison"', async () => {
    tables.current = { ...base(), golf_pga_standards: { error: { message: 'boom' } } };
    const d = await load();
    expect(d.missing).toEqual({ tour: true });
    show(d);
    expect(code('CH-13208')?.textContent).toMatch(/Tour comparison unavailable/);
    // The Tour does not stop Assign: its reads landed.
    expect(button(/assign as focus/i)).not.toBeNull();
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'tourBenchmarks', expect.anything());
  });

  it('CH-13208 the team read failing (no tour to ask for) is the same: Tour comparison unavailable', async () => {
    tables.current = { ...base(), golf_teams: { error: { message: 'boom' } } };
    const d = await load();
    expect(d.missing).toEqual({ tour: true });
    expect(d.players.error).toBe(false);
  });

  it('CH-13208 the drills read failing says the drill text is missing: "This week" is not just drawn short', async () => {
    tables.current = { ...base(), golf_drills: { error: { message: 'boom' } } };
    const d = await load();
    expect(d.missing).toEqual({ drills: true });
    show(d);
    expect(code('CH-13208')?.textContent).toMatch(/drill text is missing/);
    expect(button(/assign as focus/i)).not.toBeNull();
  });

  it('a tour with no rows (an empty answer, not a failed one) is no failure: nothing is marked missing', async () => {
    tables.current = { ...base(), golf_pga_standards: { data: [] } };
    expect((await load()).missing).toBeUndefined();
  });

  describe('the pulse', () => {
    const noRounds = { id: 'coverage-no-rounds', headline: '2 players have no recorded rounds', evidence: 'Jonah, Eli', tone: 'attention', weight: 55 };
    const rsvp = { id: 'rsvp-ev1', headline: '2 players have not responded for Hilltop', evidence: 'Sat 8:00 AM', tone: 'attention', weight: 85 };

    it('CH-13206 a rounds read that failed: "N players have no recorded rounds" is not said, and the board is not "nothing is flagged"', async () => {
      // What a rounds read that errored leaves: no rounds at all, so every player reads as one without.
      pulseRead.pulse.mockResolvedValue(pulseOf([noRounds], { players_without_rounds: 2, players_with_recent_rounds: 0, failed: ['rounds'] }));
      const d = await load();
      expect(d.pulse.rows).toEqual([]);
      expect(d.pulse.missing).toEqual(['rounds']);
      show(d);
      expect(screen.queryByText(/no recorded rounds/i)).toBeNull();
      expect(code('CH-13309')).toBeNull();
      expect(code('CH-13206')?.textContent).toMatch(/didn’t fully load/);
      expect(code('CH-13206')?.textContent).toMatch(/Rounds didn’t load/);
    });

    it('CH-13206 a tasks read that failed with nothing else to list: not "nothing is flagged" either', async () => {
      pulseRead.pulse.mockResolvedValue(pulseOf([], { failed: ['tasks'] }));
      const d = await load();
      show(d);
      expect(code('CH-13309')).toBeNull();
      expect(code('CH-13206')?.textContent).toMatch(/Tasks didn’t load/);
    });

    it('CH-13206 items that were found still list, with the notice that the pulse may be incomplete', async () => {
      pulseRead.pulse.mockResolvedValue(pulseOf([rsvp, noRounds], { failed: ['rounds'] }));
      const d = await load();
      expect(d.pulse.rows.map((r) => r.id)).toEqual(['rsvp-ev1']);
      show(d);
      expect(screen.getByText(/have not responded for Hilltop/)).not.toBeNull();
      expect(code('CH-13206')?.textContent).toMatch(/may be incomplete/);
    });

    it('CH-13203 a roster read that failed under the pulse: it is the pulse not loading, never "Nothing is flagged" over a roster nobody read', async () => {
      // The pulse resolves its own chat context. With the roster unread that context's roster is empty, and the real `getProgramPulse`
      // answers an empty program with no `failed` at all: that gap is what is under test, so it runs here, over the fake client.
      const unread = { roster: [], roster_failed: true };
      pulseRead.context.mockResolvedValue(unread);
      pulseRead.pulse.mockImplementation(async () => getProgramPulse(await createClient(), unread as never));
      expect(await pulseRead.pulse()).toMatchObject({ items: [], active_roster: 0 });
      expect((await pulseRead.pulse()).failed).toBeUndefined();
      const d = await load();
      expect(d.pulse).toEqual({ rows: [], error: true });
      show(d);
      expect(code('CH-13309')).toBeNull();
      expect(code('CH-13203')).not.toBeNull();
      expect(logServer).toHaveBeenCalledWith('coachhelm', 'pulse', expect.any(Error), 'coachhelm');
    });

    it('CH-13309 a roster that read and is empty (a team of nobody) is not a failed pulse (not weakened)', async () => {
      pulseRead.context.mockResolvedValue({ roster: [] });
      pulseRead.pulse.mockImplementation(async () => getProgramPulse(await createClient(), { roster: [] } as never));
      expect((await load()).pulse).toEqual({ rows: [], error: false });
    });

    it('CH-13309 every read landing and nothing flagged is still "Nothing is flagged" (not weakened)', async () => {
      const d = await load();
      expect(d.pulse).toEqual({ rows: [], error: false });
      show(d);
      expect(code('CH-13309')).not.toBeNull();
      expect(code('CH-13206')).toBeNull();
    });

    it('a signals read that failed leaves no gap on screen (the board draws no signals item): it is not a notice', async () => {
      pulseRead.pulse.mockResolvedValue(pulseOf([], { failed: ['signals'] }));
      const d = await load();
      expect(d.pulse).toEqual({ rows: [], error: false });
    });

    it('the pure steps: an item made from a failed read is dropped (the schedule reads are two), and what each failure leaves missing is named once', () => {
      const items = [{ id: 'coverage-no-rounds' }, { id: 'movement-decline' }, { id: 'rsvp-1' }, { id: 'prep-gap' }, { id: 'focus-stalled' }, { id: 'tasks-overdue' }, { id: 'signals-open' }];
      expect(pulseItemsThatStand(items, undefined)).toHaveLength(7);
      expect(pulseItemsThatStand(items, ['rounds']).map((i) => i.id)).toEqual(['rsvp-1', 'prep-gap', 'focus-stalled', 'tasks-overdue', 'signals-open']);
      expect(pulseItemsThatStand(items, ['attendance']).map((i) => i.id)).toEqual(['coverage-no-rounds', 'movement-decline', 'prep-gap', 'focus-stalled', 'tasks-overdue', 'signals-open']);
      expect(pulseItemsThatStand(items, ['events']).map((i) => i.id)).not.toContain('prep-gap');
      expect(pulseMissing(['events', 'attendance', 'rounds', 'signals'])).toEqual(['schedule', 'rounds']);
    });
  });
});

// ── The player's board and Deep dive ───────────────────────────────────────

describe('the player’s board, with a read beside the cards failed', () => {
  const p1 = jonah.id;
  const top = refreshedOn(slope(p1), '2026-09-28T02:30:43Z');
  const tablesOf = (over: Record<string, unknown> = {}) =>
    ({
      golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'mens' } } },
      golf_pga_standards: { data: [{ metric_id: 'penalty_rate_per_round', pga_tour_value: 0.3 }] },
      golf_drills: { data: [{ id: 'dr-ladder', description: 'Start 2 ft below the hole.' }] },
      golf_player_focus_areas: { data: [] },
      golf_rounds: { data: [countable(p1, '2026-09-30')] },
      ...over,
    }) as typeof tables.current;
  const show = (d: ChPlayerHelm) => render(wrap(<PlayerBoard data={d} />));
  beforeEach(() => {
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
    delivery.feed.mockResolvedValue([top, bigNumber(p1, 'in-dbl')]);
    tables.current = tablesOf();
  });

  it('every read landing marks nothing missing', async () => {
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    expect(d.missing).toBeUndefined();
    show(d);
    expect(code('CH-13208')).toBeNull();
  });

  it('CH-13208 each read failing, in turn, is said on the board: the drills, which cards have a focus, how current each is, the Tour', async () => {
    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ['drills', { golf_drills: { error: { message: 'boom' } } }, /drill text is missing/],
      ['assigned', { golf_player_focus_areas: { error: { message: 'boom' } } }, /already have a focus could not be checked/],
      ['newest', { golf_rounds: { error: { message: 'boom' } } }, /may be out of date/],
      ['tour', { golf_pga_standards: { error: { message: 'boom' } } }, /Tour comparison unavailable/],
    ];
    for (const [key, over, said] of cases) {
      cleanup();
      tables.current = tablesOf(over);
      const d = await loadPlayerCoachHelm({ playerId: p1 });
      expect(d.insights.error, key).toBe(false);
      expect(d.missing, key).toMatchObject({ [key]: true });
      show(d);
      expect(code('CH-13208')?.textContent, key).toMatch(said);
    }
  });

  it('CH-13208 a team read that failed is the Tour unavailable as well as the proposals not loading (CH-13205), never "no comparison"', async () => {
    tables.current = tablesOf({ golf_team_members: { error: { message: 'boom' } } });
    const d = await loadPlayerCoachHelm({ playerId: p1 });
    expect(d.proposals.error).toBe(true);
    expect(d.missing).toMatchObject({ tour: true });
    show(d);
    expect(code('CH-13205')).not.toBeNull();
    expect(code('CH-13208')?.textContent).toMatch(/Tour comparison unavailable/);
  });
});

describe('the Deep dive, with a read beside the insights failed', () => {
  const p1 = jonah.id;
  beforeEach(() => {
    vi.mocked(isCoachHelmEnabledForPlayer).mockResolvedValue({ ...on });
    delivery.feed.mockResolvedValue([slope(p1), bigNumber(p1, 'in-dbl')]);
    delivery.themes.mockResolvedValue({ success: true, data: { themes: [] } });
    tables.current = {
      golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'womens' } } },
      golf_pga_standards: { data: [] },
      golf_drills: { data: [] },
      golf_player_focus_areas: { data: [] },
      golf_rounds: { data: [] },
    } as typeof tables.current;
  });

  it('CH-13208 the team read failing (playerTeam.error) is carried to the page: Tour comparison unavailable, the insights still draw', async () => {
    tables.current = { ...tables.current, golf_team_members: { error: { message: 'boom' } } };
    const res = await loadPlayerDeepDive({ playerId: p1 });
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.missing).toMatchObject({ tour: true });
    expect(res.data.list.length).toBeGreaterThan(0);
    render(wrap(<DeepDive load={res} />));
    expect(code('CH-13208')?.textContent).toMatch(/Tour comparison unavailable/);
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'playerTeam', expect.anything(), 'coachhelm');
  });

  it('every read landing marks nothing missing', async () => {
    const res = await loadPlayerDeepDive({ playerId: p1 });
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.missing).toBeUndefined();
  });
});

// ── Standing: the cohort ───────────────────────────────────────────────────

describe('Standing, with the cohort lookup failed', () => {
  beforeEach(() => {
    tables.current = { golf_player_stats_cache: { data: { rounds_played: 14, scoring_average: 77.2 } } } as typeof tables.current;
    standingRead.load.mockResolvedValue(new Map());
  });

  it('CH-13272 a cohort that fell back to the men’s default is said, not stated as the player’s Tour', async () => {
    standingRead.cohort.mockResolvedValue({ gender: 'mens', level: null, failed: true });
    const res = await loadPlayerStanding({ playerId: 'p1' });
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.cohortFailed).toBe(true);
    render(wrap(<Standing load={{ status: 'ready', data: { ...PREVIEW_STANDING, cohortFailed: true } }} />));
    expect(code('CH-13272')?.textContent).toMatch(/Tour couldn’t be confirmed/);
    expect(code('CH-13272')?.textContent).toMatch(/men’s Tour, the default/);
  });

  it('a cohort that read is not marked (the men’s default for a men’s team is a fact), and one that throws is the failure', async () => {
    standingRead.cohort.mockResolvedValue({ gender: 'mens', level: null });
    const ok = await loadPlayerStanding({ playerId: 'p1' });
    if (ok.status !== 'ready') throw new Error('not ready');
    expect(ok.data.cohortFailed).toBeUndefined();
    standingRead.cohort.mockRejectedValue(new Error('down'));
    const threw = await loadPlayerStanding({ playerId: 'p1' });
    if (threw.status !== 'ready') throw new Error('not ready');
    expect(threw.data.cohortFailed).toBe(true);
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'standing.cohort', expect.any(Error), 'coachhelm');
  });
});

// ── Ask ────────────────────────────────────────────────────────────────────

describe('Ask, with a read failed', () => {
  const ROSTER = [
    { id: 'p1', name: 'Jonah Okafor', first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2027 },
    { id: 'p2', name: 'Eli Brandt', first_name: 'Eli', last_name: 'Brandt', graduation_year: 2028 },
  ];
  const ctx = (over: Record<string, unknown> = {}) => ({ coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Finley University', timezone: 'America/New_York', roster: ROSTER, ...over });
  const rsvp = { id: 'rsvp-1', headline: '2 players have not responded for Hilltop', evidence: 'Sat 8:00 AM · 6 of 8 responded', tone: 'attention', weight: 85, ask: 'Send an RSVP reminder for Hilltop' };
  const noRounds = { id: 'coverage-no-rounds', headline: '2 players have no recorded rounds', evidence: 'Jonah, Eli', tone: 'attention', weight: 55 };
  beforeEach(() => {
    pulseRead.context.mockResolvedValue(ctx());
    pulseRead.pulse.mockResolvedValue(pulseOf([rsvp], { active_roster: 2 }));
    tables.current = { golf_coachhelm_chat_conversations: { data: [] } } as typeof tables.current;
  });

  it('CH-13221 a roster that did not read is the program failing to load, never "Add players to ask CoachHelm"', async () => {
    pulseRead.context.mockResolvedValue(ctx({ roster: [], roster_failed: true }));
    expect(await loadAskCoachHelm()).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm.ask', 'roster', expect.any(Error), 'coachhelm');
  });

  it('CH-13321 a roster that read and is empty is still the first-run page (not weakened)', async () => {
    pulseRead.context.mockResolvedValue(ctx({ roster: [] }));
    expect(await loadAskCoachHelm()).toEqual({ status: 'noRoster', teamName: 'Finley University' });
  });

  it('CH-13226 a rounds read that failed: not "no recorded round", no coverage line, no flagged coverage item, the openers that assert nothing about rounds, and the notice', async () => {
    pulseRead.pulse.mockResolvedValue(pulseOf([noRounds, rsvp], { players_without_rounds: 2, players_with_recent_rounds: 0, failed: ['rounds'] }));
    const res = await loadAskCoachHelm();
    if (res.status !== 'ready') throw new Error('not ready');
    const d = res.data;
    expect(d.noRounds).toBe(false);
    expect(d.pulse?.coverage).toBeNull();
    expect(d.pulse?.findings.map((f) => f.id)).toEqual(['rsvp-1']);
    expect(d.pulse?.missing).toEqual(['rounds']);
    expect(d.suggestions.map((s) => s.id)).toContain('brief');
    expect(d.suggestions.map((s) => s.id)).not.toContain('strokes');
    render(wrap(<AskHome data={d} phone={false} heroComposer={null} onAsk={vi.fn()} />));
    expect(code('CH-13322')).toBeNull();
    expect(code('CH-13325')).toBeNull();
    expect(code('CH-13226')?.textContent).toMatch(/may be incomplete/);
  });

  it('CH-13226 a failed read with no findings found is "didn’t fully load", never "Nothing is flagged right now"', async () => {
    pulseRead.pulse.mockResolvedValue(pulseOf([], { failed: ['tasks'] }));
    const res = await loadAskCoachHelm();
    if (res.status !== 'ready') throw new Error('not ready');
    render(wrap(<AskHome data={res.data} phone={false} heroComposer={null} onAsk={vi.fn()} />));
    expect(code('CH-13325')).toBeNull();
    expect(code('CH-13226')?.textContent).toMatch(/didn’t fully load/);
  });

  it('CH-13322 and CH-13325 with every read landed are as they were: the verified empty states', async () => {
    pulseRead.pulse.mockResolvedValue(pulseOf([], { players_without_rounds: 2, players_with_recent_rounds: 0 }));
    const res = await loadAskCoachHelm();
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.noRounds).toBe(true);
    expect(res.data.pulse?.missing).toBeUndefined();
  });

  it('CH-13223 the phone, which draws no findings, says when the pulse did not load', async () => {
    pulseRead.pulse.mockResolvedValue(null);
    const res = await loadAskCoachHelm();
    if (res.status !== 'ready') throw new Error('not ready');
    expect(res.data.pulse).toBeNull();
    render(wrap(<AskHome data={res.data} phone heroComposer={null} onAsk={vi.fn()} />));
    expect(code('CH-13223')?.textContent).toMatch(/didn’t load/);
    expect(code('CH-13322')).toBeNull();
  });

  it('the phone with a pulse that loaded draws no notice', async () => {
    const res = await loadAskCoachHelm();
    if (res.status !== 'ready') throw new Error('not ready');
    render(wrap(<AskHome data={res.data} phone heroComposer={null} onAsk={vi.fn()} />));
    expect(code('CH-13223')).toBeNull();
  });
});
