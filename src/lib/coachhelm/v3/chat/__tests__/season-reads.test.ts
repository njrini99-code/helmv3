import { describe, expect, it, vi } from 'vitest';
import type { ChRound } from '@/clubhouse/data/season';
import type { CoachChatContext } from '../context';
import { compareSeasons } from '../engine-reads';
import { extractAndValidateChatClaims } from '../claims-packet';
import { collectDates, collectEnvelopeNumbers } from '../provenance';
import { getTeamRounds } from '../read-tools';
import { getSeasonScoring, seasonScoringEnvelope } from '../season-reads';
import { computeTurnVerdict } from '../verdict';

const person = (id: string, name: string) => ({ id, name, first_name: name, last_name: null, graduation_year: null });
const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Demo University',
  timezone: 'America/New_York',
  roster: [person('p-owen', 'Owen Carter'), person('p-cole', 'Cole Bennett'), person('p-none', 'Sam None')],
};

let id = 0;
const round = (player_id: string, total_score: number, over: Partial<ChRound> = {}): ChRound =>
  ({ id: `r${(id += 1)}`, player_id, round_date: '2026-09-25', round_type: 'qualifier', total_score, score_to_par: total_score - 72, front_nine: null, back_nine: null, holes_played: 18, total_putts: null, course_name: 'Home', strokes_gained_total: null, ...over }) as ChRound;

/** A PostgREST double that answers every read of `table` with `rows`, once per page. */
function sbWith(rows: unknown[], error: unknown = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const sb = {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'not', 'order', 'gte', 'limit', 'range']) {
        chain[m] = vi.fn((...args: unknown[]) => {
          calls.push({ method: m, args });
          return chain;
        });
      }
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: error ? null : rows, error }).then(resolve);
      return chain;
    }),
  };
  return { sb: sb as never, calls };
}

const season = { start: '2026-08-01', today: '2026-11-05' };

describe('get_season_scoring: Roster\'s rule', () => {
  const rounds = [
    round('p-owen', 74),
    round('p-owen', 71),
    round('p-cole', 70),
    round('p-cole', 71),
    round('p-cole', 69, { round_type: 'practice' }),
    round('p-cole', 36, { holes_played: 9 }),
  ];
  const env = seasonScoringEnvelope(ctx, rounds, null, season);
  const figure = (metric: string, who: string) => env.measurements.find((m) => m.metric_id === metric && m.entity.id === who);

  it('pools the team per round, with practice and 9-hole rounds left out', () => {
    expect(figure('season_scoring_average', 'team-1')).toMatchObject({ value: 71.5, sample_size: 4, window_start: '2026-08-01', window_end: '2026-11-05', sample_unit: 'rounds', entity: { kind: 'team' } });
    expect(figure('season_scoring_to_par', 'team-1')).toMatchObject({ value: -0.5, sample_size: 4 });
  });

  it('gives each player the rounds Roster gives them', () => {
    expect(figure('season_scoring_average', 'p-owen')).toMatchObject({ value: 72.5, sample_size: 2, entity: { kind: 'player', label: 'Owen Carter' } });
    expect(figure('season_scoring_average', 'p-cole')).toMatchObject({ value: 70.5, sample_size: 2 });
  });

  it('says what it left out and who has no rounds', () => {
    expect(env.coverage).toBe('partial');
    expect(env.coverage_note).toContain('1 practice round left out');
    expect(env.coverage_note).toContain('1 9-hole round left out');
    expect(env.coverage_note).toContain('No counted rounds for Sam None');
  });

  it('a player read carries no team figure', () => {
    const one = seasonScoringEnvelope(ctx, rounds.filter((r) => r.player_id === 'p-owen'), { id: 'p-owen', name: 'Owen Carter' }, season);
    expect(one.measurements.every((m) => m.entity.id === 'p-owen')).toBe(true);
    expect(JSON.stringify(one.detail)).not.toContain('Cole');
  });

  it('no counted rounds is empty, never a zero average', () => {
    const none = seasonScoringEnvelope(ctx, [round('p-owen', 70, { round_type: 'practice' })], null, season);
    expect(none.coverage).toBe('empty');
    expect(none.measurements).toEqual([]);
  });

  it('asks Roster\'s reader for this season, for the active roster', async () => {
    const { sb, calls } = sbWith([]);
    const read = await getSeasonScoring(sb, ctx, {});
    expect(read.coverage).toBe('empty');
    expect(calls.find((c) => c.method === 'in')?.args).toEqual(['player_id', ['p-owen', 'p-cole', 'p-none']]);
    expect(calls.find((c) => c.method === 'gte')?.args[0]).toBe('round_date');
    expect(String(calls.find((c) => c.method === 'gte')?.args[1])).toMatch(/-08-01$/);
  });

  it('a failed read is unavailable, not "no rounds"', async () => {
    const { sb } = sbWith([], { message: 'boom' });
    expect((await getSeasonScoring(sb, ctx, {})).coverage).toBe('unavailable');
  });

  it('refuses a player off the roster', async () => {
    const { sb } = sbWith([]);
    await expect(getSeasonScoring(sb, ctx, { player_id: 'p-stranger' })).rejects.toThrow();
  });

  const verdictFor = (text: string, cited: Array<{ metric: string; who: string; written?: number }>) => {
    const claims = cited.map((c, i) => {
      const m = figure(c.metric, c.who)!;
      return { claim_id: `c${i}`, metric_id: m.metric_id, value: c.written ?? m.value, player_id: m.entity.id, window_start: m.window_start, window_end: m.window_end, unit: m.unit, denominator: null, claim_type: 'fact' };
    });
    const { strippedText, claims: attempt } = extractAndValidateChatClaims(`${text}\n<<<CLAIMS>>>${JSON.stringify(claims)}<<<END_CLAIMS>>>`, env.measurements);
    return computeTurnVerdict({ streamComplete: true, text: strippedText, measurements: env.measurements, series: [], detailNumbers: collectEnvelopeNumbers(env), detailDates: collectDates(env.detail, ctx.timezone), timezone: ctx.timezone, players: ctx.roster, claims: attempt });
  };

  it('its numbers pass the audit and the claim gate, including a thin player figure', () => {
    const verdict = verdictFor(
      "The team's scoring average this season is 71.5 over 4 rounds, 0.5 under par. Owen Carter is at 72.5 over his 2 rounds, and Cole Bennett is at 70.5 over his 2 rounds. Practice is left out.",
      [
        { metric: 'season_scoring_average', who: 'team-1' },
        { metric: 'season_scoring_average', who: 'p-owen' },
        { metric: 'season_scoring_average', who: 'p-cole' },
      ],
    );
    expect(verdict).toEqual({ outcome: 'accepted' });
  });

  it('still refuses a wrong team figure, a figure given to the wrong player and a thin figure with no sample', () => {
    expect(verdictFor("The team's scoring average this season is 73.5 over 4 rounds.", [{ metric: 'season_scoring_average', who: 'team-1' }]).outcome).toBe('rejected');
    expect(verdictFor('Owen Carter is at 70.5 over his 2 rounds.', [{ metric: 'season_scoring_average', who: 'p-cole' }]).outcome).toBe('rejected');
    expect(verdictFor('Owen Carter is at 72.5 this season.', [{ metric: 'season_scoring_average', who: 'p-owen' }]).outcome).toBe('rejected');
  });
});

