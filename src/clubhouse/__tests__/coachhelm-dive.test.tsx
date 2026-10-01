import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The player's Deep dive (P013, ?view=deep-dive): each insight in full, the loader that reads it for the signed-in player, and every numbered state. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));
const delivery = vi.hoisted(() => ({ insights: vi.fn(), themes: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForPlayer: delivery.insights, getTopInsightsForPlayers: vi.fn(), getThemesForPlayer: delivery.themes }));
const goals = vi.hoisted(() => ({ active: vi.fn(), achieved: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: goals.active, loadRecentlyAchievedGoals: goals.achieved }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: vi.fn(), isCoachHelmEnabledForCoach: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn() }));
/** Whether the screens a link would lead to (a round's review, Stats' Development) are rebuilt for a player. */
const nav = vi.hoisted(() => ({ rebuilt: true }));
vi.mock('../shell/nav', async (orig) => ({ ...(await orig<typeof import('../shell/nav')>()), rebuiltHref: (href: string) => (nav.rebuilt ? href : null) }));

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { AssembledThemes, ThemeNode } from '@/lib/coachhelm/v3/themes/types';
import { loadPlayerDeepDive } from '../data/coachhelm-dive';
import {
  DIVE_ROUNDS_READ,
  DIVE_ROUNDS_SHOWN,
  diveCounts,
  orderDive,
  roundIdsToRead,
  themesByCategory,
  type ChDeepDive,
  type ChDeepInsight,
  type DiveRoundRow,
} from '../data/coachhelm-dive-shape';
import { toChInsight } from '../data/coachhelm-map';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { DiveSkeleton } from '../screens/coachhelm/views/Skeletons';
import { puttBalanced } from '../preview/fixtures-coachhelm';
import {
  deep,
  DIVE_BIG,
  DIVE_BREAK,
  DIVE_FOCUS,
  DIVE_GOALS,
  DIVE_PENALTIES,
  DIVE_ROUND_ROWS,
  DIVE_SLOPE,
  DIVE_THEMES,
  diveLoad,
  diveOf,
  FULL_INPUTS,
  PREVIEW_DIVE,
  PREVIEW_DIVE_EMPTY,
  PREVIEW_DIVE_NO_ROUNDS,
  PREVIEW_DIVE_PARTS_FAILED,
  PREVIEW_DIVE_YOUNG,
} from '../preview/fixtures-coachhelm-views';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <div className="ch-root" data-ui="clubhouse">
      {node}
    </div>
  </LazyMotion>
);
const by = (d: ChDeepDive, id: string) => d.list.find((i) => i.base.id === id)!;

beforeEach(() => {
  phoneState.on = false;
  nav.rebuilt = true;
  router.push.mockClear();
  router.refresh.mockClear();
  hapticSpy.mockClear();
  logServer.mockClear();
  delivery.insights.mockReset();
  delivery.themes.mockReset();
  goals.active.mockReset();
  goals.achieved.mockReset();
  tables.current = {};
});
afterEach(cleanup);

