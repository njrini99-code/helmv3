import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getMyRounds, myRoundCounts, MY_ROUND_LIST_MAX } from '../my-rounds';
import { toolsFor } from '../registry';
import type { MyRoundsScreen } from '../screen-loaders';
import type { ToolEnvelope } from '../provenance';

/**
 * A player's own Rounds page as a read. The case it was written for (first full eval run, 11 Nov 2026): a player with 4
 * qualifier, 3 tournament and 4 practice rounds finished since 1 September and 3 practice rounds in progress asked how many
 * rounds they had recorded, and was told 7, because the only page the chat could read leaves practice out.
 */
const ME = '11111111-1111-4111-8111-111111111111';
const player = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'Demo University Golf', timezone: 'America/New_York', roster: [{ id: ME, name: 'Cole Bennett', first_name: 'Cole' }], player_id: ME } as never;
const coach = { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'Demo University Golf', timezone: 'America/New_York', roster: [{ id: ME, name: 'Cole Bennett' }] } as never;

const done = (id: string, date: string, type: 'practice' | 'qualifier' | 'tournament', score: number, over: Record<string, unknown> = {}) => ({ id, date, course: 'Home course', type, holes: 18, score, toPar: score - 72, putts: 30, countable: true, ...over });
const open = (id: string, date: string) => ({ id, date, course: 'Home course', type: 'practice' as const, holes: 18 });
const page = (): MyRoundsScreen => ({
  rounds: {
    error: false,
    list: [
      done('t3', '2026-10-21', 'tournament', 73), done('t2', '2026-10-21', 'tournament', 77), done('t1', '2026-10-21', 'tournament', 74),
      done('p4', '2026-10-06', 'practice', 78), done('p3', '2026-09-30', 'practice', 76), done('p2', '2026-09-29', 'practice', 68),
      done('q4', '2026-09-26', 'qualifier', 70, { totalOnly: true }), done('q3', '2026-09-25', 'qualifier', 71), done('q2', '2026-09-15', 'qualifier', 81), done('q1', '2026-09-13', 'qualifier', 87),
      done('p1', '2026-09-06', 'practice', 39, { holes: 9 }),
      done('old', '2026-08-25', 'practice', 80),
    ],
  },
  unfinished: { error: false, list: [open('u3', '2026-10-25'), open('u2', '2026-10-08'), open('u1', '2026-09-20')] },
});
const ctxFor = (who: unknown, load?: () => Promise<MyRoundsScreen | null>) => ({ who, sb: {}, loaders: load ? { myRounds: load } : {} }) as never;
const run = async (input: Record<string, unknown>, load: () => Promise<MyRoundsScreen | null> = async () => page(), who: unknown = player) => (await getMyRounds.run(ctxFor(who, load), { list: 10, ...input } as never)) as ToolEnvelope & { model_text?: string };

