import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CoachChatContext } from '../context';
import { getTeamStrokesGained } from '../practice-reads';
import { collectDates, collectEnvelopeNumbers } from '../provenance';
import type { ToolEnvelope } from '../provenance';
import { computeTurnVerdict } from '../verdict';
import { compileComposition } from '../visuals/compile-composition';
import { CompositionSpec } from '../visuals/composition';

// Staging, 2026-11-07: "Where is the team losing the most strokes this season? Show me." The model read
// get_team_strokes_gained, asked show_visual for a split on that read, and was told "a split needs at least two signed
// figures": the read kept all four areas in `detail.areas` and returned `measurements: []`, and a composed visual draws
// from measurements only. The answer then said "The chart wouldn't draw from this read".

const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Demo University Golf',
  timezone: 'America/New_York',
  roster: [{ id: 'p1', name: 'Cole Bennett', first_name: 'Cole', last_name: 'Bennett', graduation_year: null }],
};

/** One queued PostgREST answer; every builder method chains. */
function sbWith(data: unknown[]) {
  return {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) chain[m] = vi.fn(() => chain);
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve, reject);
      return chain;
    }),
  } as never;
}

const round = (round_date: string, tee: number, approach: number, around: number, putting: number) => ({
  round_date,
  strokes_gained_tee: tee,
  strokes_gained_approach: approach,
  strokes_gained_around_green: around,
  strokes_gained_putting: putting,
});
const rows = [round('2026-10-21', 1, -4, 0, -3), round('2026-10-21', 0, -3, -1, -4), round('2026-09-26', 0.5, -3.5, 0.2, -2)];

describe('get_team_strokes_gained is a chartable read', () => {
  it('returns the four areas as team measurements and keeps detail.areas for the picture', async () => {
    const env = await getTeamStrokesGained(sbWith(rows), ctx, { rounds: 30 });
    expect(env.measurements.map((m) => [m.metric_id, m.value])).toEqual([
      ['sg_tee', 0.5],
      ['sg_approach', -3.5],
      ['sg_around_green', -0.27],
      ['sg_putting', -3],
    ]);
    expect(env.measurements.every((m) => m.entity.kind === 'team' && m.entity.id === 'team-1' && m.unit === 'strokes' && m.sample_size === 3 && m.sample_unit === 'rounds')).toBe(true);
    expect(env.measurements.every((m) => m.window_start === '2026-09-26' && m.window_end === '2026-10-21')).toBe(true);
    expect(env.detail).toMatchObject({ areas: { tee: 0.5, approach: -3.5, short: -0.27, putting: -3 }, sample_size: 3 });
    // The model hedged "per round or totals?" because the summary did not say.
    expect(env.summary).toMatch(/average per round/);
  });

  it('leaves out an area with no value instead of drawing a zero', async () => {
    const env = await getTeamStrokesGained(sbWith([{ ...rows[0]!, strokes_gained_putting: null }]), ctx, { rounds: 30 });
    expect(env.measurements.map((m) => m.metric_id)).toEqual(['sg_tee', 'sg_approach', 'sg_around_green']);
  });

  it('draws the exact split the model asked for on staging', async () => {
    const env = await getTeamStrokesGained(sbWith(rows), ctx, { rounds: 30 });
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
    const env: ToolEnvelope = await getTeamStrokesGained(sbWith(rows), ctx, { rounds: 30 });
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
    const said = 'The team\'s strokes gained by area, over 3 player rounds:\n\n- **Approach:** -3.50\n- **Putting:** -3.00\n- **Short game:** -0.27\n- **Off the tee:** +0.50';
    expect(verdict(said)).toEqual({ outcome: 'accepted' });
    // A figure that is not in the read is still caught.
    expect(verdict(said.replace('-0.27', '-1.94')).outcome).toBe('rejected');
  });
});
