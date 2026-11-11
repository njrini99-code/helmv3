import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';
import { CoachContextError } from '../context';
import type { ChatTool, PlayerChatContext, ReadTool, ToolContext, ToolResult } from '../engine/tool';
import { toolsFor } from '../registry';
import type { PlayerStatsScreen, QualifierBoardScreen, RosterScreen, RoundReviewLoad, RoundReviewScreen, ScreenLoaders, TeamRoundRow, TeamRoundsScreen, TeamStatsScreen, TournamentsLoad } from '../screen-loaders';
import { person, pgrst, type Tables } from './pgrst-double';

vi.mock('server-only', () => ({}));
// Production has golf_tournaments_v1 off; the tournaments tests turn it on for themselves.
const flags = vi.hoisted(() => ({ tournaments: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (name: string) => name === 'golf_tournaments_v1' && flags.tournaments }));

const ELI = '00000000-0000-4000-8000-000000000001';
const MAYA = '00000000-0000-4000-8000-000000000002';
const NOAH = '00000000-0000-4000-8000-000000000003';
const OUTSIDER = '00000000-0000-4000-8000-0000000000ff';
const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Rini University', timezone: 'America/New_York', roster: [person(ELI, 'Eli Brandt'), person(MAYA, 'Maya Ortiz'), person(NOAH, 'Noah Kim')] };
/** A player's context: the roster is reduced to them, as `resolvePlayerChatContext` builds it. */
const maya: PlayerChatContext = { ...coach, roster: [person(MAYA, 'Maya Ortiz')], player_id: MAYA };

function ctxFor(who: CoachChatContext | PlayerChatContext, loaders: ScreenLoaders = {}, tables: Tables = {}): ToolContext & { db: ReturnType<typeof pgrst> } {
  const db = pgrst(tables);
  return { sb: db.sb, who, conversationId: 'conv-1', surface: 'player_id' in who ? 'player' : 'ask', loaders, signal: new AbortController().signal, reads: new Map(), db };
}
const textOf = (r: ToolResult) => (r as ToolResult & { model_text?: string }).model_text ?? '';
/** Every line any reader in this file hands the model, so the last test can hold all of it to how a coach reads. */
const SEEN_TEXT: Array<{ tool: string; text: string }> = [];
const read = <I = never>(who: CoachChatContext | PlayerChatContext, name: string) => {
  const tool = toolsFor('player_id' in who ? 'player' : 'ask', who).find((t) => t.name === name) as ReadTool<I> | undefined;
  if (!tool) return tool as unknown as ReadTool<I>;
  return {
    ...tool,
    run: async (c: ToolContext, i: I) => {
      const r = await tool.run(c, i);
      SEEN_TEXT.push({ tool: name, text: [r.summary, textOf(r), r.coverage_note ?? ''].join('\n') });
      return r;
    },
  } as ReadTool<I>;
};

function statsPage(name: string, over: Partial<PlayerStatsScreen> = {}): PlayerStatsScreen {
  return {
    name,
    win: { rounds: 10, avg: 74.23, toPar: 2.2, sgPerRound: 0.42, sgRounds: 9, sgLegs: { tee: 0.1, approach: -0.31, around: 0.22, putting: 0.41 }, holeRounds: 9, lastRoundDate: '2026-11-02' },
    season: { rounds: 14, avg: 74.61, toPar: 2.6 },
    teamAvg: 75.1,
    puttBands: [
      { label: '3–5 ft', made: 18, attempts: 20, bench: 88 },
      { label: '5–10 ft', made: 9, attempts: 14, bench: 56 },
    ],
    rounds: Array.from({ length: 30 }, (_, i) => ({ id: `round-${i}`, course: 'Pine Hill', date: 'Nov 2', iso: `2026-10-${String(30 - i).padStart(2, '0')}`, type: 'tournament' as const, holes: 18, score: 73 + (i % 3), toPar: 1, fairwaysPct: 60, girPct: 61, scramblePct: 50, putts: 31, sg: 0.5, sgLegs: [0.1, 0.1, 0.1, 0.2] as [number, number, number, number] })),
    comparisons: [
      { label: 'SG approach', group: 'Strokes gained', you: -0.31, team: 0.05, bench: null, unit: '', digits: 2, lowerIsBetter: false, signed: true },
      { label: 'Scoring avg', group: 'Scoring', you: 74.23, team: 75.1, bench: null, unit: '', digits: 1, lowerIsBetter: true },
      { label: 'Greens in regulation', group: 'Approach', you: 61, team: 58, bench: 66, unit: '%', digits: 0, lowerIsBetter: false },
      { label: 'Scrambling', group: 'Short game', you: 41, team: 52, bench: null, unit: '%', digits: 0, lowerIsBetter: false },
      { label: 'Sand saves', group: 'Short game', you: null, team: 40, bench: 50, unit: '%', digits: 0, lowerIsBetter: false, floor: 'Needs 10 chances.' },
    ],
    extra: { toughest: null, pressure: { gap: null, pressureRounds: 0, practiceRounds: 0 }, opening: null, approach: null, holesError: false, approachError: false, puttsError: false, truncated: false },
    roundsError: false,
    statsError: false,
    cacheError: false,
    ...over,
  };
}