describe('the deep dive as the page draws it', () => {
  it('findings first (a current read before one that is out of date), then what is working, in the feed’s own order', () => {
    expect(PREVIEW_DIVE.list.map((i) => i.base.id)).toEqual(['in-slope', 'in-pen', 'in-brk', 'in-dbl']);
    const stale = (i: ChDeepInsight): ChDeepInsight => ({ ...i, base: { ...i.base, stale: { newestRound: 'Sep 28' } } });
    const [slope, pen, brk, big] = PREVIEW_DIVE.list as [ChDeepInsight, ChDeepInsight, ChDeepInsight, ChDeepInsight];
    expect(orderDive([big, stale(slope), pen, brk]).map((i) => i.base.id)).toEqual(['in-pen', 'in-brk', 'in-slope', 'in-dbl']);
  });

  it('the counts: reads, how many need work, how many are working, how many are in a plan (a live focus area or an active goal)', () => {
    expect(PREVIEW_DIVE.counts).toEqual({ insights: 4, needs: 3, working: 1, inPlan: 2 });
    expect(diveCounts([])).toEqual({ insights: 0, needs: 0, working: 0, inPlan: 0 });
    const done = deep(DIVE_SLOPE, { ...FULL_INPUTS, focusAreas: [{ ...DIVE_FOCUS[0]!, status: 'completed' }], goals: [] });
    expect(diveCounts([done]).inPlan).toBe(0);
  });

  it('what was measured: the metric’s label, the generator’s own number, and the span in dates, or All rounds for a lifetime read', () => {
    expect(by(PREVIEW_DIVE, 'in-slope').measured).toEqual({ label: 'Downhill penalty vs level putts (distance-controlled)', value: '23 pts', span: 'Jul 5 to Oct 1' });
    expect(by(PREVIEW_DIVE, 'in-pen').measured.span).toBe('All rounds');
    // A read that names no dates says none rather than guessing.
    expect(by(PREVIEW_DIVE, 'in-brk').measured.span).toBeNull();
  });

  it('the stance is the Board’s own pill: Worth closing, Priority, Working; and a strength is a strength', () => {
    expect(PREVIEW_DIVE.list.map((i) => i.stance.word)).toEqual(['Worth closing', 'Priority', 'Worth closing', 'Working']);
    expect(by(PREVIEW_DIVE, 'in-dbl').base.kind).toBe('strength');
  });

  it('the movement is in the stat’s own unit (points for a share, never a percent of a percent), toned by the metric’s own direction: down is good where lower is better, and amber where higher is', () => {
    expect(by(PREVIEW_DIVE, 'in-slope').movement).toEqual({ text: 'From 31% to 23%, down 8 pts', tone: 'good' });
    expect(by(PREVIEW_DIVE, 'in-dbl').movement).toEqual({ text: 'From 3.1% to 1.6%, down 1.5 pts', tone: 'good' });
    const higher: EvidenceInsight = { ...DIVE_SLOPE, evidence: { ...DIVE_SLOPE.evidence, polarity: 'higher_better' } };
    expect(deep(higher, FULL_INPUTS).movement?.tone).toBe('warn');
    // No movement, or one without both ends, is no movement.
    expect(by(PREVIEW_DIVE, 'in-brk').movement).toBeNull();
    const broken: EvidenceInsight = { ...DIVE_SLOPE, metadata: { movement: { from: 31, to: Number.NaN, direction: 'down', percent_change: -0.26 } } };
    expect(deep(broken, FULL_INPUTS).movement).toBeNull();
  });

  it('a movement is said in the unit of the stat: a share in points (whether stored as a fraction or a number), a count plain, strokes and distances with their unit; none when it rounds to no change', () => {
    const moved = (unit: 'percent' | 'count' | 'strokes' | 'feet', from: number, to: number) => {
      const raw: EvidenceInsight = { ...DIVE_SLOPE, evidence: { ...DIVE_SLOPE.evidence, unit }, metadata: { movement: { from, to, direction: to > from ? 'up' : 'down', percent_change: (to - from) / from } } };
      return deep(raw, FULL_INPUTS).movement?.text ?? null;
    };
    expect(moved('percent', 0.52, 0.58)).toBe('From 52% to 58%, up 6 pts');
    expect(moved('percent', 52, 58.4)).toBe('From 52% to 58.4%, up 6.4 pts');
    expect(moved('count', 3.1, 1.6)).toBe('From 3.1 to 1.6, down 1.5');
    expect(moved('strokes', 0.3, -0.1)).toBe('From +0.3 to −0.1, down 0.4 strokes');
    expect(moved('feet', 38, 31)).toBe('From 38 ft to 31 ft, down 7 ft');
    expect(moved('percent', 31, 31.04)).toBeNull();
  });

  it('the outcome: Improved, No change or Got worse, with the day it was measured; nothing when it was not', () => {
    expect(by(PREVIEW_DIVE, 'in-dbl').outcome).toEqual({ word: 'Improved', tone: 'good', when: 'Sep 28' });
    expect(by(PREVIEW_DIVE, 'in-slope').outcome).toBeNull();
    const worse = deep({ ...DIVE_BIG, outcome_status: 'worsened' }, FULL_INPUTS);
    expect(worse.outcome).toMatchObject({ word: 'Got worse', tone: 'warn' });
    expect(deep({ ...DIVE_BIG, outcome_status: 'no_change', outcome_measured_at: null }, FULL_INPUTS).outcome).toEqual({ word: 'No change', tone: 'plain', when: null });
  });

  it('CH-13982 the diagnosis: a cause seen in a shot sequence is measured, one inferred from standings is a hypothesis; the drivers carry their counts', () => {
    expect(by(PREVIEW_DIVE, 'in-pen').diagnosis).toMatchObject({
      level: 'observed',
      drivers: [
        { label: 'Penalties off the tee, per round', value: '0.8', n: 17 },
        { label: 'Penalties from the approach, per round', value: '0.3', n: 6 },
      ],
      reason: 'Twenty-one rounds is enough to trust an average this size',
    });
    expect(by(PREVIEW_DIVE, 'in-slope').diagnosis?.level).toBe('hypothesis');
    // No stated cause is no diagnosis, never an empty box.
    expect(by(PREVIEW_DIVE, 'in-brk').diagnosis).toBeNull();
    const blank: EvidenceInsight = { ...DIVE_SLOPE, evidence: { ...DIVE_SLOPE.evidence, diagnosis: { ...DIVE_SLOPE.evidence.diagnosis!, root_cause: '  ' } } };
    expect(deep(blank, FULL_INPUTS).diagnosis).toBeNull();
  });

  it('what closing the gap is worth comes only from a cascade cause that has a number, and says what it is closed to: the team’s average, or the Tour when there was no team average to anchor on', () => {
    expect(by(PREVIEW_DIVE, 'in-pen').closes).toEqual({ strokes: '0.9', anchor: 'team' });
    expect(by(PREVIEW_DIVE, 'in-slope').closes).toBeNull();
    const cause = (over: object) => ({ ...DIVE_THEMES, themes: [{ ...DIVE_THEMES.themes[1]!, causes: [{ ...DIVE_THEMES.themes[1]!.causes[0]!, ...over }] }] }) as AssembledThemes;
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, themes: cause({ counterfactualSuppressed: true }) }).closes).toBeNull();
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, themes: cause({ strokesSavedPerRound: 0 }) }).closes).toBeNull();
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, themes: null }).closes).toBeNull();
    // No team average (no team, or a stat the team has no value for): the cascade carries the whole Tour gap, and the page says Tour.
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, themes: cause({ strokesSavedPerRound: 1.4, standingTeamAvgValue: null }) }).closes).toEqual({ strokes: '1.4', anchor: 'tour' });
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, themes: cause({ standingPlayerValue: null }) }).closes?.anchor).toBe('tour');
  });

  it('the rounds behind a read: the newest, newest first, of the total it names, with the true minus and a nine marked', () => {
    const r = by(PREVIEW_DIVE, 'in-slope').rounds;
    expect(r.total).toBe(14);
    expect(r.list).toHaveLength(DIVE_ROUNDS_SHOWN);
    expect(r.list[0]).toMatchObject({ id: 'rd-01', date: 'Sep 28', course: 'Oak Hollow', score: '74', toPar: '+2', nine: false, href: '/golf/dashboard/rounds/rd-01' });
    expect(r.list.map((x) => x.toPar)).toEqual(['+2', '+5', 'E', '+3', '−1', '+7', '+2', '+6']);
    expect(r.list[6]).toMatchObject({ nine: true, toPar: '+2', toPar18: 4 });
    // The strip is to par per 18 holes, oldest to newest.
    expect(r.strip).toEqual([6, 4, 7, -1, 3, 0, 5, 2]);
    expect(by(PREVIEW_DIVE, 'in-pen').rounds.total).toBe(21);
  });

  it('a round with no review screen yet has no link; a read that names no rounds lists none; the strip needs three rounds', () => {
    nav.rebuilt = false;
    expect(deep(DIVE_SLOPE, FULL_INPUTS).rounds.list.every((x) => x.href === null)).toBe(true);
    nav.rebuilt = true;
    expect(by(PREVIEW_DIVE, 'in-brk').rounds).toEqual({ total: 0, list: [], strip: [] });
    const two = new Map(DIVE_ROUND_ROWS.slice(0, 2).map((x) => [x.id, x]));
    const few = deep(DIVE_SLOPE, { ...FULL_INPUTS, rounds: two }).rounds;
    expect(few.list).toHaveLength(2);
    expect(few.strip).toEqual([]);
    expect(few.total).toBe(14);
  });

  it('a round that could not be read is left out, never drawn as a zero', () => {
    const missing = new Map(DIVE_ROUND_ROWS.filter((x) => x.id !== 'rd-02').map((x) => [x.id, x]));
    const list = deep(DIVE_SLOPE, { ...FULL_INPUTS, rounds: missing }).rounds.list;
    expect(list.map((x) => x.id)).not.toContain('rd-02');
    const noScore: DiveRoundRow = { ...DIVE_ROUND_ROWS[0]!, total_score: null, score_to_par: null };
    const row = deep(DIVE_SLOPE, { ...FULL_INPUTS, rounds: new Map([[noScore.id, noScore]]) }).rounds.list[0]!;
    expect(row).toMatchObject({ score: '—', toPar: null, toPar18: null });
  });

  it('only the newest ids a read names are asked for, and anything that is not an id is dropped', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `r${i}`);
    expect(roundIdsToRead({ source_round_ids: ids })).toEqual(ids.slice(0, DIVE_ROUNDS_READ));
    expect(roundIdsToRead({ source_round_ids: ['a', 3 as unknown as string, 'b'] })).toEqual(['a', 'b']);
    expect(roundIdsToRead({})).toEqual([]);
    expect(roundIdsToRead(undefined)).toEqual([]);
  });

  it('the plan: the focus area or goal made from a read first, else one on the same stat (a live focus area before a finished one)', () => {
    expect(by(PREVIEW_DIVE, 'in-slope').plan).toEqual({ focus: { id: 'fa-1', title: 'Downhill putts inside 6 ft', word: 'Active', live: true, fromThis: true }, goal: null });
    expect(by(PREVIEW_DIVE, 'in-pen').plan).toEqual({
      focus: null,
      goal: { id: 'gl-1', title: 'Cut penalties to 0.8 a round', word: 'Active', line: 'Now 1.1, target 0.8, by Nov 15', fromThis: true },
    });
    expect(by(PREVIEW_DIVE, 'in-brk').plan).toEqual({ focus: null, goal: null });
    const onStat = (id: string, status: string, from: string | null) => ({ id, title: id, status, from_insight_id: from, target_metric: 'penalty_rate_per_round' });
    const plan = deep(DIVE_PENALTIES, { ...FULL_INPUTS, goals: [], focusAreas: [onStat('old', 'completed', null), onStat('live', 'paused', null)] }).plan;
    expect(plan.focus).toMatchObject({ id: 'live', live: true, fromThis: false });
    const own = deep(DIVE_PENALTIES, { ...FULL_INPUTS, goals: [], focusAreas: [onStat('live', 'active', null), onStat('mine', 'proposed', 'in-pen')] }).plan;
    expect(own.focus).toMatchObject({ id: 'mine', word: 'Proposed to you', fromThis: true });
    // A status the page has no word for is not drawn as a plan.
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, goals: [], focusAreas: [onStat('x', 'declined', 'in-pen')] }).plan.focus).toBeNull();
  });

  it('a goal on the same stat is shown by its own state; one from this read comes first; a finished goal is Achieved', () => {
    const goal = (over: Partial<Goal>): Goal => ({ ...DIVE_GOALS[0]!, origin_insight_id: null, ...over });
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, goals: [goal({ id: 'g2', state: 'achieved', title: 'Done' })] }).plan.goal).toMatchObject({ id: 'g2', word: 'Achieved', fromThis: false });
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, goals: [goal({ id: 'g2' }), goal({ id: 'g3', origin_insight_id: 'in-pen' })] }).plan.goal).toMatchObject({ id: 'g3', fromThis: true });
    expect(deep(DIVE_PENALTIES, { ...FULL_INPUTS, goals: [goal({ id: 'g4', state: 'abandoned' })] }).plan.goal).toBeNull();
  });

  it('the category reads: where the category stands, and with enough rounds which way it moves, in words', () => {
    const t = themesByCategory(DIVE_THEMES);
    expect(t.putting).toEqual({
      label: 'Putting',
      state: 'leak',
      sg: '−0.42',
      trend: { word: 'Improving', tone: 'good', text: 'Putting: strokes gained averaged −0.31 a round over your last 5 rounds, against −0.62 over the 5 before' },
    });
    expect(t.course_management?.trend).toBeNull();
    const node = (direction: 'improving' | 'declining' | 'steady'): ThemeNode => ({
      ...DIVE_THEMES.themes[0]!,
      trend: { direction, recentAvg: 0.1, priorAvg: 0.2, delta: -0.1, recentN: 4, priorN: 4 },
    });
    const word = (d: 'improving' | 'declining' | 'steady') => themesByCategory({ ...DIVE_THEMES, themes: [node(d)] }).putting!.trend;
    expect(word('declining')).toMatchObject({ word: 'Slipping', tone: 'warn' });
    expect(word('steady')).toMatchObject({ word: 'Steady', tone: 'plain' });
    expect(themesByCategory(null)).toEqual({});
  });

  it('the Board’s own card is inside: one insight reads the same on both pages', () => {
    for (const raw of [DIVE_SLOPE, DIVE_PENALTIES, DIVE_BIG, DIVE_BREAK]) {
      const own = by(PREVIEW_DIVE, raw.id).base;
      expect(own.title).toBe(toChInsight(raw, { viewer: { role: 'player' } }).title);
      expect(own.value).toBe(toChInsight(raw).value);
    }
  });
});