describe('a player’s own rounds', () => {
  // A day is said without its year inside the season it falls in, so the clock is held in that season.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T15:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('counts every round recorded in the range, practice and rounds in progress included, and says which are which', async () => {
    const out = await run({ from: '2026-09-01' });
    expect(out.detail).toMatchObject({ rounds_recorded: 14, rounds_finished: 11, rounds_in_progress: 3, counted_rounds: 10 });
    expect((out.detail as { by_type: unknown }).by_type).toEqual([
      { type: 'practice', finished: 4, in_progress: 3 },
      { type: 'qualifier', finished: 4, in_progress: 0 },
      { type: 'tournament', finished: 3, in_progress: 0 },
    ]);
    const text = out.model_text ?? '';
    expect(text).toContain('14 rounds recorded (6 September to 25 October). 11 finished and 3 still in progress. Source: your Rounds page.');
    expect(text).toContain('10 of the 11 finished rounds are full rounds that count in an average. Their average score: 75.5.');
    expect(text).toContain('  practice: 7 rounds recorded, 4 finished, 3 in progress');
    expect(text).toContain('  qualifier: 4 rounds recorded, 4 finished');
    expect(text).toContain('Your Stats figures leave practice rounds out, so their round counts are smaller than these.');
    expect(out.coverage).toBe('complete');
    // The average is the only measurement, over the full rounds that count (the nine-hole round is listed, not averaged).
    expect(out.measurements).toHaveLength(1);
    expect(out.measurements[0]).toMatchObject({ metric_id: 'scoring_average', value: 75.5, sample_size: 10, entity: { kind: 'player', id: ME, label: 'Cole Bennett' } });
  });

  it('narrows by kind and by dates, and lists the newest finished rounds as a coach says them, with no address and no stamp', async () => {
    const out = await run({ round_type: 'tournament', list: 2 });
    expect(out.detail).toMatchObject({ rounds_recorded: 3, rounds_finished: 3, rounds_in_progress: 0 });
    expect((out.detail as { rounds: Array<Record<string, unknown>> }).rounds).toEqual([
      { round_id: 't3', date: '2026-10-21', course: 'Home course', type: 'tournament', holes: 18, score: 73, to_par: 1, putts: 30 },
      { round_id: 't2', date: '2026-10-21', course: 'Home course', type: 'tournament', holes: 18, score: 77, to_par: 5, putts: 30 },
    ]);
    const text = out.model_text ?? '';
    expect(text).toContain('  21 October, Home course: 73, 1 over par, tournament [round t3]');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toContain('By kind of round');
    expect(JSON.stringify(out.detail)).not.toContain('href');
    const windowed = await run({ from: '2026-09-25', to: '2026-09-30' });
    expect(windowed.detail).toMatchObject({ rounds_recorded: 4, rounds_finished: 4, rounds_in_progress: 0 });
    expect(windowed.model_text).toContain('  26 September, Home course: 70, 2 under par, qualifier, total only [round q4]');
    expect(windowed.model_text).toContain('  29 September, Home course: 68, 4 under par, practice [round p2]');
  });

  it('a nine-hole round is listed as one and never averaged with the full rounds', async () => {
    const out = await run({ from: '2026-09-01', to: '2026-09-10' });
    expect(out.model_text).toContain('  6 September, Home course (9 holes): 39');
    expect(out.detail).toMatchObject({ rounds_recorded: 1, counted_rounds: 0, average_of_counted: null });
    expect(out.measurements).toEqual([]);
  });

  it('lists at most thirty rounds, while the counts cover them all', async () => {
    const many: MyRoundsScreen = { rounds: { error: false, list: Array.from({ length: 45 }, (_, i) => done(`r${i}`, '2026-09-10', 'practice', 75)) }, unfinished: { error: false, list: [] } };
    const out = await run({ list: 30 }, async () => many);
    expect((out.detail as { rounds: unknown[] }).rounds).toHaveLength(MY_ROUND_LIST_MAX);
    expect(out.detail).toMatchObject({ rounds_recorded: 45, rounds_finished: 45 });
    expect(getMyRounds.input.safeParse({ list: 31 }).success).toBe(false);
  });

  it('a page that could not be read is a failed read, never "no rounds"; rounds in progress that could not be read are said', async () => {
    for (const load of [async () => null, async () => ({ ...page(), rounds: { list: [], error: true } }), async () => Promise.reject(new Error('down'))]) {
      const out = await run({}, load as never);
      expect(out.coverage).toBe('unavailable');
    }
    expect((await getMyRounds.run(ctxFor(player), { list: 10 } as never) as ToolEnvelope).coverage).toBe('unavailable');
    const partial = await run({ from: '2026-09-01' }, async () => ({ ...page(), unfinished: { list: [], error: true } }));
    expect(partial.coverage).toBe('partial');
    expect(partial.detail).toMatchObject({ rounds_recorded: 11, rounds_in_progress: null });
    expect(partial.model_text).toContain('11 finished and the rounds in progress could not be read.');
    // Truly none in the range.
    const none = await run({ from: '2026-11-30' });
    expect(none.coverage).toBe('empty');
    expect(none.summary).toBe('No rounds of yours: every round type, practice included, 30 November to today.');
  });

  it('at the Rounds page’s own cap of in-progress cards the count is "at least"', async () => {
    const capped: MyRoundsScreen = { rounds: page().rounds, unfinished: { error: false, list: Array.from({ length: 20 }, (_, i) => open(`u${i}`, '2026-10-01')) } };
    expect((await run({ from: '2026-10-01' }, async () => capped)).model_text).toContain('at least 20 still in progress');
  });

  it('is the signed-in player’s alone: no player id to give, nothing in a coach’s chat, and a coach is never offered it', async () => {
    expect(Object.keys((getMyRounds.input as unknown as { shape: Record<string, unknown> }).shape).sort()).toEqual(['from', 'list', 'round_type', 'to']);
    const asCoach = await run({}, async () => page(), coach);
    expect(asCoach.coverage).toBe('unavailable');
    expect(asCoach.measurements).toEqual([]);
    const mine = toolsFor('player', player).find((t) => t.name === 'get_rounds');
    expect(mine?.description).toBe(getMyRounds.description);
    expect(mine?.description).toMatch(/^Your own rounds from your Rounds page/);
    // A coach's get_rounds is the team's Rounds page, a different read under the same name.
    expect(toolsFor('ask', coach).find((t) => t.name === 'get_rounds')?.description).toMatch(/^The team's rounds/);
    expect(toolsFor('player', player).map((t) => t.name)).toEqual(['get_player_stats', 'get_rounds', 'get_round', 'get_shots', 'get_season', 'get_schedule', 'get_coachhelm', 'get_reference', 'summarise_data', 'show_visual', 'find_in_app']);
  });

  it('the counts are worked out in one place', () => {
    expect(myRoundCounts(page(), {}).recorded).toBe(15);
    expect(myRoundCounts(page(), { round_type: 'practice', from: '2026-09-01' })).toMatchObject({ recorded: 7 });
  });
});