describe('get_player_stats: the figure in chat is the figure on the Stats page', () => {
  it('returns exactly what the injected loader returned, with its window, sample and source', async () => {
    const playerStats = vi.fn(async (id: string) => statsPage(id === ELI ? 'Eli Brandt' : 'Maya Ortiz'));
    const out = await read<{ player_ids: string[]; window: string; sections: string[] }>(coach, 'get_player_stats').run(ctxFor(coach, { playerStats }), { player_ids: [ELI], window: 'last20', sections: [] });
    expect(playerStats).toHaveBeenCalledWith(ELI, 'last20');
    const scoring = out.measurements.find((m) => m.metric_id === 'scoring_average');
    expect(scoring).toMatchObject({ value: 74.2, sample_size: 10, sample_unit: 'rounds', source: 'Stats page', entity: { id: ELI, label: 'Eli Brandt' }, direction: 'lower_better' });
    expect(scoring?.comparisons?.find((c) => c.kind === 'team')?.value).toBe(75.1);
    expect(out.measurements.find((m) => m.metric_id === 'gir_pct')?.benchmark?.value).toBe(66);
    expect(out.measurements.find((m) => m.metric_id === 'sg_approach')).toMatchObject({ value: -0.31, sample_size: 9 });
    expect(out.window_label).toBe('last 20 rounds');
    expect(textOf(out)).toContain('Eli Brandt, scoring average, last 20 rounds: 74.2, over 10 rounds | team average 75.1');
    expect(textOf(out)).toContain('Eli Brandt, greens in regulation, last 20 rounds: 61%, over 10 rounds | team average 58% | Tour 66%');
    expect(textOf(out)).toContain('Eli Brandt, strokes gained approach, last 20 rounds: \u22120.31 against the Tour benchmark, over 9 rounds | team average +0.05');
    // A figure with no value yet is said to be missing with its reason, never printed as zero.
    expect(out.measurements.some((m) => m.metric_id === 'sand_save_pct')).toBe(false);
    expect(textOf(out)).toContain('Eli Brandt, sand saves, last 20 rounds: no figure yet, needs 10 chances.');
  });

  it('works out the gaps to the team, worst first, so the model does not', async () => {
    const out = await read<{ player_ids: string[]; window: string; sections: string[] }>(coach, 'get_player_stats').run(ctxFor(coach, { playerStats: async () => statsPage('Eli Brandt') }), { player_ids: [ELI], window: 'last10', sections: [] });
    const gaps = (out.detail as { gaps_to_team: Array<{ label: string; gap: number }> }).gaps_to_team;
    expect(gaps.map((g) => g.label)).toEqual(['SG approach', 'Scrambling']);
    expect(gaps[1]).toMatchObject({ gap: -11 });
  });

  it('a read that failed is reported as failed, not as a player with no rounds', async () => {
    const tool = read<{ player_ids: string[]; window: string; sections: string[] }>(coach, 'get_player_stats');
    const input = { player_ids: [ELI], window: 'last10', sections: [] };
    expect((await tool.run(ctxFor(coach, { playerStats: async () => null }), input)).coverage).toBe('unavailable');
    expect((await tool.run(ctxFor(coach, { playerStats: async () => Promise.reject(new Error('boom')) }), input)).coverage).toBe('unavailable');
    expect((await tool.run(ctxFor(coach, {}), input)).coverage).toBe('unavailable');
    // A player who really has no rounds in the window is empty, which is a different sentence.
    const none = await tool.run(ctxFor(coach, { playerStats: async () => statsPage('Eli Brandt', { win: { ...statsPage('x').win, rounds: 0 }, comparisons: [], rounds: [] }) }), input);
    expect(none.coverage).toBe('empty');
  });

  it('sets several players side by side itself, best first on each measure, with the gap', async () => {
    const pages: Record<string, PlayerStatsScreen> = { [ELI]: statsPage('Eli Brandt'), [MAYA]: statsPage('Maya Ortiz', { comparisons: [{ label: 'Scoring avg', group: 'Scoring', you: 73.94, team: 75.1, bench: null, unit: '', digits: 1, lowerIsBetter: true }, { label: 'Greens in regulation', group: 'Approach', you: 55, team: 58, bench: 66, unit: '%', digits: 0, lowerIsBetter: false }] }) };
    const out = await read<{ player_ids: string[]; window: string; sections: string[] }>(coach, 'get_player_stats').run(ctxFor(coach, { playerStats: async (id) => pages[id] ?? null }), { player_ids: [ELI, MAYA], window: 'last10', sections: [] });
    const side = (out.detail as { side_by_side: Array<{ metric: string; best_first: Array<{ player: string; value: number }>; gap: number }> }).side_by_side;
    // Lower is better for scoring, higher for greens: the order follows the measure, not the order the players were named in.
    expect(side.find((c) => c.metric === 'Scoring avg')).toMatchObject({ best_first: [{ player: 'Maya Ortiz', value: 73.9 }, { player: 'Eli Brandt', value: 74.2 }], gap: 0.3 });
    expect(side.find((c) => c.metric === 'Greens in regulation')).toMatchObject({ best_first: [{ player: 'Eli Brandt', value: 61 }, { player: 'Maya Ortiz', value: 55 }], gap: 6 });
    // A measure only one of them has is not compared.
    expect(side.some((c) => c.metric === 'Scrambling')).toBe(false);
    expect(textOf(out)).toContain('Scoring average: Maya Ortiz 73.9; Eli Brandt 74.2. Gap first to last: 0.3.');
  });

  it('one of two players failing is partial and names who is missing', async () => {
    const out = await read<{ player_ids: string[]; window: string; sections: string[] }>(coach, 'get_player_stats').run(ctxFor(coach, { playerStats: async (id) => (id === ELI ? statsPage('Eli Brandt') : null) }), { player_ids: [ELI, MAYA], window: 'last10', sections: [] });
    expect(out.coverage).toBe('partial');
    expect(out.coverage_note).toContain('Maya Ortiz');
    expect(out.measurements.every((m) => m.entity.id === ELI)).toBe(true);
  });

  it('caps the rounds it lists and says how many there are', async () => {
    const out = await read<{ player_ids: string[]; window: string; sections: string[] }>(coach, 'get_player_stats').run(ctxFor(coach, { playerStats: async () => statsPage('Eli Brandt') }), { player_ids: [ELI], window: 'season', sections: ['rounds', 'putting'] });
    expect((out.detail as { rounds: unknown[] }).rounds).toHaveLength(20);
    expect(textOf(out)).toContain('(20 of 30)');
    expect(textOf(out)).toContain('from 5 to 10 feet, 9 of 14 made, 64% against the Tour\u2019s 56%');
  });

  it('refuses a player who is not on the coach\'s roster before any read', async () => {
    const playerStats = vi.fn(async () => statsPage('x'));
    await expect(read<{ player_ids: string[]; window: string; sections: string[] }>(coach, 'get_player_stats').run(ctxFor(coach, { playerStats }), { player_ids: [OUTSIDER], window: 'last10', sections: [] })).rejects.toBeInstanceOf(CoachContextError);
    expect(playerStats).not.toHaveBeenCalled();
  });
});

