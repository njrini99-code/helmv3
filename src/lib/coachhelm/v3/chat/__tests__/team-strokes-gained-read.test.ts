import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CoachChatContext } from '../context';
import { getTeamStrokesGained } from '../practice-reads';
import { loadTeamStrokesGained } from '@/clubhouse/data/team-sg';
import { collectDates, collectEnvelopeNumbers } from '../provenance';
import type { ToolEnvelope } from '../provenance';
import { computeTurnVerdict } from '../verdict';
import { compileComposition } from '../visuals/compile-composition';
import { CompositionSpec } from '../visuals/composition';

// Staging, 2026-11-07: "Where is the team losing the most strokes this season? Show me." The model read
// get_team_strokes_gained, asked show_visual for a split on that read, and was told "a split needs at least two signed
// figures": the read kept all four areas in `detail.areas` and returned `measurements: []`, and a composed visual draws
// from measurements only. The answer then said "The chart wouldn't draw from this read".

vi.mock('@/clubhouse/lib/track-server', () => ({ chLogServer: vi.fn() }));

const person = (id: string, name: string) => ({ id, name, first_name: name, last_name: null, graduation_year: null });
const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Demo University Golf',
  timezone: 'America/New_York',
  roster: [person('p1', 'Cole'), person('p2', 'Owen')],
};

/** The rounds read, as PostgREST answers it; every builder method chains. */
function sbWith(data: unknown[]) {
  return {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'in', 'eq', 'not', 'gte', 'order', 'range']) chain[m] = vi.fn(() => chain);
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve, reject);
      return chain;
    }),
  } as never;
}

let seq = 0;
const round = (player_id: string, round_date: string, legs: [number, number, number, number], over: Record<string, unknown> = {}) => ({
  id: `r${String(++seq).padStart(3, '0')}`, player_id, course_id: null, course_name: 'Home', tees_played: null, round_date, round_type: 'tournament',
  total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, holes_played: 18, total_putts: 30, total_gir: 10, total_gir_possible: 18,
  total_fairways_hit: 8, total_fairways: 14, strokes_gained_tee: legs[0], strokes_gained_approach: legs[1], strokes_gained_around_green: legs[2],
  strokes_gained_putting: legs[3], strokes_gained_total: legs[0] + legs[1] + legs[2] + legs[3], ...over,
});
// Cole has twelve rounds; the ten newest are the window, and the two oldest (very good ones) must stay out of it. Owen has three.
const colesOld = [round('p1', '2026-08-26', [2, 2, 2, 2]), round('p1', '2026-08-27', [2, 2, 2, 2])];
const coles = Array.from({ length: 10 }, (_, i) => round('p1', `2026-10-${String(12 + i).padStart(2, '0')}`, [-1, -4, 0, -3]));
const owens = [round('p2', '2026-09-26', [1, -3, -1, -2]), round('p2', '2026-09-19', [0.5, -3, -0.5, -2]), round('p2', '2026-09-12', [0, -2, 0, -1])];
const rows = [...coles, ...colesOld, ...owens];
// (10 × -1 + 1 + 0.5 + 0) / 13 and so on, per leg, over the 13 rounds in the window.
const mean = (pick: (r: (typeof rows)[number]) => number) => Number(([...coles, ...owens].reduce((a, r) => a + pick(r), 0) / 13).toFixed(2));

/** The read as the route wires it: Clubhouse's loader handed to the tool. */
const read = (data: unknown[], window?: 'season') =>
  getTeamStrokesGained((w) => loadTeamStrokesGained(sbWith(data) as never, { timezone: ctx.timezone, playerIds: ctx.roster.map((p) => p.id) }, w), { id: ctx.team_id, name: ctx.team_name }, window ? { window } : {});