describe('every season read counts the same rounds', () => {
  const now = new Date();
  const thisStart = Number(now.toISOString().slice(0, 4)) - (now.getUTCMonth() >= 7 ? 0 : 1);
  const inThis = `${thisStart}-09-25`;
  const inLast = `${thisStart - 1}-10-01`;
  const rows = [
    round('p-owen', 74, { round_date: inThis }),
    round('p-owen', 71, { round_date: inThis, front_nine: 35, back_nine: 36 }),
    round('p-owen', 69, { round_date: inThis, round_type: 'practice' }),
    round('p-owen', 36, { round_date: inThis, holes_played: 9 }),
    round('p-owen', 80, { round_date: inLast }),
  ];

  it('compare_seasons reads total-only rounds and leaves practice and 9 holes out', async () => {
    const env = await compareSeasons(sbWith(rows).sb, ctx, { player_id: 'p-owen' });
    const d = env.detail as { this_season: { n: number; mean: number }; last_season: { n: number; mean: number } };
    expect(d.this_season).toMatchObject({ n: 2, mean: 0.5 });
    expect(d.last_season).toMatchObject({ n: 1, mean: 8 });
  });

  it('get_team_rounds counts those rounds too, and practice only when asked for it', async () => {
    const thisSeason = rows.filter((r) => r.round_date === inThis);
    const env = await getTeamRounds(sbWith(thisSeason).sb, ctx, { since_days: 365 });
    const d = env.detail as { players: Array<{ rounds: number; rounds_averaged: number; avg_to_par: number }> };
    expect(d.players[0]).toMatchObject({ rounds: 4, rounds_averaged: 2, avg_to_par: 0.5 });
    expect(env.coverage_note).toContain('1 practice round is not in the averages');
    const practice = await getTeamRounds(sbWith(thisSeason.filter((r) => r.round_type === 'practice')).sb, ctx, { round_type: 'practice', since_days: 365 });
    expect((practice.detail as { players: Array<{ rounds_averaged: number }> }).players[0]).toMatchObject({ rounds_averaged: 1 });
  });

  it('agrees with get_season_scoring', async () => {
    const env = await getSeasonScoring(sbWith(rows.filter((r) => r.round_date === inThis)).sb, ctx, { player_id: 'p-owen' });
    expect(env.measurements.find((m) => m.metric_id === 'season_scoring_to_par')).toMatchObject({ value: 0.5, sample_size: 2 });
  });
});