const teamPage = (over: Partial<TeamStatsScreen> = {}): TeamStatsScreen => ({
  teamName: 'Rini University',
  activeCount: 3,
  roundCount: 28,
  figures: [
    { key: 'score', label: 'Scoring avg', value: 75.12, unit: '', digits: 1, delta: -0.4, lowerIsBetter: true, context: 'vs previous 10' },
    { key: 'gir', label: 'Greens in regulation', value: 58, unit: '%', digits: 0, delta: null, lowerIsBetter: false, context: '' },
  ],
  team: { sgMean: 0.1, scoreMean: 75.12 },
  grid: [
    { id: ELI, name: 'Eli Brandt', rounds: 10, legs: [0.1, -0.3, 0.2, 0.4], total: 0.4, change: null, avg: 74.2 },
    { id: MAYA, name: 'Maya Ortiz', rounds: 10, legs: [0.3, 0.2, 0.1, -0.2], total: 0.4, change: null, avg: 73.9 },
    { id: NOAH, name: 'Noah Kim', rounds: 2, legs: [null, null, null, null], total: null, change: null, avg: 79.5 },
  ],
  legTotals: [0.2, -0.05, 0.15, 0.1],
  putting: { bands: [{ label: '3–5 ft', made: 40, attempts: 50, bench: 88 }], putts: 900 },
  bests: [],
  sgRounds: 20,
  roundsError: false,
  cacheError: false,
  puttsError: false,
  ...over,
});

describe('every strokes-gained line names what it is measured against', () => {
  const stats = (who: CoachChatContext, page: PlayerStatsScreen) => read<{ player_ids: string[]; window: string; sections: string[] }>(who, 'get_player_stats').run(ctxFor(who, { playerStats: async () => page }), { player_ids: [ELI], window: 'last10', sections: ['rounds'] });
  const sgLines = (text: string) => text.split('\n').filter((l) => /strokes gained/.test(l));

  it('the Tour benchmark for a men\u2019s team or one with no gender set, in every line that carries a strokes-gained figure', async () => {
    for (const who of [coach, { ...coach, gender: 'mens' }]) {
      const lines = sgLines(textOf(await stats(who, statsPage('Eli Brandt'))));
      expect(lines.length).toBeGreaterThan(3);
      for (const line of lines) expect(line).toContain('against the Tour benchmark');
    }
  });

  it('the women\u2019s Tour baseline for a women\u2019s team, chosen the way the calculation chooses it; what the loader says it used wins', async () => {
    const womens = { ...coach, gender: 'womens' };
    for (const line of sgLines(textOf(await stats(womens, statsPage('Eli Brandt'))))) expect(line).toContain('against the women\u2019s Tour baseline');
    for (const line of sgLines(textOf(await stats(womens, statsPage('Eli Brandt', { sgBaseline: 'pga_tour' }))))) expect(line).toContain('against the Tour benchmark');
  });

  it('says how many rounds had shots logged only when the Stats page says', async () => {
    const page = statsPage('Eli Brandt');
    expect(textOf(await stats(coach, page))).not.toMatch(/shot-tracked/);
    const tracked = textOf(await stats(coach, { ...page, win: { ...page.win, sgShotRounds: 6 } }));
    expect(tracked).toContain('strokes gained approach, last 10 rounds: \u22120.31 against the Tour benchmark, over 9 rounds, 6 of 9 shot-tracked, the rest estimated from the scorecard');
    expect(textOf(await stats(coach, { ...page, win: { ...page.win, sgShotRounds: 9 } }))).toContain('over 9 rounds, all 9 shot-tracked');
  });
});

describe('putting by distance: a band nobody putted from is "no attempts", never 0%', () => {
  const bands = [{ label: '3–5 ft', made: 18, attempts: 20, bench: 88 }, { label: '20–30 ft', made: 0, attempts: 0, bench: 7 }, { label: '30+ ft', made: 0, attempts: 6, bench: 3 }];
  type Putting = { profile: { buckets: Array<{ label: string; attempts: number; rate: number | null }> }; putt_bands: Array<{ band: string; attempts: number; make_pct: number | null }> };
  const check = (out: ToolResult, detail: Putting) => {
    const line = textOf(out).split('\n').find((l) => /utting by distance/.test(l)) ?? '';
    expect(line).toContain('from 20 to 30 feet, no attempts');
    expect(line).not.toMatch(/from 20 to 30 feet[^;]*%/);
    expect(line).not.toContain('0 of 0');
    // A band that was putted from and never holed is a real 0%, and is said as one.
    expect(line).toContain('30 feet and beyond, 0 of 6 made, 0% against the Tour\u2019s 3%');
    expect(detail.putt_bands.map((b) => [b.band, b.make_pct])).toEqual([['3–5 ft', 90], ['20–30 ft', null], ['30+ ft', 0]]);
    // The putting picture draws from `rate`: null, so the empty band is drawn as empty and not as a bar at zero.
    expect(detail.profile.buckets.map((b) => b.rate)).toEqual([90, null, 0]);
    // No measurement turns the empty band into a figure.
    expect(out.measurements.filter((m) => /20–30/.test(m.metric_label))).toEqual([]);
  };

  it('for a player, on the coach\'s Ask and on the player\'s own', async () => {
    const coachOut = await read<{ player_ids: string[]; window: string; sections: string[] }>(coach, 'get_player_stats').run(ctxFor(coach, { playerStats: async () => statsPage('Eli Brandt', { puttBands: bands }) }), { player_ids: [ELI], window: 'last10', sections: ['putting'] });
    check(coachOut, coachOut.detail as Putting);
    const own = await read<{ window: string; sections: string[] }>(maya, 'get_player_stats').run(ctxFor(maya, { playerStats: async () => statsPage('Maya Ortiz', { puttBands: bands }) }), { window: 'last10', sections: ['putting'] });
    check(own, own.detail as Putting);
  });

  it('for the team', async () => {
    const out = await read<{ window: string; rank_by?: string; putting: boolean }>(coach, 'get_team_stats').run(ctxFor(coach, { teamStats: async () => teamPage({ putting: { bands, putts: 26 } }) }), { window: 'last10', putting: true });
    check(out, out.detail as Putting);
  });
});

