/**
 * The teammate shot read keeps every shot type, so a teammate's approach is
 * priced against the same next row (an around-green chip) as the player's
 * unfiltered read prices it. In-memory fake of the PostgREST builder: `.eq`
 * and `.in` really filter, `.range` really slices.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const b = {
    select: () => b,
    eq: (col: string, v: unknown) => {
      rows = rows.filter((r) => r[col] === v);
      return b;
    },
    in: (col: string, vs: unknown[]) => {
      rows = rows.filter((r) => vs.includes(r[col]));
      return b;
    },
    order: () => b,
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return b;
    },
    range: (from: number, to: number) => {
      rows = rows.slice(from, to + 1);
      return b;
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return b;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => query(t), rpc: async () => ({ data: 1, error: null }) }),
}));
vi.mock('@/lib/coachhelm/v3/counterfactual/baseline-loader', () => ({ loadPlayerScoringBaseline: async () => 74 }));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({ loadPlayerCohort: async () => ({ failed: true }) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

import { getExpectedStrokes } from '@/lib/utils/golf-stats-calculator-shots';
import { createAngleLoaders } from '../load-angle-data';
import { extractApproaches } from '../counted-shots';
import { mkHole, mkShot } from './fixtures';

beforeEach(() => {
  tables.golf_rounds = [];
  tables.golf_holes = [];
  tables.golf_shots = [];
  for (let i = 0; i < 3; i++) {
    const id = `t1r${i}`;
    tables.golf_rounds.push({
      id,
      player_id: 'mate',
      team_id: 'team-1',
      round_date: `2026-05-0${i + 1}`,
      status: 'completed',
      is_test: false,
      holes_played: 18,
      total_score: 72,
      front_nine: 36,
      back_nine: 36,
      total_putts: 30,
    });
    tables.golf_holes.push({ ...mkHole(id, 1, { par: 4 }) });
    tables.golf_shots.push(
      { ...mkShot(id, 1, 1, { shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400, lie_after: 'fairway', distance_to_hole_after: 100, distance_unit_after: 'yards' }) },
      // Approach with no recorded finish: its endpoint is the next row, the chip.
      { ...mkShot(id, 1, 2, { lie_before: 'fairway', distance_to_hole_before: 100, lie_after: null, result: null, distance_to_hole_after: null, distance_unit_after: null }) },
      { ...mkShot(id, 1, 3, { shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before: 15, lie_after: 'green', result: 'green', distance_to_hole_after: 6, distance_unit_after: 'feet' }) },
      { ...mkShot(id, 1, 4, { shot_type: 'putting', lie_before: 'green', distance_to_hole_before: 6, distance_unit_before: 'feet', putt_made: true, result: 'holed' }) },
    );
  }
});

describe('readTeamShots (teammate shots for the counted families)', () => {
  it('keeps the around-green continuation, so a teammate approach is priced to the chip like the player read', async () => {
    const team = await createAngleLoaders('player').teamShots('team-1');
    expect(team.teammates).toHaveLength(1);
    const mate = team.teammates[0]!;
    expect(mate.shots.filter((s) => s.shot_type === 'around_green')).toHaveLength(3);
    const x = extractApproaches({ rounds: mate.rounds, holes: mate.holes, shots: mate.shots, scale: 1 });
    const want = getExpectedStrokes('fairway', 100, undefined, 1) - getExpectedStrokes('rough', 15, undefined, 1) - 1;
    expect(x.bands['50_125']).toHaveLength(3);
    for (const a of x.bands['50_125']) expect(a.sg).toBeCloseTo(want, 6);
  });
});
