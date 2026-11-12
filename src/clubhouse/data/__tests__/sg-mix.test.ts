import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Measured or estimated (coordinator, 10 Nov 2026). A round with holes scored and no shots logged still gets strokes gained, estimated
 * from the scorecard (`sg_estimate_from_holes`), and no column says so. These tests pin: the test that tells the two apart is the
 * database function's own; the loaders count and say the split without changing a figure; and whether estimated rounds count at all is
 * ONE flag (`sgPolicy.estimated`), which every strokes gained figure on Team stats and in Ask's team read follows.
 */

vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { loadTeamStats } from '../stats-team';
import { filterFor } from '../stats-filter';
import { loadMeasuredRounds } from '../stats-common';
import { loadTeamStrokesGained } from '../team-sg';
import { sgCounted, sgIsEstimate, sgMixOf, sgMixShort, sgMixWords, sgPolicy } from '../stats-sg-mix';
import type { ChRound } from '../season';
import { shotsAnswer } from './sg-shots-fake';

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const round = (player: string, i: number, sg: number) => ({
  id: `${player}-r${i}`, player_id: player, round_date: day(i * 2 + 1), total_score: 74, score_to_par: 2, front_nine: 37, back_nine: 37, holes_played: 18, status: 'completed',
  round_type: 'tournament', course_name: 'Pines', tees_played: 'White', total_putts: 31, total_gir: 10, total_gir_possible: 18,
  strokes_gained_total: sg, strokes_gained_tee: sg / 4, strokes_gained_approach: sg / 4, strokes_gained_around_green: sg / 4, strokes_gained_putting: sg / 4,
});
// Ada: six rounds, all shot-tracked, -2 each. Bo: six rounds at -4 shot-tracked for the four oldest; his two newest (-0.5 each, the
// kind of mild figure the scorecard estimate gives) have no shots.
const ROUNDS = [...Array.from({ length: 6 }, (_, i) => round('ada', i, -2)), ...Array.from({ length: 6 }, (_, i) => round('bo', i, i < 2 ? -0.5 : -4))];
const ESTIMATED = ['bo-r0', 'bo-r1'];
const TRACKED = ROUNDS.map((r) => r.id).filter((id) => !ESTIMATED.includes(id));
const team = (shots = shotsAnswer(TRACKED)) => ({
  golf_teams: { data: { name: 'Varsity', gender: 'men' } },
  golf_team_members: { data: [{ player: { id: 'ada', first_name: 'Ada', last_name: 'Lin' } }, { player: { id: 'bo', first_name: 'Bo', last_name: 'Fox' } }] },
  golf_team_settings: { data: { timezone: 'America/New_York' } },
  golf_rounds: { data: ROUNDS },
  golf_round_stats_cache: { data: [] },
  golf_pga_standards: { data: [] },
  golf_shots: shots,
});

afterEach(() => {
  sgPolicy.estimated = 'include';
  tables.current = {};
});

describe('the words', () => {
  it('say nothing when every round was shot-tracked, or when the read failed', () => {
    expect(sgMixWords({ measured: 10, estimated: 0, estimatedCounted: true })).toBeNull();
    expect(sgMixWords(null)).toBeNull();
    expect(sgMixShort(undefined)).toBeNull();
    expect(sgIsEstimate({ measured: 10, estimated: 0, estimatedCounted: true })).toBe(false);
  });
  it('mixed: how many were shot-tracked and how many estimated, and the figure is not marked', () => {
    const mix = { measured: 6, estimated: 4, estimatedCounted: true };
    expect(sgMixWords(mix)).toBe('6 of 10 rounds shot-tracked; 4 estimated from the scorecard');
    expect(sgMixShort(mix)).toBe('6 of 10 shot-tracked');
    expect(sgIsEstimate(mix)).toBe(false);
  });
  it('all estimated: the figure itself is an estimate', () => {
    const mix = { measured: 0, estimated: 3, estimatedCounted: true };
    expect(sgMixWords(mix)).toBe('Estimated from the scorecard: no round shot-tracked');
    expect(sgMixShort(mix)).toBe('Estimated');
    expect(sgIsEstimate(mix)).toBe(true);
  });
  it('left out: says how many, and never calls the figure an estimate', () => {
    const mix = { measured: 6, estimated: 1, estimatedCounted: false };
    expect(sgMixWords(mix)).toBe('1 round without shots left out');
    expect(sgIsEstimate({ measured: 0, estimated: 4, estimatedCounted: false })).toBe(false);
  });
});