describe('get_team_stats: one team average, places already worked out', () => {
  const tool = () => read<{ window: string; rank_by?: string; putting: boolean }>(coach, 'get_team_stats');

  it('quotes the Team Stats page and ranks on the asked column, ties sharing a place, no figure unranked', async () => {
    const teamStats = vi.fn(async () => teamPage());
    const out = await tool().run(ctxFor(coach, { teamStats }), { window: 'last10', putting: true });
    expect(teamStats).toHaveBeenCalledWith('last10');
    expect(out.measurements.find((m) => m.entity.kind === 'team' && m.metric_id === 'scoring_average')).toMatchObject({ value: 75.1, sample_size: 28, source: 'Team Stats page' });
    const ranking = (out.detail as { ranking: Array<{ player: string; place: number | null; value: number | null }> }).ranking;
    expect(ranking).toEqual([expect.objectContaining({ player: 'Eli Brandt', place: 1, value: 0.4 }), expect.objectContaining({ player: 'Maya Ortiz', place: 1, value: 0.4 }), expect.objectContaining({ player: 'Noah Kim', place: null, value: null })]);
    expect(textOf(out)).toContain('from 3 to 5 feet, 40 of 50 made, 80% against the Tour\u2019s 88%');
  });

  it('ranks a lower-is-better column the right way round', async () => {
    const out = await tool().run(ctxFor(coach, { teamStats: async () => teamPage() }), { window: 'last10', rank_by: 'scoring_average', putting: false });
    expect((out.detail as { ranking: Array<{ player: string }> }).ranking.map((r) => r.player)).toEqual(['Maya Ortiz', 'Eli Brandt', 'Noah Kim']);
  });

  it('a column the grid has no figure for comes from Stats\' own per-player calculation, and a failed read of it is said', async () => {
    const figures = (putts: number) => ({ rounds: 10, hole_rounds: 10, scoring_average: 74, putts_per_round: putts, putt_rounds: 10, sg_total: null, sg_rounds: 0, legs: { tee: null, approach: null, around: null, putting: null }, gir_pct: 60, gir_holes: 180, fairway_pct: 55, fairway_holes: 140, window_start: null, window_end: null });
    const playerFigures = vi.fn(async () => new Map([[ELI, figures(31.2)], [MAYA, figures(29.8)], [NOAH, figures(33)]]));
    const out = await tool().run(ctxFor(coach, { teamStats: async () => teamPage(), playerFigures }), { window: 'last10', rank_by: 'putts_per_round', putting: false });
    expect(playerFigures).toHaveBeenCalledWith([ELI, MAYA, NOAH], 'last10');
    expect((out.detail as { ranking: Array<{ player: string; value: number }> }).ranking.map((r) => [r.player, r.value])).toEqual([['Maya Ortiz', 29.8], ['Eli Brandt', 31.2], ['Noah Kim', 33]]);
    const failed = await tool().run(ctxFor(coach, { teamStats: async () => teamPage(), playerFigures: async () => null }), { window: 'last10', rank_by: 'putts_per_round', putting: false });
    expect(failed.coverage).toBe('partial');
    expect(failed.coverage_note).toContain('Could not read');
  });

  it('a failed page is unavailable, never an empty team', async () => {
    expect((await tool().run(ctxFor(coach, { teamStats: async () => null }), { window: 'last10', putting: false })).coverage).toBe('unavailable');
    expect((await tool().run(ctxFor(coach, {}), { window: 'last10', putting: false })).coverage).toBe('unavailable');
  });
});

const roundRow = (i: number, over: Partial<TeamRoundRow> = {}): TeamRoundRow => ({ id: `r${i}`, date: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, course: 'Pine Hill', type: 'tournament', holes: 18, score: 72 + (i % 5), toPar: i % 5, putts: 30, countable: true, playerId: i % 2 ? ELI : MAYA, player: i % 2 ? 'Eli Brandt' : 'Maya Ortiz', ...over });
const roundsPage = (list: TeamRoundRow[], over: Partial<TeamRoundsScreen> = {}): TeamRoundsScreen => ({ seasonStart: '2026-08-01', rounds: { list, error: false }, rosterError: false, season: { rounds: list.length, players: 2, avg: 74, underPar: 1, best: null }, ...over });

describe('get_rounds: the Rounds page\'s list, with the adding up done here', () => {
  const tool = () => read<{ player_ids?: string[]; round_type?: string; from?: string; to?: string; list: number }>(coach, 'get_rounds');

  it('averages only full rounds the page counts, and lists at most thirty', async () => {
    const list = [...Array.from({ length: 40 }, (_, i) => roundRow(i)), roundRow(100, { playerId: ELI, player: 'Eli Brandt', holes: 9, score: 38 }), roundRow(101, { playerId: ELI, player: 'Eli Brandt', countable: false, score: 120 })];
    const out = await tool().run(ctxFor(coach, { teamRounds: async () => roundsPage(list) }), { list: 30 });
    const detail = out.detail as { rounds: unknown[]; rounds_total: number; per_player: Array<{ player: string; rounds: number; counted: number; avg_score: number }> };
    expect(detail.rounds).toHaveLength(30);
    expect(detail.rounds_total).toBe(42);
    const eli = detail.per_player.find((p) => p.player === 'Eli Brandt');
    expect(eli).toMatchObject({ rounds: 22, counted: 20 });
    const expected = Math.round((list.filter((r) => r.playerId === ELI && r.countable && r.holes === 18).reduce((s, r) => s + r.score, 0) / 20) * 10) / 10;
    expect(eli?.avg_score).toBe(expected);
    expect(out.measurements.find((m) => m.entity.id === ELI)).toMatchObject({ value: expected, sample_size: 20, source: 'Rounds page' });
    // The Rounds page's season line counts practice rounds; the Roster's season average does not. The read says which this is, when it gives it.
    const season = textOf(out).split('\n').find((line) => line.startsWith('This season'));
    if (season) expect(season).toMatch(/every round type with practice rounds included: .*The season scoring average that leaves practice rounds out comes from the season read\.$/);
  });

  it('labels the Rounds page\'s season line as every round type, and points to get_season for the season average', async () => {
    const page = roundsPage([roundRow(1), roundRow(2)]);
    const out = await tool().run(ctxFor(coach, { teamRounds: async () => ({ ...page, season: { ...page.season, rounds: 2, players: 1, avg: 73.5, underPar: 0, best: null } }) }), { list: 10 });
    expect(textOf(out)).toMatch(/This season \(since [^)]+\), as the Rounds page shows it, every round type with practice rounds included: 2 full rounds by 1 player, average 73\.5, 0 under par\. The season scoring average that leaves practice rounds out comes from the season read\./);
  });

  it('never lists a round of someone who is not on the roster', async () => {
    const out = await tool().run(ctxFor(coach, { teamRounds: async () => roundsPage([roundRow(1), roundRow(2, { playerId: OUTSIDER, player: 'Former Player' })]) }), { list: 10 });
    expect(JSON.stringify(out)).not.toContain('Former Player');
  });

  it('a failed list is unavailable; a filter that matches nothing is empty', async () => {
    expect((await tool().run(ctxFor(coach, { teamRounds: async () => roundsPage([], { rounds: { list: [], error: true } }) }), { list: 10 })).coverage).toBe('unavailable');
    expect((await tool().run(ctxFor(coach, { teamRounds: async () => null }), { list: 10 })).coverage).toBe('unavailable');
    expect((await tool().run(ctxFor(coach, { teamRounds: async () => roundsPage([roundRow(1)]) }), { round_type: 'practice', list: 10 })).coverage).toBe('empty');
  });
});