describe('get_team_strokes_gained is a chartable read on the one strokes-gained source', () => {
  it('reads each player’s newest ten rounds: the figures are the Stats page’s, and the measurements are the areas', async () => {
    const env = await read(rows);
    const tee = mean((r) => r.strokes_gained_tee);
    const approach = mean((r) => r.strokes_gained_approach);
    const around = mean((r) => r.strokes_gained_around_green);
    const putting = mean((r) => r.strokes_gained_putting);
    expect(env.detail).toMatchObject({ areas: { tee, approach, short: around, putting }, sample_size: 13, players_with_rounds: 2, window: 'last10', window_start: '2026-09-12', window_end: '2026-10-21' });
    // The measurements ARE detail.areas: the same numbers over the same rounds, so a chart and a sentence cannot disagree.
    const areas = (env.detail as { areas: Record<string, number> }).areas;
    expect(Object.fromEntries(env.measurements.map((m) => [m.metric_id, m.value]))).toEqual({ sg_tee: areas.tee, sg_approach: areas.approach, sg_around_green: areas.short, sg_putting: areas.putting });
    expect(env.measurements.every((m) => m.entity.kind === 'team' && m.unit === 'strokes' && m.sample_size === 13 && m.sample_unit === 'rounds' && m.window_start === '2026-09-12' && m.window_end === '2026-10-21')).toBe(true);
    // The summary says what the average is of, in words (the model hedged "per round or totals?" without it).
    expect(env.summary).toMatch(/average per round over each player’s newest ten rounds, from 13 rounds by 2 players/);
  });

  it('the season window reads every round since the season began, and says so', async () => {
    const env = await read(rows, 'season');
    expect(env.detail).toMatchObject({ window: 'season', sample_size: 15 });
    expect(env.summary).toMatch(/this season/);
    // Two players is not a team: the read says it is thin.
    expect(env.coverage).toBe('partial');
    expect(env.coverage_note).toMatch(/lean read/);
  });

  it('leaves an area under the floor out instead of drawing a zero', async () => {
    const two = [round('p1', '2026-10-20', [1, 1, 1, 1]), round('p1', '2026-10-21', [1, 1, 1, 1])];
    const env = await read(two);
    expect(env.measurements).toEqual([]);
    expect(env.coverage).toBe('empty');
  });

  it('draws the exact split the model asked for on staging', async () => {
    const env = await read(rows);
    const spec = CompositionSpec.parse({
      kind: 'compose',
      title: 'Approach play and putting are where the team loses strokes',
      lede: 'Team strokes gained by part of the game, from the most recent recorded rounds.',
      intent: 'locate',
      layout: 'stack',
      blocks: [
        { type: 'split', refs: ['e1'] },
        { type: 'note', kind: 'measured', text: 'Tee play is the only clearly positive area; short game is close to even.' },
      ],
    });
    const result = compileComposition(spec, new Map([['e1', env]]), new Date('2026-11-08T02:11:06.000Z'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dropped).toEqual([]);
    const split = result.composition.blocks[0];
    expect(split?.type === 'split' && split.measurements.map((m) => m.metric_id)).toEqual(['sg_tee', 'sg_approach', 'sg_around_green', 'sg_putting']);
    // Every figure in the read is drawn, so the plain evidence card is not repeated under the chart.
    expect(result.composition.evidenceRefs).toEqual(['e1']);
  });

  it('keeps the four figures the model quotes grounded, on the team measurements and the detail alike', async () => {
    const env: ToolEnvelope = await read(rows);
    const a = (env.detail as { areas: Record<string, number> }).areas;
    const verdict = (text: string) =>
      computeTurnVerdict({
        streamComplete: true,
        text,
        measurements: env.measurements,
        series: [],
        detailNumbers: collectEnvelopeNumbers(env),
        detailDates: env.detail === undefined ? [] : collectDates(env.detail, ctx.timezone),
        timezone: ctx.timezone,
        players: ctx.roster,
      });
    const said = `The team's strokes gained by area, over 13 rounds:\n\n- **Approach:** ${a.approach}\n- **Putting:** ${a.putting}\n- **Short game:** ${a.short}\n- **Off the tee:** ${a.tee}`;
    expect(verdict(said)).toEqual({ outcome: 'accepted' });
    // A figure that is not in the read is still caught.
    expect(verdict(said.replace(String(a.short), '-7.77')).outcome).toBe('rejected');
  });
});
