import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

import { buildCoachTools } from '../agent-tools';
import { buildPlayerTools } from '../player-tools';
import { nowIso, readFigure, type ToolEnvelope } from '../provenance';
import { windowLabelOf, withWindowLabel } from '../window-label';
import { person, pgrst } from './pgrst-double';

const env = (over: Partial<ToolEnvelope> = {}): ToolEnvelope => ({ summary: 'ok', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: nowIso(), ...over });
const fig = (source: string) => readFigure({ metric_id: 'putts_per_round', metric_label: 'Putts', unit: 'count', value: 31, entity: { kind: 'player', id: 'p1', label: 'Owen' }, window_start: null, window_end: null, sample_size: 10, sample_unit: 'rounds', source, method: 'm' });

describe('the window a read actually used', () => {
  it('names the round window of a round-based read, defaulting to the last ten', () => {
    const e = env({ measurements: [fig('rounds')] });
    expect(windowLabelOf('get_player_metrics', { window: 'last5' }, e)).toBe('last 5 rounds');
    expect(windowLabelOf('get_player_metrics', { window: 'last20' }, e)).toBe('last 20 rounds');
    expect(windowLabelOf('get_player_metrics', { window: 'season' }, e)).toBe('this season');
    expect(windowLabelOf('compare_players', {}, e)).toBe('last 10 rounds');
  });

  it('says the cache’s history, not the window asked for, when that is what the figures came from', () => {
    expect(windowLabelOf('get_player_metrics', { window: 'last10' }, env({ measurements: [fig('stats cache')] }))).toBe('all recorded rounds');
    expect(windowLabelOf('get_player_weakest_areas', { window: 'cache' }, env({ measurements: [fig('rounds')], detail: { window: 'cache' } }))).toBe('all recorded rounds');
    // A mix labelled in the read keeps the round window, which is what most of it is.
    expect(windowLabelOf('get_player_weakest_areas', { window: 'last10' }, env({ measurements: [fig('rounds'), fig('stats cache')], detail: { window: 'last10' } }))).toBe('last 10 rounds');
  });

  it('reads the count of rounds or days the input gave, and the season for the season read', () => {
    expect(windowLabelOf('get_player_trend', { last_n: 8 }, env())).toBe('last 8 rounds');
    expect(windowLabelOf('get_recent_rounds', { last_n: 1 }, env())).toBe('last 1 round');
    expect(windowLabelOf('get_team_rounds', { since_days: 60 }, env())).toBe('last 60 days');
    expect(windowLabelOf('get_shot_pattern', { since_days: 30 }, env())).toBe('last 30 days');
    expect(windowLabelOf('get_season_scoring', {}, env())).toBe('this season');
  });

  it('names nothing for a read with no window, or one that returned nothing', () => {
    expect(windowLabelOf('get_team_overview', {}, env())).toBeUndefined();
    expect(windowLabelOf('get_open_tasks', {}, env())).toBeUndefined();
    expect(windowLabelOf('get_player_metrics', {}, env({ coverage: 'unavailable' }))).toBeUndefined();
    expect(windowLabelOf('get_player_metrics', {}, env({ coverage: 'empty' }))).toBeUndefined();
    const same = env();
    expect(withWindowLabel('get_team_overview', {}, same)).toBe(same);
  });
});

describe('the read wrappers stamp the window on the evidence the thread receives', () => {
  const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Varsity', timezone: 'America/New_York', roster: [person('p1', 'Owen Carter')] };
  const bands = { bands: ['0–3 ft', '3–5 ft', '5–10 ft', '10–15 ft', '15–25 ft', '25+ ft'].map((label) => ({ label, made: 5, attempts: 10 })), rounds: 9, window_start: '2026-10-01', window_end: '2026-11-04' };
  const evidence = (writer: { write: ReturnType<typeof vi.fn> }) => writer.write.mock.calls.map((c) => c[0] as { type: string; data?: { envelope?: ToolEnvelope } }).find((p) => p.type === 'data-evidence')?.data?.envelope;

  async function run(askV2: boolean, input: object) {
    const writer = { write: vi.fn() };
    const { sb } = pgrst({ golf_teams: { rows: [{ id: 'team-1', gender: 'mens' }] }, golf_pga_standards: { rows: [] }, golf_player_stats_cache: { rows: [{ player_id: 'p1', rounds_played: 30, putt_make_pct_3_5ft: 90, putt_attempts_3_5ft: 100 }] } });
    const tools = buildCoachTools({ sb, ctx, conversationId: 'c', writer: writer as never, collect: vi.fn(), askV2, teamTools: true, puttBands: async () => bands });
    await tools.get_putting_distance_profile!.execute!(input as never, {} as never);
    return evidence(writer);
  }

  it('the coach’s Ask v2 read carries the window it used; the old Ask’s does not', async () => {
    expect((await run(true, { player_id: 'p1', window: 'season' }))?.window_label).toBe('this season');
    expect((await run(true, { player_id: 'p1', window: 'cache' }))?.window_label).toBe('all recorded rounds');
    expect((await run(false, { player_id: 'p1', window: 'season' }))?.window_label).toBeUndefined();
  });

  it('the player’s read carries it too', async () => {
    const written: Array<{ type: string; data?: { envelope?: ToolEnvelope } }> = [];
    const me = { ...ctx, coach_id: '', roster: [person('p1', 'Owen Carter')] };
    const { sb } = pgrst({ golf_teams: { rows: [{ id: 'team-1', gender: 'mens' }] }, golf_pga_standards: { rows: [] }, golf_rounds: { rows: [] }, golf_holes: { rows: [] } });
    const tools = buildPlayerTools({ sb, ctx: me, playerId: 'p1', writer: { write: (p: never) => written.push(p) } as never, collect: () => {} });
    await tools.get_recent_rounds!.execute!({ last_n: 5 } as never, {} as never);
    const e = written.find((p) => p.type === 'data-evidence')?.data?.envelope;
    // No rounds: nothing was read over a window, so none is claimed.
    expect(e?.window_label).toBeUndefined();
  });
});