describe('get_season and get_qualifiers: the screen\'s own figures and order', () => {
  const roster: RosterScreen = { teamName: 'Rini University', season: '2026-27', players: [{ id: ELI, name: 'Eli Brandt', status: 'active', rounds: 12, avg: 74.4, sgPerRound: 0.3, sgLegs: { tee: 0, approach: 0, around: 0, putting: 0 }, trend: [], form: 'steady' }, { id: MAYA, name: 'Maya Ortiz', status: 'active', rounds: 11, avg: 73.8, sgPerRound: null, sgLegs: { tee: null, approach: null, around: null, putting: null }, trend: [], form: 'improving' }], playersError: false, statsError: false, teamAvg: 74.12 };

  it('the season figures are the Roster page\'s', async () => {
    const out = await read<{ compare_last_season: boolean }>(coach, 'get_season').run(ctxFor(coach, { roster: async () => roster }), { compare_last_season: false });
    expect(out.measurements.find((m) => m.entity.kind === 'team')).toMatchObject({ value: 74.1, source: 'Roster page' });
    expect((out.detail as { players: Array<{ player: string; place: number }> }).players.map((p) => [p.player, p.place])).toEqual([['Maya Ortiz', 1], ['Eli Brandt', 2]]);
    expect((await read<{ compare_last_season: boolean }>(coach, 'get_season').run(ctxFor(coach, { roster: async () => ({ ...roster, statsError: true }) }), { compare_last_season: false })).coverage).toBe('unavailable');
  });

  it('a qualifier board keeps the board\'s order and says who has fewer rounds than the leaders', async () => {
    const board: QualifierBoardScreen = { id: 'q1', name: 'Fall qualifier', status: 'in_progress', selectionState: 'open', startDate: '2026-09-25', endDate: '2026-09-26', numRounds: 2, squad: 5, picks: 1, entrants: 3, board: { rows: [{ playerId: MAYA, name: 'Maya Ortiz', position: 1, tied: false, played: 2, toPar: 3, total: 147, avg: 73.5, shortRounds: 0, state: 'qualifying' }, { playerId: ELI, name: 'Eli Brandt', position: 2, tied: false, played: 1, toPar: -1, total: 71, avg: 71, shortRounds: 0, state: null }], unscored: [{ playerId: NOAH, name: 'Noah Kim' }] }, selections: null, entriesError: false, roundsError: false };
    const qualifierBoard = vi.fn(async () => board);
    const out = await read<{ qualifier_id?: string; limit: number }>(coach, 'get_qualifiers').run(ctxFor(coach, { qualifierBoard }), { qualifier_id: '00000000-0000-4000-8000-00000000aaaa', limit: 5 });
    // Eli is under par but a round short: the board ranks him below the full card, and so does the read.
    expect((out.detail as { standings: Array<{ player: string; position: string }> }).standings.map((s) => [s.player, s.position])).toEqual([['Maya Ortiz', '1'], ['Eli Brandt', '2']]);
    expect(textOf(out)).toContain('Eli Brandt: \u22121 to par, 71 strokes over 1 round (fewer rounds than the leaders, so ranked below every complete card)');
    expect(textOf(out)).not.toMatch(/Maya Ortiz: [^\n]*ranked below/);
    expect((out.detail as { standings: Array<{ fewer_rounds_than_leaders: boolean }> }).standings.map((s) => s.fewer_rounds_than_leaders)).toEqual([false, true]);
    // The board's `shortRounds` is a different fact (a counted round that was not 18 holes) and is said as that, never as a missed round.
    const nine = { ...board, board: { ...board.board!, rows: board.board!.rows.map((r) => (r.playerId === MAYA ? { ...r, shortRounds: 1 } : r)) } };
    const withNine = textOf(await read<{ qualifier_id?: string; limit: number }>(coach, 'get_qualifiers').run(ctxFor(coach, { qualifierBoard: async () => nine }), { qualifier_id: '00000000-0000-4000-8000-00000000aaaa', limit: 5 }));
    expect(withNine).toContain('Maya Ortiz: +3 to par, 147 strokes over 2 rounds (1 of the rounds not 18 holes)');
    expect(textOf(out)).toContain('No score yet: Noah Kim');
    expect((await read<{ qualifier_id?: string; limit: number }>(coach, 'get_qualifiers').run(ctxFor(coach, { qualifierBoard: async () => ({ ...board, roundsError: true }) }), { qualifier_id: '00000000-0000-4000-8000-00000000aaaa', limit: 5 })).coverage).toBe('unavailable');
  });
});