describe('the loader reads the signed-in player’s own deep dive, and says what it could not', () => {
  const seen: Array<{ table: string; filters: Array<[string, unknown[]]> }> = [];
  const note = (table: string, filters: Array<[string, unknown[]]>) => seen.push({ table, filters: filters.map(([k, a]) => [k, [...a]]) });
  const has = (filters: Array<[string, unknown[]]>, key: string, arg: string) => filters.some(([k, a]) => k === key && a[0] === arg);
  const feed = () => [DIVE_SLOPE, DIVE_PENALTIES, DIVE_BREAK, DIVE_BIG];
  const themes = () => ({ success: true, data: DIVE_THEMES });

  beforeEach(() => {
    seen.length = 0;
    delivery.insights.mockResolvedValue(feed());
    delivery.themes.mockResolvedValue(themes());
    goals.active.mockResolvedValue(DIVE_GOALS);
    goals.achieved.mockResolvedValue([]);
    tables.current = {
      golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'mens' } } },
      // The team's Tour values, which a comparison against the Tour is drawn from (and what makes a stat a strength).
      golf_pga_standards: { data: [{ metric_id: 'big_number_rate', pga_tour_value: 2 }, { metric_id: 'penalty_rate_per_round', pga_tour_value: 0.3 }] },
      golf_drills: { data: [] },
      golf_coach_insights: { data: [] },
      golf_insight_player_feedback: { data: [] },
      golf_player_focus_areas: (f) => {
        note('golf_player_focus_areas', f);
        // The loader's own read is scoped to the player; the Board's assigned-by-insight read is not, and sees nothing here.
        return { data: has(f, 'eq', 'player_id') ? DIVE_FOCUS : [] };
      },
      golf_rounds: (f) => {
        note('golf_rounds', f);
        if (has(f, 'in', 'id')) return { data: DIVE_ROUND_ROWS };
        return { data: [] };
      },
    };
  });

  it('ready: the delivery feed, the category reads and both goal reads for the player id it was given, and only that id', async () => {
    const out = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    expect(delivery.insights).toHaveBeenCalledWith('pl-jonah', { limit: 30, drawn: expect.any(Function) });
    expect(delivery.themes).toHaveBeenCalledWith('pl-jonah');
    expect(goals.active).toHaveBeenCalledWith('pl-jonah');
    expect(goals.achieved).toHaveBeenCalledWith('pl-jonah');
    expect(out.status).toBe('ready');
    if (out.status !== 'ready') return;
    expect(out.data.list.map((i) => i.base.id)).toEqual(['in-slope', 'in-pen', 'in-brk', 'in-dbl']);
    expect(out.data.counts).toEqual({ insights: 4, needs: 3, working: 1, inPlan: 2 });
    expect(out.data).toMatchObject({ roundsFailed: false, plansFailed: false, themesFailed: false });
    expect(by(out.data, 'in-slope').rounds.list).toHaveLength(8);
    expect(by(out.data, 'in-slope').plan.focus?.title).toBe('Downhill putts inside 6 ft');
    expect(by(out.data, 'in-pen').closes).toEqual({ strokes: '0.9', anchor: 'team' });
    expect(out.data.tour).toBe('Tour');
    expect(logServer).not.toHaveBeenCalled();
  });

  it('the rounds behind the reads are read through the session’s client: this player’s, completed, not a test round, at most a dozen ids per read', async () => {
    await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    const behind = seen.filter((s) => s.table === 'golf_rounds' && has(s.filters, 'in', 'id'));
    expect(behind).toHaveLength(1);
    const f = behind[0]!.filters;
    expect(f.find(([k, a]) => k === 'eq' && a[0] === 'player_id')?.[1][1]).toBe('pl-jonah');
    expect(f.find(([k, a]) => k === 'eq' && a[0] === 'is_test')?.[1][1]).toBe(false);
    expect(f.find(([k, a]) => k === 'eq' && a[0] === 'status')?.[1][1]).toBe('completed');
    const asked = f.find(([k, a]) => k === 'in' && a[0] === 'id')![1][1] as string[];
    expect(asked.length).toBeGreaterThan(0);
    // 14 + 21 + 21 ids are named across the reads; no more than the newest twelve of each are asked for.
    expect(asked.length).toBeLessThanOrEqual(DIVE_ROUNDS_READ * 3);
    expect(asked).not.toContain('rd-13');
  });

  it('nothing from anywhere else is drawn: a goal that is another player’s, or a focus area read for anyone else, is never shown', async () => {
    goals.active.mockResolvedValue([...DIVE_GOALS, { ...DIVE_GOALS[0]!, id: 'gl-other', player_id: 'pl-someone-else', origin_insight_id: 'in-slope', title: 'Someone else’s goal' }]);
    const out = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(JSON.stringify(out.data)).not.toContain('Someone else');
    expect(by(out.data, 'in-slope').plan.goal).toBeNull();
    // Every read that is scoped by id is scoped by this player's, and no other id was ever put in a filter.
    expect(JSON.stringify(seen)).not.toContain('pl-someone-else');
    expect(seen.filter((s) => s.table === 'golf_player_focus_areas' && has(s.filters, 'eq', 'player_id')).every((s) => s.filters.some(([k, a]) => k === 'eq' && a[0] === 'player_id' && a[1] === 'pl-jonah'))).toBe(true);
  });

  it('a women’s team is read against the LPGA Tour, by name, and a player with no team against the Tour', async () => {
    tables.current = { ...tables.current, golf_team_members: { data: { team_id: 't1', golf_teams: { gender: 'womens' } } } };
    const women = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (women.status !== 'ready') throw new Error('not ready');
    expect(women.data.tour).toBe('LPGA Tour');
    tables.current = { ...tables.current, golf_team_members: { data: null } };
    const none = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (none.status !== 'ready') throw new Error('not ready');
    expect(none.data.tour).toBe('Tour');
  });

  it('a card that states no finding is not drawn, as on the Board', async () => {
    delivery.insights.mockResolvedValue([DIVE_SLOPE, puttBalanced('pl-jonah')]);
    const out = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data.list.map((i) => i.base.id)).toEqual(['in-slope']);
  });

  it('CH-13280 a feed that throws is the failed state, logged through chLogServer, never the first run', async () => {
    delivery.insights.mockRejectedValue(new Error('feed down'));
    expect(await loadPlayerDeepDive({ playerId: 'pl-jonah' })).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'dive.feed', expect.any(Error), 'coachhelm');
  });

  it('CH-13280 an empty feed while undismissed insights are on file is a failed read, not an empty one', async () => {
    delivery.insights.mockResolvedValue([]);
    tables.current = { ...tables.current, golf_coach_insights: { data: [{ ...rawRow(DIVE_SLOPE) }] }, golf_insight_player_feedback: { data: [] } };
    expect(await loadPlayerDeepDive({ playerId: 'pl-jonah' })).toEqual({ status: 'failed' });
  });

  it('an empty feed where every insight was dismissed, or there are none, is the first-run page with the countable-round count', async () => {
    delivery.insights.mockResolvedValue([]);
    const countable = { id: 'r1', total_score: 74, front_nine: 37, back_nine: 37, holes_played: 18, total_putts: 31 };
    tables.current = { ...tables.current, golf_rounds: { data: [countable, { ...countable, id: 'r2' }] }, golf_coach_insights: { data: [] } };
    const none = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    expect(none).toMatchObject({ status: 'ready', data: { list: [], rounds: 2 } });
    tables.current = { ...tables.current, golf_coach_insights: { data: [rawRow(DIVE_SLOPE)] }, golf_insight_player_feedback: { data: [{ insight_id: 'in-slope', rating: 'dismissed', created_at: '2026-09-30T00:00:00Z' }] } };
    expect(await loadPlayerDeepDive({ playerId: 'pl-jonah' })).toMatchObject({ status: 'ready', data: { list: [] } });
  });

  it('CH-13281 rounds that did not load are their own flag: the reads still draw, they still name their rounds, and it is logged', async () => {
    tables.current = { ...tables.current, golf_rounds: (f) => (has(f, 'in', 'id') ? { error: { message: 'boom' } } : { data: [] }) };
    const out = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data).toMatchObject({ roundsFailed: true, plansFailed: false, themesFailed: false });
    expect(out.data.list).toHaveLength(4);
    expect(by(out.data, 'in-slope').rounds).toMatchObject({ total: 14, list: [], strip: [] });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'dive.rounds', expect.objectContaining({ message: 'boom' }), 'coachhelm');
  });

  it('CH-13282 focus areas or goals that did not load are their own flag, never "not part of a plan"', async () => {
    tables.current = { ...tables.current, golf_player_focus_areas: (f) => (has(f, 'eq', 'player_id') ? { error: { message: 'boom' } } : { data: [] }) };
    const out = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data).toMatchObject({ plansFailed: true, roundsFailed: false });
    expect(out.data.counts.inPlan).toBe(0);
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'dive.plans', expect.objectContaining({ message: 'boom' }), 'coachhelm');

    logServer.mockClear();
    tables.current = { ...tables.current, golf_player_focus_areas: (f) => ({ data: has(f, 'eq', 'player_id') ? DIVE_FOCUS : [] }) };
    goals.active.mockRejectedValue(new Error('goals down'));
    const again = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (again.status !== 'ready') throw new Error('not ready');
    expect(again.data.plansFailed).toBe(true);
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'dive.plans', expect.any(Error), 'coachhelm');
  });

  it('CH-13283 category reads that did not load (success false, or a throw) are their own flag; no trend is invented and no gain is claimed', async () => {
    delivery.themes.mockResolvedValue({ success: false, error: 'nope' });
    const out = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (out.status !== 'ready') throw new Error('not ready');
    expect(out.data).toMatchObject({ themesFailed: true, themes: {}, roundsFailed: false });
    expect(by(out.data, 'in-pen').closes).toBeNull();
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'dive.themes', 'nope', 'coachhelm');

    logServer.mockClear();
    delivery.themes.mockRejectedValue(new Error('themes down'));
    const thrown = await loadPlayerDeepDive({ playerId: 'pl-jonah' });
    if (thrown.status !== 'ready') throw new Error('not ready');
    expect(thrown.data.themesFailed).toBe(true);
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'dive.themes', expect.any(Error), 'coachhelm');
  });

  it('anything else that throws is the failed state, logged', async () => {
    tables.current = {
      ...tables.current,
      golf_team_members: () => {
        throw new Error('boom');
      },
    };
    expect(await loadPlayerDeepDive({ playerId: 'pl-jonah' })).toEqual({ status: 'failed' });
    expect(logServer).toHaveBeenCalledWith('coachhelm', 'dive', expect.any(Error), 'coachhelm');
  });
});

