import { beforeEach, describe, expect, it, vi } from 'vitest';

/** READ-S2 and READ-S4: the read page's loaders. The rounds behind a read that names none, a failed read of them, and what runs beside what. */
vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables, gate: undefined as undefined | ((table: string) => Promise<void> | void) }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
const delivery = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn(), coachThemes: vi.fn(), playerThemes: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoach: delivery.coach,
  getInsightsForPlayer: delivery.player,
  getTopInsightsForPlayers: vi.fn(),
  getThemesForCoach: delivery.coachThemes,
  getThemesForPlayer: delivery.playerThemes,
}));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: vi.fn(), isCoachHelmEnabledForPlayer: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadPlayerStandingMap: vi.fn(async () => new Map()), loadPlayerSeasonStandingMap: vi.fn(async () => ({ status: 'missing' })) }));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({ loadPlayerCohort: vi.fn(async () => ({ gender: 'mens', level: null })) }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => []), loadRecentlyAchievedGoals: vi.fn(async () => []) }));
vi.mock('@/lib/coachhelm/v3/genome/loader', () => ({ loadGenome: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { roundWindowOf } from '../coachhelm-dive-shape';
import type { ChCoachPlayerScope } from '../coachhelm-player';
import { loadCoachRead, loadPlayerRead } from '../coachhelm-read-view';
import { penalties } from '../../preview/fixtures-coachhelm';

const PID = '11111111-1111-4111-8111-111111111111';
const TEAM = 'a0000000-0000-4000-8000-000000000001';
const scope = { coachId: 'c0000000-0000-4000-8000-000000000001', teamId: TEAM, playerId: PID, head: { playerId: PID, name: 'Jonah Okafor', first: 'Jonah', line: '' } } as unknown as ChCoachPlayerScope;

const read = (e: Partial<InsightEvidence>): EvidenceInsight => {
  const base = penalties(PID, 'in-27');
  return { ...base, evidence: { ...base.evidence, sample_n: 27, ...e } };
};
const ROWS = [
  { id: 'r2', round_date: '2026-10-15', course_name: 'Hilltop', total_score: 76, score_to_par: 4, holes_played: 18 },
  { id: 'r1', round_date: '2026-10-08', course_name: 'Lonnie Poole', total_score: 72, score_to_par: 0, holes_played: 18 },
];
type Filters = Array<[string, unknown[]]>;
const has = (f: Filters, key: string, col: string) => f.find(([k, a]) => k === key && a[0] === col)?.[1][1];

beforeEach(() => {
  tables.gate = undefined;
  delivery.coach.mockReset();
  delivery.player.mockReset();
  delivery.coachThemes.mockReset().mockResolvedValue({ success: false, error: 'none' });
  delivery.playerThemes.mockReset().mockResolvedValue({ success: false, error: 'none' });
  tables.current = { golf_team_members: { data: [{ player_id: PID }] }, golf_players: { data: [{ id: PID, first_name: 'Jonah', last_name: 'Okafor' }] }, golf_rounds: { data: ROWS } };
});

describe('READ-S2 the rounds behind a read', () => {
  it('a read stored with no round ids lists the rounds of its window, by the engine’s rule', async () => {
    const asked: Filters[] = [];
    tables.current.golf_rounds = (f) => {
      asked.push(f);
      return { data: ROWS };
    };
    delivery.coach.mockResolvedValue([read({ source_round_ids: undefined, window_start: '2026-07-01T00:00:00Z', window_end: '2026-10-20T00:00:00Z' })]);
    const out = await loadCoachRead({ scope, insightId: 'in-27' });
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data.read!.rounds.total).toBe(2);
    expect(out.data.read!.rounds.list.map((r) => [r.id, r.date, r.course, r.score])).toEqual([
      ['r2', 'Oct 15', 'Hilltop', '76'],
      ['r1', 'Oct 8', 'Lonnie Poole', '72'],
    ]);
    expect(out.data.failed.rounds).toBe(false);
    const window = asked.find((f) => has(f, 'gte', 'round_date'))!;
    expect(has(window, 'eq', 'player_id')).toBe(PID);
    expect(has(window, 'eq', 'is_test')).toBe(false);
    expect(has(window, 'eq', 'status')).toBe('completed');
    expect(has(window, 'gte', 'round_date')).toBe('2026-07-01');
    expect(has(window, 'lte', 'round_date')).toBe('2026-10-20');
  });

  it('the player’s own read gets the same list', async () => {
    delivery.player.mockResolvedValue([read({ source_round_ids: [], window_start: '2026-07-01', window_end: '2026-10-20' })]);
    tables.current.golf_team_members = { data: { team_id: TEAM } };
    const out = await loadPlayerRead({ playerId: PID, insightId: 'in-27' });
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data.read!.rounds.list.map((r) => r.id)).toEqual(['r2', 'r1']);
  });

  it('a read that names its rounds is listed from those, with no window read', async () => {
    const asked: Filters[] = [];
    tables.current.golf_rounds = (f) => {
      asked.push(f);
      return { data: [ROWS[1]] };
    };
    delivery.coach.mockResolvedValue([read({ source_round_ids: ['r1'], window_start: '2026-07-01', window_end: '2026-10-20' })]);
    const out = await loadCoachRead({ scope, insightId: 'in-27' });
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data.read!.rounds.total).toBe(1);
    expect(out.data.read!.rounds.list.map((r) => r.id)).toEqual(['r1']);
    expect(asked.some((f) => has(f, 'gte', 'round_date'))).toBe(false);
  });

  it('a failed read of the window is its own state, never no rounds', async () => {
    tables.current.golf_rounds = (f) => (has(f, 'lte', 'round_date') ? { error: { message: 'boom' } } : { data: [] });
    delivery.coach.mockResolvedValue([read({ source_round_ids: undefined, window_start: '2026-07-01', window_end: '2026-10-20' })]);
    const out = await loadCoachRead({ scope, insightId: 'in-27' });
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data.failed.rounds).toBe(true);
    expect(out.data.read!.rounds.list).toEqual([]);
  });

  it('only the read page asks: the other reads on the page keep their own lists', async () => {
    delivery.coach.mockResolvedValue([read({ source_round_ids: undefined, window_start: '2026-07-01', window_end: '2026-10-20' }), { ...read({ source_round_ids: undefined, window_start: '2026-07-01', window_end: '2026-10-20' }), id: 'in-other' }]);
    const out = await loadCoachRead({ scope, insightId: 'in-other' });
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data.read!.insight.id).toBe('in-other');
    expect(out.data.read!.rounds.total).toBe(2);
  });
});