function roundPage(over: Partial<RoundReviewScreen> = {}): RoundReviewScreen {
  const pars = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5];
  // Two birdies, two bogeys, one double: 74 on a par 72, with one three-putt.
  const over_ = new Map([[1, -1], [7, -1], [4, 1], [12, 1], [16, 2]]);
  return {
    id: 'round-1', playerId: ELI, playerName: 'Eli Brandt', date: '2026-11-02', course: 'Pine Hill', type: 'tournament', holesPlayed: 18, score: 74, toPar: 2,
    front: { score: 36, toPar: 0 }, back: { score: 38, toPar: 2 }, putts: 31, fairways: { hit: 9, of: 14 }, greens: { hit: 11, of: 18 },
    strokesGained: { total: 0.84, tee: 0.31, approach: -0.42, around: 0.2, putting: 0.75 },
    recap: null, notes: 'Wind on the back nine.', coachNote: 'Good patience.',
    holes: pars.map((par, i) => ({ n: i + 1, par, yards: 400, score: par + (over_.get(i + 1) ?? 0), putts: i + 1 === 16 ? 3 : i + 1 === 1 ? 1 : 2, fairway: par === 3 ? null : true, gir: !over_.has(i + 1) || (over_.get(i + 1) ?? 0) < 0, penalties: i + 1 === 16 ? 1 : 0 })),
    holesError: false,
    ...over,
  };
}

describe('get_round: the Round page\'s round, with its counting done here', () => {
  const tool = () => read<{ round_id: string }>(coach, 'get_round');

  it('quotes the page\'s totals and strokes gained, and counts the holes itself', async () => {
    const roundReview = vi.fn(async (): Promise<RoundReviewLoad> => ({ kind: 'ok', review: roundPage() }));
    const ctx = ctxFor(coach, { roundReview });
    const out = await tool().run(ctx, { round_id: 'round-1' });
    expect(roundReview).toHaveBeenCalledWith('round-1');
    // The chat made no round or hole read of its own.
    expect(ctx.db.of('golf_rounds')).toHaveLength(0);
    expect(ctx.db.of('golf_holes')).toHaveLength(0);
    const value = (id: string) => out.measurements.find((m) => m.metric_id === id)?.value;
    expect([value('total_score'), value('score_to_par'), value('putts'), value('sg_total'), value('sg_approach')]).toEqual([74, 2, 31, 0.84, -0.42]);
    expect(out.measurements.every((m) => m.source === 'Round page' && m.entity.id === ELI)).toBe(true);
    const detail = out.detail as { kind: string; holes: Array<{ hole_number: number; par: number; score: number }>; tallies: { birdies_or_better: number; bogeys: number; doubles_or_worse: number; three_putts: number; penalty_strokes: number } };
    // The shape the hole strip draws from.
    expect(detail.kind).toBe('hole_strip');
    expect(detail.holes).toHaveLength(18);
    expect(detail.holes[0]).toMatchObject({ hole_number: 1, par: 4, score: 3 });
    expect(detail.tallies).toMatchObject({ birdies_or_better: 2, bogeys: 2, doubles_or_worse: 1, three_putts: 1, penalty_strokes: 1 });
    const text = textOf(out);
    expect(text).toContain('Eli Brandt, Pine Hill on 2026-11-02: 74 (+2 to par) over 18 holes, front nine 36, back nine 38. Source: Round page.');
    expect(text).toContain('2 birdies or better');
    expect(text).toContain('approach \u22120.42');
    expect(text).toContain('The coach\'s note on the round: "Good patience."');
  });

  it('a round the page could not read is unavailable; one not on the team or still being played is empty', async () => {
    const run = async (load: RoundReviewLoad | null | 'throws') => (await tool().run(ctxFor(coach, { roundReview: async () => { if (load === 'throws') throw new Error('down'); return load; } }), { round_id: 'r' })).coverage;
    expect(await run({ kind: 'error' })).toBe('unavailable');
    expect(await run(null)).toBe('unavailable');
    expect(await run('throws')).toBe('unavailable');
    expect(await run({ kind: 'notFound' })).toBe('empty');
    expect(await run({ kind: 'inProgress' })).toBe('empty');
    // No page bound: said as a failure, never as a round with no holes.
    expect((await tool().run(ctxFor(coach), { round_id: 'r' })).coverage).toBe('unavailable');
  });

  it('holes that failed leave the totals standing and say so', async () => {
    const out = await tool().run(ctxFor(coach, { roundReview: async () => ({ kind: 'ok', review: roundPage({ holes: [], holesError: true }) }) }), { round_id: 'round-1' });
    expect(out.coverage).toBe('partial');
    expect(out.coverage_note).toMatch(/holes could not be read/);
    expect(out.measurements.find((m) => m.metric_id === 'total_score')?.value).toBe(74);
  });
});

