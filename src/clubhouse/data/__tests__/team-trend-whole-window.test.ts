import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Launch readiness 2026-11-15, DF-C-10: Stats Team's weekly line kept only the window's last ten weeks (`.slice(-10)`), so
 * on a full season the fall dropped off the chart and the newer-half-vs-older-half verdicts read the back of the season only.
 * The line now holds every week of the window the page is filtered to; the chart labels at most ten of them.
 */

vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

import { loadTeamStats } from '../stats-team';

// Monday 16 November 2026. The season started 1 August.
const NOW = new Date('2026-11-16T17:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const round = (player: string, week: number, score: number) => ({
  id: `${player}-w${week}`, player_id: player, round_date: day(week * 7 + 2), total_score: score, score_to_par: score - 72, front_nine: score - 36, back_nine: 36,
  holes_played: 18, status: 'completed', is_test: false, round_type: 'tournament', course_name: 'Pines', tees_played: 'White', total_putts: 31, total_gir: 10,
  total_gir_possible: 18, strokes_gained_total: null, strokes_gained_tee: null, strokes_gained_approach: null, strokes_gained_around_green: null, strokes_gained_putting: null,
});
// Fourteen weeks of rounds, a round a week each; the team scores 80 in the fall's first weeks and 72 by November.
const ROUNDS = Array.from({ length: 14 }, (_, w) => ['ada', 'bo', 'cy'].map((p) => round(p, w, 72 + Math.floor(w / 2)))).flat();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  tables.current = {
    golf_teams: { data: { name: 'Varsity', gender: 'men' } },
    golf_team_members: { data: [{ player: { id: 'ada', first_name: 'Ada', last_name: 'Lin' } }, { player: { id: 'bo', first_name: 'Bo', last_name: 'Fox' } }, { player: { id: 'cy', first_name: 'Cy', last_name: 'Park' } }] },
    golf_team_settings: { data: { timezone: 'America/New_York' } },
    golf_rounds: { data: ROUNDS },
    golf_round_stats_cache: { data: [] },
    golf_pga_standards: { data: [] },
    golf_shots: { data: [] },
  };
});
afterEach(() => {
  vi.useRealTimers();
  tables.current = {};
});

describe('the team trend reads the whole window (DF-C-10)', () => {
  it('a season of fourteen weeks draws fourteen, from the first', async () => {
    const data = await loadTeamStats({ teamId: 't1', window: 'season' });
    expect(data.weeks).toHaveLength(14);
    expect(data.weekStarts![0]! <= day(13 * 7 + 2)).toBe(true);
    expect(data.team.score).toHaveLength(14);
    expect(data.team.score[0]).toBe(78);
    expect(data.team.score.at(-1)).toBe(72);
    // The verdict sets the season’s newer half against its older half, the same three players on each side.
    expect(data.team.scoreHalves!.delta).toBeLessThan(-3);
  });
});

describe('the season bests leave the filter alone (DF-C-20)', () => {
  it('a practice 65 is never the low round, even with Practice picked', async () => {
    tables.current.golf_rounds = { data: [...ROUNDS, { ...round('ada', 1, 65), id: 'ada-practice', round_type: 'practice' }] };
    const { filterFor } = await import('../stats-filter');
    const low = (bests: Array<{ label: string; value: string }>) => bests.find((b) => /low/i.test(b.label))?.value;
    const plain = await loadTeamStats({ teamId: 't1', window: 'season' });
    const practice = await loadTeamStats({ teamId: 't1', window: 'season', filter: { ...filterFor('season'), types: ['practice'] } });
    expect(low(plain.bests)).toBeDefined();
    expect(low(practice.bests)).toBe(low(plain.bests));
    expect(low(practice.bests)).not.toContain('65');
  });
});

describe('the trend chart’s par (DF-C-21)', () => {
  it('is read from the rounds with a to-par, not the average score less an average over other rounds', async () => {
    // Nine rounds of 74 at par 72, and three of 70 with no to-par: par is 72, where the two averages gave 73 − 2 = 71.
    tables.current.golf_rounds = { data: ROUNDS.slice(0, 12).map((r, i) => (i < 9 ? { ...r, total_score: 74, score_to_par: 2 } : { ...r, total_score: 70, score_to_par: null })) };
    const data = await loadTeamStats({ teamId: 't1', window: 'season' });
    expect(data.team.parMean).toBe(72);
  });
});
