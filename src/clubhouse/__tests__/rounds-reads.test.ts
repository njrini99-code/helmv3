import { afterEach, describe, expect, it, vi } from 'vitest';
import { readWaves } from './read-waves';

/** Rounds (P011): how many round trips deep the library's server reads go (perf, 2026-10-01). Correctness is in rounds.test.tsx. */

vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void>) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadRoundReview } from '../data/round-review';
import { loadRoundsLibrary } from '../data/rounds';
import { PREVIEW_REVIEW_HOLES, PREVIEW_REVIEW_ROUND, PREVIEW_REVIEW_SHOTS } from '../preview/fixtures-round-review';

type Filters = Array<[string, unknown[]]>;
const status = (f: Filters) => f.find(([k, a]) => k === 'eq' && a[0] === 'status')?.[1][1];

const inProgress = { id: 'u1', course_name: 'Hope Valley CC', tees_played: 'Blue', round_date: '2026-10-14', round_type: 'practice', holes_played: 18, current_hole: 4, updated_at: '2026-10-14T12:00:00Z' };
const completed = {
  id: 'c1',
  course_name: 'Hope Valley CC',
  tees_played: 'Blue',
  round_date: '2026-10-01',
  round_type: 'practice',
  total_score: 72,
  score_to_par: 0,
  front_nine: 36,
  back_nine: 36,
  holes_played: 18,
  total_putts: 30,
  total_gir: 10,
  total_gir_possible: 18,
  total_fairways_hit: 8,
  total_fairways: 14,
};

afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
});

describe('Rounds library reads', () => {
  it('the clock, the completed rounds and the in-progress card start together; only the card’s holes wait on a read (two waves, not four)', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/Chicago' } },
      golf_rounds: (f) => (status(f) === 'completed' ? { data: [completed] } : { data: [inProgress] }),
      golf_holes: { data: [{ round_id: 'u1', hole_number: 1, par: 4, score: 4 }] },
    };
    const { result, waves: depth } = await waves.run(loadRoundsLibrary({ playerId: 'p1', teamId: 't1' }));
    expect(depth).toEqual([['golf_rounds', 'golf_rounds', 'golf_team_settings'], ['golf_holes']]);
    expect(result.rounds.list).toHaveLength(1);
    expect(result.unfinished.list[0]).toMatchObject({ id: 'u1', nextHole: 2 });
  });

  it('a team still being resolved holds back only the clock: the rounds are read meanwhile', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = {
      golf_team_settings: { data: { timezone: 'America/Chicago' } },
      golf_rounds: (f) => (status(f) === 'completed' ? { data: [completed] } : { data: [] }),
    };
    let resolveTeam: (id: string) => void = () => {};
    const team = new Promise<string | null>((resolve) => {
      resolveTeam = resolve;
    });
    const { result, waves: depth } = await waves.run(
      (async () => {
        const load = loadRoundsLibrary({ playerId: 'p1', teamId: team });
        // Past the point where every read that does not need the team has been sent and answered.
        await new Promise((r) => setTimeout(r, 20));
        resolveTeam('t1');
        return load;
      })(),
    );
    expect(depth[0]).toEqual(['golf_rounds', 'golf_rounds']);
    expect(depth[1]).toEqual(['golf_team_settings']);
    expect(result.todayIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a library with no round in progress reads the card’s rounds only, in the one wave', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = { golf_rounds: (f) => (status(f) === 'completed' ? { data: [completed] } : { data: [] }) };
    const { waves: depth } = await waves.run(loadRoundsLibrary({ playerId: 'p1', teamId: null }));
    expect(depth).toEqual([['golf_rounds', 'golf_rounds']]);
  });
});

describe('Round review reads', () => {
  const reviewTables = {
    golf_rounds: { data: { ...PREVIEW_REVIEW_ROUND, player_id: 'p1', status: 'completed', tee_id: 't1', is_test: false } },
    golf_holes: { data: PREVIEW_REVIEW_HOLES },
    golf_shots: { data: PREVIEW_REVIEW_SHOTS },
    golf_course_tees: { data: { total_yards: 6984 } },
    golf_teams: { data: { gender: 'mens' } },
  };

  it('the round is read while the viewer (the team) still resolves; its parts follow in one wave (two waves, the team no longer ahead of the round)', async () => {
    const waves = readWaves();
    tables.gate = waves.gate;
    tables.current = reviewTables;
    let resolveViewer: (v: { role: 'player'; playerId: string; teamId: string }) => void = () => {};
    const viewer = new Promise<{ role: 'player'; playerId: string; teamId: string }>((resolve) => {
      resolveViewer = resolve;
    });
    const { result, waves: depth } = await waves.run(
      (async () => {
        const load = loadRoundReview(PREVIEW_REVIEW_ROUND.id, viewer);
        // Past the point where the round read has been sent and answered; the viewer is still not known.
        await new Promise((r) => setTimeout(r, 20));
        resolveViewer({ role: 'player', playerId: 'p1', teamId: 't1' });
        return load;
      })(),
    );
    expect(depth).toEqual([['golf_rounds'], ['golf_course_tees', 'golf_holes', 'golf_shots', 'golf_teams']]);
    expect(result.kind).toBe('ok');
  });

  it('a viewer with no standing is "not found" whatever the round read says, and the answer does not depend on the round existing', async () => {
    tables.current = reviewTables;
    expect(await loadRoundReview(PREVIEW_REVIEW_ROUND.id, Promise.resolve(null))).toEqual({ kind: 'notFound' });
    expect(await loadRoundReview(PREVIEW_REVIEW_ROUND.id, null)).toEqual({ kind: 'notFound' });
  });

  it('a viewer who fails to resolve fails the page (the route’s error view), as before', async () => {
    tables.current = reviewTables;
    await expect(loadRoundReview(PREVIEW_REVIEW_ROUND.id, Promise.reject(new Error('team read failed')))).rejects.toThrow('team read failed');
  });
});