describe('get_tournaments: the Tournaments page, newest first, with the adding up done here', () => {
  const home = (): TournamentsLoad => ({
    kind: 'ready',
    data: {
      players: [{ id: ELI, name: 'Eli Brandt' }, { id: MAYA, name: 'Maya Ortiz' }],
      errors: {},
      events: [
        { id: 'ev-old', name: 'Fall Opener', startDate: '2026-09-12', endDate: '2026-09-13', format: { kind: '5c4', players: 5, counting: 4, holes: 18 }, kind: 'tournament', status: 'complete', legacy: false, rounds: [{ number: 1, date: '2026-09-12', status: 'final', par: 72 }, { number: 2, date: '2026-09-13', status: 'final', par: 72 }], playerRounds: [{ roundNumber: 1, playerId: ELI, total: 73, toPar: 1, status: 'final' }, { roundNumber: 2, playerId: ELI, total: 71, toPar: -1, status: 'final' }, { roundNumber: 1, playerId: MAYA, total: 70, toPar: -2, status: 'final' }, { roundNumber: 2, playerId: MAYA, total: 72, toPar: 0, status: 'final' }], finish: { place: 'T3', placeN: 3, of: 12 }, lineup: { status: 'locked', set: 5, of: 5 } },
        { id: 'ev-new', name: 'Pine Hill Invitational', startDate: '2026-11-20', endDate: '2026-11-21', format: { kind: '5c4', players: 5, counting: 4, holes: 18 }, kind: 'tournament', status: 'upcoming', legacy: false, rounds: [{ number: 1, date: '2026-11-20', status: 'scheduled', par: 72 }], playerRounds: [], finish: null, lineup: { status: 'draft', set: 3, of: 5 } },
      ],
    },
  });
  const tool = () => {
    flags.tournaments = true;
    const found = read<{ limit: number; notes: boolean }>(coach, 'get_tournaments');
    flags.tournaments = false;
    return found;
  };

  it('is not offered while the tournaments flag is off', () => {
    expect(toolsFor('ask', coach).some((t) => t.name === 'get_tournaments')).toBe(false);
  });

  it('lists the page\'s events newest first and adds each player\'s rounds up', async () => {
    const tournaments = vi.fn(async () => home());
    const ctx = ctxFor(coach, { tournaments });
    const out = await tool().run(ctx, { limit: 6, notes: false });
    expect(out.coverage).toBe('complete');
    const list = (out.detail as { tournaments: Array<{ name: string; lineup: string; team_place: string | null; players: Array<{ player: string; total: number | null; to_par: number | null }> }> }).tournaments;
    expect(list.map((t) => t.name)).toEqual(['Pine Hill Invitational', 'Fall Opener']);
    expect(list[0]).toMatchObject({ lineup: 'draft', team_place: null, players: [] });
    // Lowest total first: Maya 142, Eli 144.
    expect(list[1]!.players.map((p) => [p.player, p.total, p.to_par])).toEqual([['Maya Ortiz', 142, -2], ['Eli Brandt', 144, 0]]);
    const text = textOf(out);
    expect(text).toContain('Fall Opener (2026-09-12 to 2026-09-13, complete): lineup locked, 5 of 5 set, the team finished T3 of 12, 2 rounds. Source: Tournaments page.');
    expect(text).toContain('Fall Opener, Maya Ortiz: 142 over 2 rounds (\u22122 to par); by round 70, 72');
    // No tournament table was read by the chat itself.
    expect(ctx.db.calls).toEqual([]);
  });

  it('a failed page is unavailable, and a team with none set up is empty', async () => {
    const run = async (load: TournamentsLoad | null) => (await tool().run(ctxFor(coach, { tournaments: async () => load }), { limit: 6, notes: false })).coverage;
    expect(await run({ kind: 'failed' })).toBe('unavailable');
    expect(await run(null)).toBe('unavailable');
    expect(await run({ kind: 'not_set_up' })).toBe('empty');
    const partial = home();
    if (partial.kind === 'ready') partial.data.errors = { events: true };
    expect(await run(partial)).toBe('unavailable');
  });
});

describe('what each surface is offered', () => {
  const names = (tools: ChatTool[]) => tools.map((t) => t.name);

  it('a coach keeps every capability, on fewer tools', () => {
    const ask = toolsFor('ask', coach);
    expect(names(ask)).toEqual(['get_player_stats', 'get_team_stats', 'get_rounds', 'get_round', 'get_shots', 'get_season', 'get_qualifiers', 'get_schedule', 'get_coachhelm', 'get_practice', 'get_reference', 'query_team_data', 'summarise_data', 'show_visual', 'find_thread', 'find_in_app', 'save_note', 'remove_note', 'write_artifact', 'ask_practice_brief', 'draft_practice_plan', 'draft_message', 'draft_poll', 'draft_board', 'create_event', 'create_trip', 'create_qualifier', 'create_goal', 'add_round_note', 'add_blocked_time', 'add_team_break', 'save_team_term', 'set_availability_note', 'create_recruit', 'create_recurring_practice', 'create_focus_area', 'create_task', 'create_team_announcement', 'create_drill', 'publish_practice_plan', 'publish_artifact', 'send_event_reminder', 'record_attendance', 'update_event', 'cancel_event', 'set_focus_area_status', 'set_goal_state', 'mark_signal_handled', 'set_qualifier_coach_pick', 'set_task_reminder', 'dismiss_signal', 'log_focus_progress', 'record_focus_outcome']);
    expect(new Set(names(ask)).size).toBe(ask.length);
  });

  it('quick chat sends and does not keep documents or hand drafts to Messages', () => {
    const quick = names(toolsFor('quick_chat', coach));
    expect(quick).toContain('send_message');
    for (const absent of ['publish_artifact', 'write_artifact', 'draft_message', 'draft_poll']) expect(quick).not.toContain(absent);
  });

  it('a player is offered reads of their own data and nothing that writes, ranks or reads the team', () => {
    const tools = toolsFor('player', maya);
    expect(names(tools)).toEqual(['get_player_stats', 'get_round', 'get_shots', 'get_season', 'get_schedule', 'get_coachhelm', 'get_reference', 'summarise_data', 'show_visual', 'find_in_app']);
    expect(tools.every((t) => t.kind === 'read')).toBe(true);
    // The session decides, whatever surface the request names.
    expect(names(toolsFor('ask', maya))).toEqual(names(tools));
    expect(toolsFor('player', coach)).toEqual([]);
  });
});

