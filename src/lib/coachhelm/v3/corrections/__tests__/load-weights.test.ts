/**
 * loadCorrectionWeightsForPlayer(s): resolves each player's primary coach in
 * batched reads, reads every coach's FULL correction history (paged past the
 * 1000-row PostgREST cap: W is clamped per step, so a truncated history
 * drifts), and never throws (the corrections table is held, so a missing
 * table is "not available").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ logServerError: vi.fn(async (..._args: unknown[]) => undefined) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: h.logServerError }));

import { loadCorrectionWeightsForPlayer, loadCorrectionWeightsForPlayers } from '../load-weights';

const COACH_USER = 'coach-user-1';

interface Fake {
  members: unknown[];
  staff: unknown[];
  coaches: unknown[];
  corrections: unknown[];
  correctionsError: unknown;
  /** Filters applied to the corrections read. */
  filters: Record<string, unknown>;
  /** `.range()` calls on the corrections read. */
  ranges: Array<[number, number]>;
  tables: string[];
}

function client(fake: Fake) {
  const from = (table: string) => {
    fake.tables.push(table);
    let range: [number, number] | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      order: () => b,
      in: (k: string, v: unknown) => {
        if (table === 'golf_coachhelm_corrections') fake.filters[k] = v;
        return b;
      },
      eq: (k: string, v: unknown) => {
        if (table === 'golf_coachhelm_corrections') fake.filters[k] = v;
        return b;
      },
      range: (a: number, z: number) => {
        range = [a, z];
        if (table === 'golf_coachhelm_corrections') fake.ranges.push(range);
        return b;
      },
      then: (resolve: (v: unknown) => void) => {
        const all =
          table === 'golf_team_members'
            ? fake.members
            : table === 'golf_team_coach_staff'
              ? fake.staff
              : table === 'golf_coaches'
                ? fake.coaches
                : fake.corrections;
        if (table === 'golf_coachhelm_corrections' && fake.correctionsError) {
          return Promise.resolve(resolve({ data: null, error: fake.correctionsError }));
        }
        const data = range ? all.slice(range[0], range[1] + 1) : all;
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

let seq = 0;
function row(kind: string, family: string | null, minute: number, insight = `r-${minute}`, author = COACH_USER) {
  seq += 1;
  return {
    id: `c-${String(seq).padStart(6, '0')}`,
    insight_id: insight,
    author_user_id: author,
    author_role: 'coach',
    kind,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
    insight: family === null ? null : { insight_type: family },
  };
}

let fake: Fake;
beforeEach(() => {
  h.logServerError.mockClear();
  seq = 0;
  fake = {
    members: [{ id: 'm-1', player_id: 'player-1', team_id: 'team-1' }],
    staff: [{ id: 's-1', team_id: 'team-1', coach_id: 'coach-1' }],
    coaches: [{ id: 'coach-1', user_id: COACH_USER }],
    corrections: [],
    correctionsError: null,
    filters: {},
    ranges: [],
    tables: [],
  };
});

describe('loadCorrectionWeightsForPlayer', () => {
  it('reads the primary coach’s own coach-role corrections and computes W per family', async () => {
    fake.corrections = [
      row('confirm', 'approach_miss', 3),
      row('not_this', 'putt_distance', 2),
      row('not_this', 'putt_distance', 1),
      row('not_this', null, 4), // insight not visible: no family, skipped
    ];
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({
      putt_distance: 0.8,
      approach_miss: 1.05,
    });
    expect(fake.filters).toEqual({ author_user_id: [COACH_USER], author_role: 'coach' });
  });

  it('reads the full history past 1000 rows (W is path-dependent, so no cap)', async () => {
    // 1,000 confirms on distinct reads, then one Not this on another family.
    for (let i = 0; i < 1000; i += 1) fake.corrections.push(row('confirm', 'approach_miss', i, `a-${i}`));
    fake.corrections.push(row('not_this', 'putt_distance', 2000, 'p-1'));
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({
      approach_miss: 1.5,
      putt_distance: 0.9,
    });
    expect(fake.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it.each(['42P01', 'PGRST205'])('missing table (%s): {} without logging', async (code) => {
    fake.correctionsError = { code, message: 'missing' };
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({});
    expect(h.logServerError).not.toHaveBeenCalled();
  });

  it('another read error: {} and one warning', async () => {
    fake.correctionsError = { code: '57014', message: 'timeout' };
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({});
    expect(h.logServerError).toHaveBeenCalledTimes(1);
    expect(h.logServerError.mock.calls[0]).toContain('warning');
  });

  it('no primary coach user: {} without reading corrections', async () => {
    fake.coaches = [];
    expect(await loadCorrectionWeightsForPlayer(client(fake), 'player-1')).toEqual({});
    expect(fake.tables).not.toContain('golf_coachhelm_corrections');
  });

  it('a thrown client error: {} (never throws into a feed)', async () => {
    const broken = {
      from: () => {
        throw new Error('boom');
      },
    };
    await expect(loadCorrectionWeightsForPlayer(broken as never, 'player-1')).resolves.toEqual({});
  });
});

describe('loadCorrectionWeightsForPlayers (batched)', () => {
  it('one read per table; each player gets their own primary coach’s W', async () => {
    fake.members = [
      { id: 'm-1', player_id: 'player-1', team_id: 'team-1' },
      { id: 'm-2', player_id: 'player-2', team_id: 'team-2' },
      // Active on two teams: the lowest team id wins, deterministically.
      { id: 'm-3', player_id: 'player-3', team_id: 'team-2' },
      { id: 'm-4', player_id: 'player-3', team_id: 'team-1' },
    ];
    fake.staff = [
      { id: 's-1', team_id: 'team-1', coach_id: 'coach-1' },
      { id: 's-2', team_id: 'team-2', coach_id: 'coach-2' },
    ];
    fake.coaches = [
      { id: 'coach-1', user_id: COACH_USER },
      { id: 'coach-2', user_id: 'coach-user-2' },
    ];
    fake.corrections = [
      row('not_this', 'putt_distance', 1, 'r-1', COACH_USER),
      row('confirm', 'tee_strategy', 2, 'r-2', 'coach-user-2'),
    ];
    const out = await loadCorrectionWeightsForPlayers(client(fake), ['player-1', 'player-2', 'player-3', 'player-4']);
    expect(Object.fromEntries(out)).toEqual({
      'player-1': { coachId: 'coach-1', coachUserId: COACH_USER, weights: { putt_distance: 0.9 } },
      'player-2': { coachId: 'coach-2', coachUserId: 'coach-user-2', weights: { tee_strategy: 1.05 } },
      'player-3': { coachId: 'coach-1', coachUserId: COACH_USER, weights: { putt_distance: 0.9 } },
    });
    expect(fake.tables).toEqual([
      'golf_team_members',
      'golf_team_coach_staff',
      'golf_coaches',
      'golf_coachhelm_corrections',
    ]);
    expect(fake.filters.author_user_id).toEqual([COACH_USER, 'coach-user-2']);
  });

  it('no players: an empty map without any read', async () => {
    expect((await loadCorrectionWeightsForPlayers(client(fake), [])).size).toBe(0);
    expect(fake.tables).toEqual([]);
  });
});