describe('roundWindowOf, the engine’s range rule', () => {
  const TODAY = '2026-11-06';
  const w = (e: Partial<InsightEvidence>) => roundWindowOf({ window_days: 90, window_start: '', window_end: '', ...e }, TODAY);
  it('an empty end is today, and an empty start the beginning', () => {
    expect(w({ window_start: '2026-07-01' })).toEqual({ from: '2026-07-01', to: TODAY });
    expect(w({ window_end: '2026-10-20' })).toEqual({ from: null, to: '2026-10-20' });
  });
  it('both empty: the last window_days', () => {
    expect(w({})).toEqual({ from: '2026-08-08', to: TODAY });
  });
  it('no window to go on: a lifetime value with no bounds, no days, a window that ends before it starts', () => {
    expect(w({ window_basis: 'lifetime' })).toBeNull();
    expect(w({ window_days: 0 })).toBeNull();
    expect(w({ window_start: '2026-10-20', window_end: '2026-07-01' })).toBeNull();
    expect(roundWindowOf(undefined, TODAY)).toBeNull();
  });
});

describe('READ-S4 the page’s reads run side by side', () => {
  it('the coach’s team switcher is read while the feed is still out', async () => {
    let release: (v: EvidenceInsight[]) => void = () => {};
    delivery.coach.mockReturnValue(new Promise((r) => (release = r)));
    const started: string[] = [];
    tables.gate = (t) => void started.push(t);
    const loading = loadCoachRead({ scope, insightId: 'in-27' });
    await vi.waitFor(() => expect(started).toContain('golf_team_members'));
    expect(delivery.coach).toHaveBeenCalledTimes(1);
    release([read({ source_round_ids: ['r1'] })]);
    const out = await loading;
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data.team).toEqual([{ id: PID, name: 'Jonah Okafor' }]);
    expect(out.data.read).not.toBeNull();
  });

  it('a failed team read costs only the switcher', async () => {
    tables.current.golf_players = { error: { message: 'boom' } };
    delivery.coach.mockResolvedValue([read({ source_round_ids: ['r1'] })]);
    const out = await loadCoachRead({ scope, insightId: 'in-27' });
    if (out.status !== 'ready') throw new Error(out.status);
    expect(out.data.team).toEqual([]);
    expect(out.data.read).not.toBeNull();
  });

  it('a thrown team read does not take the page down', async () => {
    tables.gate = (t) => {
      if (t === 'golf_team_members') throw new Error('boom');
    };
    delivery.coach.mockResolvedValue([read({ source_round_ids: ['r1'] })]);
    const out = await loadCoachRead({ scope, insightId: 'in-27' });
    expect(out.status).toBe('ready');
  });
});