/** The stored row a `golf_coach_insights` read returns for an insight (what `loadVisible` maps). */
function rawRow(i: EvidenceInsight) {
  return {
    id: i.id,
    player_id: i.player_id,
    category: i.category,
    insight_type: i.insight_type,
    title: i.title,
    content: i.content,
    signature: i.signature,
    evidence: i.evidence,
    metadata: i.metadata,
    lifecycle_state: i.lifecycle_state,
    status: i.status,
    priority: i.priority,
    acknowledged_at: i.acknowledged_at,
    resolved_at: i.resolved_at,
    created_at: i.created_at,
    updated_at: i.updated_at,
  };
}

describe('the Deep dive screen', () => {
  const show = (load = diveLoad(PREVIEW_DIVE), initialId: string | null = null) => render(wrap(<DeepDive load={load} initialId={initialId} />));
  const article = () => screen.getByRole('article');
  const rail = () => screen.getByRole('navigation', { name: 'Your insights' });

  it('CH-13890 the page is labelled by CoachHelm; the summary, each group and each part of the read are labelled regions; the read is an article named by its title', () => {
    show();
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBe('ch-hl-title');
    expect(screen.getByRole('region', { name: /CoachHelm has 4 reads on your game/ })).toBeTruthy();
    expect(within(rail()).getByRole('region', { name: 'Needs work' })).toBeTruthy();
    expect(within(rail()).getByRole('region', { name: 'Working' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Downhill putts inside 4-6 ft: a real penalty' })).toBeTruthy();
    for (const part of ['What was measured', 'How it has moved', 'The rounds behind it', 'Why CoachHelm thinks so', 'Where this goes']) {
      expect(within(article()).getByRole('region', { name: part })).toBeTruthy();
    }
    expect(code('CH-13890')).not.toBeNull();
  });

  it('the summary: how many reads, how many need work, how many are working, how many are in a plan', () => {
    show();
    const hero = screen.getByRole('region', { name: /CoachHelm has 4 reads on your game/ });
    expect(within(hero).getByText('Need work').nextElementSibling!.textContent).toBe('3');
    expect(within(hero).getByText('Working').nextElementSibling!.textContent).toBe('1');
    expect(within(hero).getByText('In your plan').nextElementSibling!.textContent).toBe('2');
  });

  it('the list: Needs work, then Working, each read with its category, its stance in words, its title and its number', () => {
    show();
    const needs = within(rail()).getByRole('region', { name: 'Needs work' });
    const rows = within(needs).getAllByRole('button');
    expect(rows.map((r) => r.querySelector('b')!.textContent)).toEqual(['Downhill putts inside 4-6 ft: a real penalty', 'Penalty strokes: 1.1 per round', 'Putting break: under-reading left-to-right (10-20 ft)']);
    expect(rows[0]!.textContent).toContain('Putting · Worth closing');
    expect(rows[1]!.textContent).toContain('Course management · Priority');
    expect(rows[0]!.querySelector('.ch-hd-it__v')!.textContent).toBe('23 pts');
    const working = within(rail()).getByRole('region', { name: 'Working' });
    expect(within(working).getByRole('button').textContent).toContain('Course management · Working');
  });

  it('the list says it is in CoachHelm’s own order, not by date', () => {
    show();
    const needs = within(rail()).getByRole('region', { name: 'Needs work' });
    expect(needs.textContent).toContain('in the order it ranks them');
    expect(needs.textContent).not.toMatch(/recent/i);
  });

  it('the first read is showing, and marked current in the list', () => {
    show();
    expect(article().getAttribute('aria-labelledby')).toBe('in-slope-t');
    const current = within(rail()).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain('Downhill putts');
  });

  it('CH-13780 choosing another read shows it in full, marks it current, and is a selection haptic; nothing is read again', async () => {
    show();
    await userEvent.click(within(rail()).getByRole('button', { name: /Penalty strokes/ }));
    expect(screen.getByRole('article', { name: 'Penalty strokes: 1.1 per round' })).toBeTruthy();
    expect(within(rail()).getByRole('button', { name: /Penalty strokes/ }).getAttribute('aria-current')).toBe('true');
    expect(within(rail()).getByRole('button', { name: /Downhill putts/ }).getAttribute('aria-current')).toBeNull();
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('what was measured: the number, the metric, the dates, the evidence the Board draws, and the sample with its confidence word', () => {
    show();
    const part = within(article()).getByRole('region', { name: 'What was measured' });
    expect(part.querySelector('.ch-hd-meas__v b')!.textContent).toBe('23 pts');
    expect(within(part).getByText('Downhill penalty vs level putts (distance-controlled)')).toBeTruthy();
    expect(within(part).getByText('Jul 5 to Oct 1')).toBeTruthy();
    // The Board's own evidence: the two make rates, the sample, the window and the confidence word.
    expect(within(part).getByText('58%')).toBeTruthy();
    expect(within(part).getByText('81%')).toBeTruthy();
    expect(within(part).getByText('75 putts')).toBeTruthy();
    expect(within(part).getByText('Solid read')).toBeTruthy();
  });

  it('a gap worth closing is said in strokes a round, to the team’s average, never as strokes being lost', async () => {
    show(diveLoad(PREVIEW_DIVE), 'in-pen');
    const part = within(article()).getByRole('region', { name: 'What was measured' });
    expect(part.textContent).toContain('Closing the gap to your team’s average is worth about 0.9 strokes a round.');
    expect(article().textContent).not.toMatch(/\blosing\b|\bloses?\b/i);
  });

  it('with no team average to anchor on, the gap is said to the Tour (the LPGA Tour for a women’s team), never to a team', () => {
    const onTour = (tour: 'Tour' | 'LPGA Tour') => {
      const themes = { ...DIVE_THEMES, themes: [{ ...DIVE_THEMES.themes[1]!, causes: [{ ...DIVE_THEMES.themes[1]!.causes[0]!, strokesSavedPerRound: 1.4, standingTeamAvgValue: null }] }] } as AssembledThemes;
      return diveLoad(diveOf([deep(DIVE_PENALTIES, { ...FULL_INPUTS, themes })], { tour }));
    };
    show(onTour('Tour'));
    expect(within(article()).getByRole('region', { name: 'What was measured' }).textContent).toContain('Closing the gap to the Tour is worth about 1.4 strokes a round.');
    cleanup();
    show(onTour('LPGA Tour'));
    expect(within(article()).getByRole('region', { name: 'What was measured' }).textContent).toContain('Closing the gap to the LPGA Tour is worth about 1.4 strokes a round.');
    expect(article().textContent).not.toMatch(/your team’s average/);
  });

  it('how it has moved: since it was first seen, the category’s trend in words, and the scores in the rounds below', () => {
    show();
    const part = within(article()).getByRole('region', { name: 'How it has moved' });
    expect(part.textContent).toContain('From 31% to 23%, down 8 pts');
    expect(part.textContent).toContain('Improving');
    expect(part.textContent).toContain('Putting: strokes gained averaged −0.31 a round over your last 5 rounds, against −0.62 over the 5 before');
    expect(part.textContent).toContain('+6 to +2');
    expect(part.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('the result of a read that was worked on is said with the day it was measured', () => {
    show(diveLoad(PREVIEW_DIVE), 'in-dbl');
    expect(within(article()).getByRole('region', { name: 'How it has moved' }).textContent).toContain('ResultImproved · measured Sep 28');
  });

  it('CH-13383 a read with no movement, outcome, category trend or strip says there is no trend yet, in place', () => {
    show(diveLoad(PREVIEW_DIVE_YOUNG), 'in-brk');
    expect(code('CH-13383')!.textContent).toMatch(/^No trend yet\./);
    expect(code('CH-13283')).toBeNull();
  });

  it('the rounds behind it: the newest of the total, each with its date, course, score and to par, and a link to its review', () => {
    show();
    const part = within(article()).getByRole('region', { name: 'The rounds behind it' });
    expect(part.textContent).toContain('Newest 8 of 14');
    const rows = within(part).getAllByRole('listitem');
    expect(rows).toHaveLength(8);
    expect(rows[0]!.textContent).toContain('Sep 28');
    expect(rows[0]!.textContent).toContain('Oak Hollow');
    expect(rows[0]!.textContent).toContain('74');
    expect(rows[0]!.textContent).toContain('+2');
    expect(rows[4]!.querySelector('.ch-hd-r__p')!.className).toContain('is-under');
    expect(rows[2]!.querySelector('.ch-hd-r__p')!.className).toContain('is-even');
    expect(rows[6]!.textContent).toContain('9 holes');
    const link = within(part).getByRole('link', { name: 'Review the round on Sep 28 at Oak Hollow' });
    expect(link.getAttribute('href')).toBe('/golf/dashboard/rounds/rd-01');
  });

  it('while a round’s review is not rebuilt the rounds are listed without links (the loader decides, from the same navigation the shell uses)', () => {
    nav.rebuilt = false;
    show(diveLoad(diveOf([deep(DIVE_SLOPE, FULL_INPUTS)])));
    const part = within(article()).getByRole('region', { name: 'The rounds behind it' });
    expect(within(part).getAllByRole('listitem')).toHaveLength(8);
    expect(within(part).queryByRole('link')).toBeNull();
  });

  it('CH-13382 a read that names no rounds says so in place, and says it uses stats over a window', () => {
    show(diveLoad(PREVIEW_DIVE), 'in-brk');
    expect(code('CH-13382')!.textContent).toMatch(/does not name the rounds it was made from/);
    expect(within(article()).queryByRole('list', { name: /rounds/i })).toBeNull();
    expect(code('CH-13281')).toBeNull();
  });

  it('CH-13382 a read that names rounds none of which can be listed says so, with the count it names', () => {
    const none: ChDeepInsight = { ...by(PREVIEW_DIVE, 'in-slope'), rounds: { total: 14, list: [], strip: [] } };
    show(diveLoad({ ...PREVIEW_DIVE, list: [none] }));
    expect(code('CH-13382')!.textContent).toMatch(/made from 14 rounds, but none of them can be listed here/);
  });

  it('CH-13982 why: a hypothesis is marked "Likely, not measured" and a seen cause "Measured in your shots"; the drivers carry their counts, then the full write-up', async () => {
    show();
    const part = within(article()).getByRole('region', { name: 'Why CoachHelm thinks so' });
    expect(code('CH-13982')!.textContent).toBe('Likely, not measured');
    expect(part.textContent).toContain('Downhill make rate, 4-6 ft');
    expect(part.textContent).toContain('31 counted');
    expect(part.textContent).toContain('Both groups have enough putts to compare');
    expect(within(part).getByText('The full write-up')).toBeTruthy();
    await userEvent.click(within(rail()).getByRole('button', { name: /Penalty strokes/ }));
    expect(code('CH-13982')!.textContent).toBe('Measured in your shots');
  });

  it('this week’s drill is the Board’s own, in its own block, only when there is one', async () => {
    show();
    expect(within(article()).getByText('This week')).toBeTruthy();
    expect(within(article()).getByText('Downhill ladder')).toBeTruthy();
    await userEvent.click(within(rail()).getByRole('button', { name: /Putting break/ }));
    expect(within(article()).queryByText('This week')).toBeNull();
  });

  it('where this goes: the focus area or goal it belongs to, in its state, linking to Development', () => {
    show();
    const part = within(article()).getByRole('region', { name: 'Where this goes' });
    expect(part.textContent).toContain('Focus area made from this');
    expect(part.textContent).toContain('Downhill putts inside 6 ft');
    expect(part.textContent).toContain('Active');
    expect(within(part).getByRole('link', { name: /Downhill putts inside 6 ft/ }).getAttribute('href')).toBe('/golf/dashboard/stats?tab=dev');
  });

  it('a goal is shown with where it stands', async () => {
    show(diveLoad(PREVIEW_DIVE), 'in-pen');
    const part = within(article()).getByRole('region', { name: 'Where this goes' });
    expect(part.textContent).toContain('Goal made from this');
    expect(part.textContent).toContain('Cut penalties to 0.8 a round');
    expect(part.textContent).toContain('Now 1.1, target 0.8, by Nov 15');
  });

  it('CH-13384 a read in no plan says so, and offers Development while that screen is rebuilt, and no link when it is not', () => {
    show(diveLoad(PREVIEW_DIVE), 'in-brk');
    expect(code('CH-13384')!.textContent).toMatch(/not part of a focus area or a goal yet/);
    expect(within(code('CH-13384') as HTMLElement).getByRole('link', { name: /Open Development/ }).getAttribute('href')).toBe('/golf/dashboard/stats?tab=dev');
    cleanup();
    nav.rebuilt = false;
    show(diveLoad(PREVIEW_DIVE), 'in-brk');
    expect(within(code('CH-13384') as HTMLElement).queryByRole('link')).toBeNull();
    expect(within(code('CH-13384') as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('CH-13903 a read from before the newest round says so, beside the claim', () => {
    const old: ChDeepInsight = { ...by(PREVIEW_DIVE, 'in-slope'), base: { ...by(PREVIEW_DIVE, 'in-slope').base, stale: { newestRound: 'Sep 28' } }, stance: { cls: 'stale', word: 'Out of date' } };
    show(diveLoad({ ...PREVIEW_DIVE, list: [old] }));
    expect(code('CH-13903')!.textContent).toMatch(/A round played Sep 28 isn’t in this read yet/);
    expect(within(article()).getByText('Out of date')).toBeTruthy();
  });

  it('CH-13281, CH-13282 and CH-13283 each part that did not load says so in its own place, with Try again; the read itself is still drawn', async () => {
    show(diveLoad(PREVIEW_DIVE_PARTS_FAILED));
    expect(article().querySelector('.ch-hd-meas__v b')!.textContent).toBe('23 pts');
    expect(code('CH-13283')!.textContent).toMatch(/Your category trends didn’t load/);
    expect(code('CH-13281')!.textContent).toMatch(/The rounds behind this read didn’t load/);
    expect(code('CH-13282')!.textContent).toMatch(/Your focus areas and goals didn’t load/);
    // Not one of them is said as if it were nothing.
    expect(code('CH-13383')).toBeNull();
    expect(code('CH-13382')).toBeNull();
    expect(code('CH-13384')).toBeNull();
    // "In your plan" is a dash, never a zero, while plans did not load.
    expect(screen.getByText('In your plan').nextElementSibling!.textContent).toBe('—');
    await userEvent.click(within(code('CH-13281') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('CH-13280 insights that did not load say so, with Try again, never the first run', async () => {
    render(wrap(<DeepDive load={{ status: 'failed' }} />));
    expect(code('CH-13280')!.textContent).toMatch(/Your insights didn’t load.*Nothing is lost/);
    expect(code('CH-13380')).toBeNull();
    expect(code('CH-13381')).toBeNull();
    await userEvent.click(within(code('CH-13280') as HTMLElement).getByRole('button', { name: /Try again/ }));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The views are still there to leave by.
    expect(screen.getByRole('radiogroup', { name: 'CoachHelm view' })).toBeTruthy();
  });

  it('CH-13380 no round posted yet: the first-run page with one action', () => {
    show(diveLoad(PREVIEW_DIVE_NO_ROUNDS));
    expect(code('CH-13380')!.textContent).toMatch(/Your Deep dive starts with a round.*Post a round and the first reads follow/);
    expect(within(code('CH-13380') as HTMLElement).getByRole('link', { name: 'Start a round' }).getAttribute('href')).toBe('/golf/dashboard/rounds/new');
    expect(code('CH-13381')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('CH-13381 rounds but no insight yet: it says how many rounds and that it checks again; an unknown count is not said as none', () => {
    show(diveLoad(PREVIEW_DIVE_EMPTY));
    expect(code('CH-13381')!.textContent).toMatch(/No insight to open yet.*from the 14 rounds you have posted/);
    cleanup();
    show(diveLoad({ ...PREVIEW_DIVE_EMPTY, rounds: null }));
    expect(code('CH-13381')!.textContent).toMatch(/None is yet\. It checks again as you post more\./);
    expect(code('CH-13380')).toBeNull();
  });

  it('CH-13304 CoachHelm off for them: the board’s own page and no sub-navigation', () => {
    render(wrap(<DeepDive load={{ status: 'off', reason: null }} />));
    expect(code('CH-13304')!.textContent).toMatch(/CoachHelm is turned off, so no insights are being shown/);
    expect(code('CH-13930')).toBeNull();
  });

  it('CH-13480 loading: the page’s own shape, busy and named, with the sub-navigation’s place held', () => {
    render(wrap(<DiveSkeleton />));
    const main = screen.getByRole('main', { name: 'Loading your deep dive' });
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(code('CH-13480')).not.toBeNull();
    expect(main.querySelector('.ch-hv-sk-tabs')).not.toBeNull();
    expect(main.querySelector('.ch-hd-sk__dos')).not.toBeNull();
    expect(main.querySelectorAll('.ch-hd-sk__it').length).toBeGreaterThanOrEqual(5);
  });

  it('CH-13930 the sub-navigation has Deep dive as the current view, and a choice is a route change', async () => {
    show();
    const radios = within(screen.getByRole('radiogroup', { name: 'CoachHelm view' })).getAllByRole('radio');
    expect(radios.map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([
      ['Board', 'false'],
      ['Game profile', 'false'],
      ['Standing', 'false'],
      ['Deep dive', 'true'],
    ]);
    await userEvent.click(screen.getByRole('radio', { name: 'Standing' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/coachhelm?view=standing');
  });

  it('the player has no control over anything here: no assign, dismiss, accept or decline, and no coach’s or other player’s name or id', () => {
    show();
    expect(screen.queryByRole('button', { name: /Assign|Dismiss|Accept|Decline|Save|Delete/ })).toBeNull();
    for (const a of document.querySelectorAll('a[href]')) expect(a.getAttribute('href')).not.toMatch(/player=|coach/);
    expect(document.body.textContent).not.toMatch(/pl-|Coach Reyes|Maya|Eli Brandt|Priya|Theo/);
  });

  it('CH-13981 an address that names a read opens on it; one that names nothing the player has opens on the first', () => {
    show(diveLoad(PREVIEW_DIVE), 'in-dbl');
    expect(article().getAttribute('aria-labelledby')).toBe('in-dbl-t');
    cleanup();
    show(diveLoad(PREVIEW_DIVE), 'pl-someone-elses-insight');
    expect(article().getAttribute('aria-labelledby')).toBe('in-slope-t');
    cleanup();
    show(diveLoad(PREVIEW_DIVE), '');
    expect(article().getAttribute('aria-labelledby')).toBe('in-slope-t');
  });

  it('the reads of a young account are in the list with nothing from a plan or a category in them', () => {
    show(diveLoad(PREVIEW_DIVE_YOUNG));
    expect(within(rail()).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('In your plan').nextElementSibling!.textContent).toBe('0');
  });
});

describe('the Deep dive on the phone', () => {
  beforeEach(() => {
    phoneState.on = true;
  });
  const show = (initialId: string | null = null) => render(wrap(<DeepDive load={diveLoad(PREVIEW_DIVE)} initialId={initialId} />));

  it('its own layout: the same page under the top bar, the views as chips, and the list with no read beside it', () => {
    show();
    expect(document.querySelector('.ch-hl.is-phone')).not.toBeNull();
    expect(document.querySelector('.ch-hv-tabs.is-phone .ch-hv-chips')).not.toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Your insights' })).getAllByRole('button')).toHaveLength(4);
  });

  it('CH-13980 a read opens as a pushed screen with a back link, the page under it inert; Back closes it, and the list is where it was', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /Penalty strokes/ }));
    const pushed = document.querySelector('.ch-pscreen') as HTMLElement;
    expect(pushed).not.toBeNull();
    expect(code('CH-13980')).toBe(pushed);
    expect(within(pushed).getByRole('article', { name: 'Penalty strokes: 1.1 per round' })).toBeTruthy();
    expect(within(pushed).getByRole('heading', { name: 'Course management', level: 1 })).toBeTruthy();
    expect(screen.getByRole('main', { hidden: true }).hasAttribute('inert')).toBe(true);
    await userEvent.click(within(pushed).getByRole('button', { name: 'Back to Deep dive' }));
    await waitFor(() => expect(document.querySelector('.ch-pscreen')).toBeNull());
    expect(screen.getByRole('main').hasAttribute('inert')).toBe(false);
    expect(hapticSpy).toHaveBeenCalledWith('select');
  });

  it('CH-13980 the browser’s back (the iOS edge swipe) closes the read instead of leaving the page', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /Penalty strokes/ }));
    expect(document.querySelector('.ch-pscreen')).not.toBeNull();
    expect((window.history.state as { chPhone?: number } | null)?.chPhone).toBe(1);
    act(() => window.history.back());
    await waitFor(() => expect(document.querySelector('.ch-pscreen')).toBeNull());
  });

  it('CH-13981 an address that names a read opens it at once; one that names nothing of theirs shows the list', () => {
    show('in-dbl');
    expect(within(document.querySelector('.ch-pscreen') as HTMLElement).getByRole('article', { name: 'Double bogey-or-worse rate: 1.6%' })).toBeTruthy();
    cleanup();
    show('pl-someone-elses-insight');
    expect(document.querySelector('.ch-pscreen')).toBeNull();
  });
});