describe('which rounds were measured: the database function’s own test', () => {
  it('the read’s filters are recalculate_round_strokes_gained’s count of usable shots, line for line', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/schemas/functions/public.sql'), 'utf8');
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION "public"."recalculate_round_strokes_gained"'));
    // The function: measured when this count is above zero, estimated (sg_estimate_from_holes) otherwise.
    expect(fn).toMatch(/gs\.shot_type IS NOT NULL AND gs\.lie_before IS NOT NULL\s+AND gs\.distance_to_hole_before IS NOT NULL AND gs\.distance_to_hole_before > 0\s+AND \(gs\.distance_to_hole_after IS NOT NULL OR gs\.putt_made = TRUE OR gs\.result IN \('holed','hole'\)\);\s+IF v_shot_count > 0 THEN/);
    expect(fn.slice(0, fn.indexOf('ALTER FUNCTION'))).toMatch(/FROM sg_estimate_from_holes\(p_round_id\)/);
    const read = readFileSync(join(process.cwd(), 'src/clubhouse/data/stats-common.ts'), 'utf8');
    expect(read).toMatch(/\.not\('shot_type', 'is', null\)\s+\.not\('lie_before', 'is', null\)\s+\.gt\('distance_to_hole_before', 0\)/);
    expect(read).toMatch(/r\.distance_to_hole_after != null \|\| r\.putt_made === true \|\| r\.result === 'holed' \|\| r\.result === 'hole'/);
  });

  it('a shot with no end does not make a round measured; a made putt or a holed shot does', async () => {
    tables.current = {
      golf_shots: {
        data: [
          { round_id: 'a', distance_to_hole_after: null, putt_made: null, result: null },
          { round_id: 'b', distance_to_hole_after: null, putt_made: true, result: null },
          { round_id: 'c', distance_to_hole_after: null, putt_made: false, result: 'holed' },
          { round_id: 'd', distance_to_hole_after: 0, putt_made: null, result: null },
        ],
      },
    };
    const read = await loadMeasuredRounds(await createClient(), ['a', 'b', 'c', 'd', 'e'], 'stats');
    expect(read.error).toBe(false);
    expect([...read.ids].sort()).toEqual(['b', 'c', 'd']);
  });

  it('a failed read claims nothing', async () => {
    tables.current = { golf_shots: { error: { message: 'boom' } } };
    const read = await loadMeasuredRounds(await createClient(), ['a'], 'stats');
    expect(read).toEqual({ ids: new Set(), error: true });
    expect(sgMixOf([{ id: 'a', strokes_gained_total: 1 }], { measured: read.ids, dropped: new Set(), error: read.error })).toBeNull();
  });
});