describe('a player cannot reach a teammate\'s figure or a coach-only field', () => {
  it('the Stats read is always the caller\'s own, whatever ids the model sends', async () => {
    const playerStats = vi.fn(async (_id: string, _window: string) => statsPage('Maya Ortiz'));
    const mine = read<Record<string, unknown>>(maya, 'get_player_stats');
    // The player's schema has no player field at all.
    expect(mine.input.safeParse({ player_ids: [ELI], window: 'last10', sections: null }).success).toBe(false);
    expect(mine.input.safeParse({ window: 'last10', sections: null }).success).toBe(true);
    await mine.run(ctxFor(maya, { playerStats }), { player_ids: [ELI], window: 'last10', sections: [] });
    // And the coach's tool, run in a player's session, still reads only the caller.
    await read<Record<string, unknown>>(coach, 'get_player_stats').run(ctxFor(maya, { playerStats }), { player_ids: [ELI, NOAH], window: 'last10', sections: [] });
    expect(playerStats.mock.calls.map((c) => c[0])).toEqual([MAYA, MAYA]);
  });

  it('a teammate\'s round reads as no round at all, and the Round page is never asked for it', async () => {
    const roundReview = vi.fn(async (): Promise<RoundReviewLoad> => ({ kind: 'ok', review: roundPage({ id: 'round-eli', playerId: ELI, playerName: 'Eli Brandt' }) }));
    const ctx = ctxFor(maya, { roundReview }, { golf_rounds: { rows: [{ id: 'round-eli', player_id: ELI, team_id: 'team-1', round_date: '2026-10-01', course_name: 'Pine Hill', total_score: 70, score_to_par: -2 }] } });
    const out = await read<{ round_id: string }>(maya, 'get_round').run(ctx, { round_id: 'round-eli' });
    expect(out.coverage).toBe('empty');
    expect(JSON.stringify(out)).not.toContain('Pine Hill');
    expect(JSON.stringify(out)).not.toContain('Eli');
    expect(roundReview).not.toHaveBeenCalled();
    expect(ctx.db.of('golf_holes')).toHaveLength(0);
    // The check is on the caller's own id, whatever the model sent.
    expect(ctx.db.of('golf_rounds').some((c) => c.method === 'eq' && c.args[0] === 'player_id' && c.args[1] === MAYA)).toBe(true);
  });

  it('and if the page ever handed back someone else\'s round, it is still not shown', async () => {
    const roundReview = vi.fn(async (): Promise<RoundReviewLoad> => ({ kind: 'ok', review: roundPage({ id: 'round-x', playerId: ELI, playerName: 'Eli Brandt' }) }));
    const ctx = ctxFor(maya, { roundReview }, { golf_rounds: { rows: [{ id: 'round-x', player_id: MAYA }] } });
    const out = await read<{ round_id: string }>(maya, 'get_round').run(ctx, { round_id: 'round-x' });
    expect(out.coverage).toBe('empty');
    expect(JSON.stringify(out)).not.toContain('Eli');
  });

  it('a player\'s own round is read from the Round page and worded to them', async () => {
    const roundReview = vi.fn(async (): Promise<RoundReviewLoad> => ({ kind: 'ok', review: roundPage({ id: 'round-m', playerId: MAYA, playerName: 'Maya Ortiz', coachNote: null }) }));
    const ctx = ctxFor(maya, { roundReview }, { golf_rounds: { rows: [{ id: 'round-m', player_id: MAYA }] } });
    const out = await read<{ round_id: string }>(maya, 'get_round').run(ctx, { round_id: 'round-m' });
    expect(roundReview).toHaveBeenCalledWith('round-m');
    expect(out.coverage).toBe('complete');
    expect(out.measurements.find((m) => m.metric_id === 'total_score')?.value).toBe(74);
  });

  it('the player\'s CoachHelm and reference readers do not offer the coach\'s parts', async () => {
    expect(read(maya, 'get_coachhelm').input.safeParse({ what: ['signals'] }).success).toBe(false);
    expect(read(maya, 'get_coachhelm').input.safeParse({ what: ['causes'] }).success).toBe(false);
    expect(read(maya, 'get_reference').input.safeParse({ topic: 'documents' }).success).toBe(false);
    expect(read(maya, 'get_reference').input.safeParse({ topic: 'data_dictionary' }).success).toBe(false);
    // The coach's reference reader, run in a player's session, refuses the coach's topics too.
    const out = await read<{ topic: string }>(coach, 'get_reference').run(ctxFor(maya), { topic: 'documents' });
    expect(out.coverage).toBe('unavailable');
  });

  it('the schedule carries the player\'s own reply and nobody else\'s', async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const ctx = ctxFor(maya, {}, { golf_events: { rows: [{ id: 'ev1', team_id: 'team-1', title: 'Team meeting', event_type: 'meeting', start_time: soon, end_time: soon, location: null, requires_rsvp: true, rsvp_deadline: null, status: 'scheduled', all_day: false }] }, golf_event_attendance: { rows: [{ event_id: 'ev1', player_id: MAYA, status: 'accepted' }, { event_id: 'ev1', player_id: ELI, status: 'declined' }] } });
    const out = await read<{ days_ahead: number }>(maya, 'get_schedule').run(ctx, { days_ahead: 14 });
    expect(ctx.db.of('golf_event_attendance').some((c) => c.method === 'eq' && c.args[0] === 'player_id' && c.args[1] === MAYA)).toBe(true);
    expect(JSON.stringify(out)).not.toContain('declined');
    expect(JSON.stringify(out)).not.toContain(ELI);
  });

  it('a player\'s season comes from their own Stats page, never the Roster page', async () => {
    const roster = vi.fn(async () => null);
    const playerStats = vi.fn(async () => statsPage('Maya Ortiz'));
    const out = await read<{ compare_last_season: boolean }>(maya, 'get_season').run(ctxFor(maya, { roster, playerStats }), { compare_last_season: false });
    expect(roster).not.toHaveBeenCalled();
    expect(playerStats).toHaveBeenCalledWith(MAYA, 'season');
    expect(out.measurements).toHaveLength(1);
    expect(out.measurements[0]).toMatchObject({ value: 74.6, sample_size: 14, entity: { id: MAYA } });
  });
});

/**
 * What the model reads it repeats. So no line a reader hands it may hold statistics notation or an abbreviation a coach
 * would not say aloud: the sample is in words ("over 10 rounds"), a distance is in feet or yards, an average is an
 * average. This runs over every line every reader produced in the tests above.
 */
describe('how reader lines read', () => {
  const BANNED: Array<[string, RegExp]> = [
    ['a sample as n=4, n: 4 or N-4', /\bn\s*[=:-]\s*\d/i],
    ['a bare count in brackets', /\(\s*\d[\d,]*\s*\)/],
    ['ft for feet', /\d\s?ft\b|\bft\b/],
    ['yd for yards', /\d\s?yds?\b|\byds?\b/],
    ['avg for average', /\bavg\b/i],
    ['pct for percent', /\bpct\b/i],
    ['L10 for the last 10 rounds', /\bL\d+\b/],
    ['SG for strokes gained', /\bSG\b/],
    ['a hyphen for a minus sign before a figure', /(^|[\s:(|])-\d/m],
    ['a column or table name', /\b[a-z]+_[a-z_]+\b/],
  ];
  it('no reader hands the model notation, an abbreviation or a column name', () => {
    expect(SEEN_TEXT.length).toBeGreaterThan(25);
    const found: string[] = [];
    for (const { tool, text } of SEEN_TEXT) for (const line of text.split('\n')) for (const [what, re] of BANNED) if (re.test(line)) found.push(`${tool}: ${what}: ${line.slice(0, 200)}`);
    expect([...new Set(found)]).toEqual([]);
  });
});