describe('the one flag: sgPolicy.estimated', () => {
  const rounds = ROUNDS as unknown as ChRound[];
  const measured = { ids: new Set(TRACKED), error: false };

  it('include (today): the rounds are untouched, the very same objects', () => {
    const out = sgCounted(rounds, measured, 'include');
    expect(out.rounds).toBe(rounds);
    expect(out.dropped.size).toBe(0);
  });

  it('exclude: an estimated round keeps its score and loses all five strokes gained fields; nothing else changes', () => {
    const out = sgCounted(rounds, measured, 'exclude');
    expect([...out.dropped].sort()).toEqual(ESTIMATED);
    const bo0 = out.rounds.find((r) => r.id === 'bo-r0')!;
    expect(bo0.total_score).toBe(74);
    expect([bo0.strokes_gained_total, bo0.strokes_gained_tee, bo0.strokes_gained_approach, bo0.strokes_gained_around_green, bo0.strokes_gained_putting]).toEqual([null, null, null, null, null]);
    expect(out.rounds.find((r) => r.id === 'ada-r0')).toBe(rounds.find((r) => r.id === 'ada-r0'));
    // The loaded rounds themselves are never written to.
    expect(rounds.find((r) => r.id === 'bo-r0')!.strokes_gained_total).toBe(-0.5);
  });

  it('exclude with a failed read changes nothing: a figure is never dropped on a guess', () => {
    expect(sgCounted(rounds, { ids: new Set(), error: true }, 'exclude').rounds).toBe(rounds);
  });

  it('Team stats, include: every round counts, and the split is said', async () => {
    tables.current = team();
    const stats = await loadTeamStats({ teamId: 't1', window: 'last10', filter: filterFor('last10') });
    // (6 x -2) + (4 x -4) + (2 x -0.5) over 12 rounds.
    expect(stats.team.sgMean).toBeCloseTo(-29 / 12, 9);
    expect(stats.sgRounds).toBe(12);
    expect(stats.sgMix).toEqual({ measured: 10, estimated: 2, estimatedCounted: true });
    expect(stats.grid.find((g) => g.id === 'bo')!.total).toBeCloseTo(-17 / 6, 9);
    expect(stats.figures[0]!.note).toMatch(/10 of 12 shot-tracked/);
  });

  it('Team stats, exclude: the same loader, the flag alone, and the estimated rounds are out of the headline, the legs, the grid and the count', async () => {
    sgPolicy.estimated = 'exclude';
    tables.current = team();
    const stats = await loadTeamStats({ teamId: 't1', window: 'last10', filter: filterFor('last10') });
    // (6 x -2) + (4 x -4) over 10 rounds.
    expect(stats.team.sgMean).toBeCloseTo(-2.8, 9);
    expect(stats.sgRounds).toBe(10);
    expect(stats.legTotals[1]).toBeCloseTo(-0.7, 9);
    expect(stats.grid.find((g) => g.id === 'bo')!.total).toBeCloseTo(-4, 9);
    expect(stats.sgMix).toEqual({ measured: 10, estimated: 2, estimatedCounted: false });
    expect(sgMixWords(stats.sgMix)).toBe('2 rounds without shots left out');
    // The score figures still count every round.
    expect(stats.roundCount).toBe(12);
  });

  it('Ask’s team read follows the same flag, and carries the split for its reader', async () => {
    tables.current = team();
    const sb = await createClient();
    const inc = await loadTeamStrokesGained(sb, { timezone: 'America/New_York', playerIds: ['ada', 'bo'] }, 'last10');
    expect(inc!.rounds).toBe(12);
    expect(inc!.legs.approach).toBeCloseTo(-29 / 12 / 4, 9);
    expect(inc!.sg_mix).toEqual({ measured: 10, estimated: 2, estimatedCounted: true });
    sgPolicy.estimated = 'exclude';
    const exc = await loadTeamStrokesGained(sb, { timezone: 'America/New_York', playerIds: ['ada', 'bo'] }, 'last10');
    expect(exc!.rounds).toBe(10);
    expect(exc!.legs.approach).toBeCloseTo(-0.7, 9);
    expect(exc!.sg_mix).toEqual({ measured: 10, estimated: 2, estimatedCounted: false });
  });

  it('every loader that draws strokes gained applies the policy where its rounds load', () => {
    const src = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/data', f), 'utf8');
    for (const f of ['stats-team.ts', 'stats-player.ts', 'coachhelm-team.ts', 'coachhelm-file.ts', 'team-sg.ts']) expect(src(f), f).toMatch(/sgPolicyAtSource\(/);
    // The flag is one line, and it ships as `include`: whether estimated rounds count is the owner's decision.
    expect(src('stats-sg-mix.ts')).toMatch(/export const sgPolicy: \{ estimated: 'include' \| 'exclude' \} = \{ estimated: 'include' \};/);
  });
});
