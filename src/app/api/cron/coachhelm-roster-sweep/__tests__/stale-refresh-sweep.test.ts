/**
 * Idle-player stale refresh (`coachhelm_stale_refresh_v1`). An analyzed
 * player with an open read whose newest analysis is 14+ days old is
 * re-analyzed, at most STALE_REFRESH_CAP a night, in a nightly rotation
 * through the stale players ordered oldest first. Flag off: the sweep is
 * unchanged. Synthetic data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let tables: Record<string, Array<Record<string, unknown>>>;
const enabledFlags = new Set<string>();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => enabledFlags.has(id) }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({}));
vi.mock('@/lib/coachhelm/v2/trigger-insights-bridge', () => ({
  triggerPlayerInsightsAfterRound: vi.fn(async () => ({ success: true, insights_created: 1 })),
}));
vi.mock('@/lib/coachhelm/engine-owner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/engine-owner')>();
  return { ...actual, resolveEngineOwner: vi.fn(actual.resolveEngineOwner) };
});
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { FRESHNESS_TIME_BUDGET_MS, GET } from '../route';
import { resolveEngineOwner } from '@/lib/coachhelm/engine-owner';
import { triggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';
import { logServerEvent } from '@/lib/server-error-logger';
import { __resetRoundIndexMemo } from '@/lib/coachhelm/v3/engine/read-window';
import {
  STALE_REFRESH_CAP,
  STALE_REFRESH_FLAG,
  STALE_REFRESH_OWNER_CHECK_CAP,
} from '@/lib/coachhelm/v3/engine/stale-refresh';

const triggerMock = vi.mocked(triggerPlayerInsightsAfterRound);
const ownerMock = vi.mocked(resolveEngineOwner);
const actualResolveEngineOwner = (
  await vi.importActual<typeof import('@/lib/coachhelm/engine-owner')>('@/lib/coachhelm/engine-owner')
).resolveEngineOwner;
const DAY = 86_400_000;
/** Pin the clock to 02:00 UTC of the first night from 2026-10-21 whose rotation offset (day * cap) mod n is `offset`. */
function pinNight(n: number, offset: number): number {
  let d = Math.floor(Date.parse('2026-10-21T00:00:00Z') / DAY);
  while ((d * STALE_REFRESH_CAP) % n !== offset) d++;
  const at = d * DAY + 2 * 3_600_000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at);
  return at;
}
/** The extra of the stale-refresh log event. */
function staleEventExtra(): Record<string, unknown> | undefined {
  const call = vi.mocked(logServerEvent).mock.calls.find((c) => String(c[0]).includes('staleRefresh'));
  return (call?.[1] as { extra?: Record<string, unknown> } | undefined)?.extra;
}
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const dayOnly = (d: number) => daysAgo(d).slice(0, 10);

function roundRow(id: string, player: string, roundDaysAgo: number, analyzed: boolean) {
  return {
    id,
    player_id: player,
    status: 'completed',
    is_test: false,
    round_date: dayOnly(roundDaysAgo),
    created_at: daysAgo(roundDaysAgo),
    coachhelm_analyzed_at: analyzed ? daysAgo(roundDaysAgo) : null,
    holes_played: 18,
    total_score: 76,
  };
}

function openRead(player: string, refreshedDaysAgo: number) {
  return {
    id: `i-${player}`,
    player_id: player,
    engine_version: 'v3',
    lifecycle_state: 'detected',
    status: 'active',
    created_at: daysAgo(refreshedDaysAgo + 30),
    metadata: { last_refreshed_at: daysAgo(refreshedDaysAgo) },
    evidence: { window_end: dayOnly(refreshedDaysAgo + 5) },
  };
}

/** One rostered, analyzed player whose newest analysis is `staleDays` old. */
function addIdle(player: string, staleDays: number, opts: { roundDaysAgo?: number } = {}) {
  tables.golf_team_members!.push({
    id: `m-${player}`, team_id: 't1', player_id: player, status: 'active',
    // The fake ignores embeds; the engine-owner read takes the joined org from here.
    golf_teams: { organization_id: 'org1' },
  });
  tables.golf_rounds!.push(roundRow(`r-${player}`, player, opts.roundDaysAgo ?? staleDays + 5, true));
  tables.golf_coach_insights!.push(openRead(player, staleDays));
}

function seed() {
  tables = {
    golf_team_members: [{ id: 'm-new', team_id: 't1', player_id: 'player-new', status: 'active' }],
    // A player with an unanalyzed latest round: the legacy rule runs them either way.
    golf_rounds: [roundRow('r-new', 'player-new', 1, false)],
    golf_coach_insights: [],
    golf_insight_generation_log: [],
    golf_coaches: [{ id: 'coach1', organization_id: 'org1', created_at: '2026-01-01T00:00:00Z' }],
    golf_coachhelm_settings: [],
    golf_team_coachhelm_settings: [],
  };
  fake = createFakeSupabase({ tables });
}

async function callGet() {
  const res = await GET(
    new Request('http://x/api/cron/coachhelm-roster-sweep', {
      headers: { authorization: 'Bearer cs' },
    }) as unknown as import('next/server').NextRequest,
  );
  return (await res.json()) as Record<string, number | boolean>;
}

const ran = () => triggerMock.mock.calls.map((c) => c[0]);

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  enabledFlags.clear();
  triggerMock.mockResolvedValue({ success: true, insights_created: 1 });
  ownerMock.mockImplementation(actualResolveEngineOwner);
  process.env.CRON_SECRET = 'cs';
  __resetRoundIndexMemo();
  seed();
});

describe('roster sweep — idle-player stale refresh', () => {
  it('flag off: an idle player is skipped, as before', async () => {
    addIdle('player-idle', 30);
    const body = await callGet();
    expect(ran()).toEqual(['player-new']);
    expect(body).toMatchObject({ alreadyAnalyzedSkipped: 1, staleRefreshed: 0, staleRefreshPicked: 0 });
  });

  it('flag on: picks an idle player whose newest analysis is 14+ days old', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    addIdle('player-idle', 30);
    addIdle('player-recent', 5);
    const body = await callGet();
    expect(ran()).toEqual(['player-new', 'player-idle']);
    expect(body).toMatchObject({
      playersTotal: 3,
      alreadyAnalyzedSkipped: 1,
      analyzed: 2,
      staleRefreshed: 1,
      staleRefreshPicked: 1,
    });
    expect(vi.mocked(logServerEvent)).toHaveBeenCalledWith(
      expect.stringContaining('staleRefresh'),
      expect.objectContaining({ action: 'cron.coachhelm.rosterSweep.staleRefresh' }),
      'info',
    );
  });

  it('holds the nightly cap, oldest first on a night whose rotation starts at the top', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    pinNight(STALE_REFRESH_CAP + 3, 0);
    for (let i = 0; i < STALE_REFRESH_CAP + 3; i++) addIdle(`player-${String(i).padStart(2, '0')}`, 20 + i);
    const body = await callGet();
    const stale = ran().filter((id) => id !== 'player-new');
    expect(stale).toHaveLength(STALE_REFRESH_CAP);
    expect(stale).toEqual(['player-08', 'player-07', 'player-06', 'player-05', 'player-04', 'player-03']);
    expect(body).toMatchObject({ staleRefreshPicked: STALE_REFRESH_CAP, alreadyAnalyzedSkipped: 3 });
  });

  it('rotates: unproductive picks write nothing and the next night takes the others', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    const night = pinNight(STALE_REFRESH_CAP + 3, 0);
    for (let i = 0; i < STALE_REFRESH_CAP + 3; i++) addIdle(`player-${String(i).padStart(2, '0')}`, 20 + i);
    // Every stale run parks: nothing re-anchors them, so all nine stay stale.
    triggerMock.mockImplementation(async (playerId: string) =>
      playerId === 'player-new'
        ? { success: true, insights_created: 1 }
        : { success: false, code: 'engine_below_round_floor' as never, error: 'under floor' },
    );
    const first = await callGet();
    const firstNight = ran().filter((id) => id !== 'player-new');
    expect(first).toMatchObject({ staleRefreshPicked: STALE_REFRESH_CAP, staleRefreshed: 0 });
    expect(staleEventExtra()).toMatchObject({ unproductive: STALE_REFRESH_CAP });
    // The sweep writes no marker row of its own.
    expect(tables.golf_insight_generation_log).toEqual([]);

    triggerMock.mockClear();
    vi.setSystemTime(night + DAY);
    await callGet();
    const secondNight = ran().filter((id) => id !== 'player-new');
    // Offset (1 * 6) mod 9 = 6 places on: the three waiting players, then the oldest again.
    expect(secondNight).toEqual(['player-02', 'player-01', 'player-00', 'player-08', 'player-07', 'player-06']);
    expect(new Set([...firstNight, ...secondNight]).size).toBe(STALE_REFRESH_CAP + 3);
  });

  it('an engine run inside the window keeps a player out', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    addIdle('player-idle', 30);
    tables.golf_insight_generation_log!.push({
      id: 'g1', player_id: 'player-idle', insight_type: 'post_round_v2', created_at: daysAgo(3),
    });
    await callGet();
    expect(ran()).toEqual(['player-new']);
  });

  it('a player with no round inside the engine window is not picked', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    addIdle('player-gone', 30, { roundDaysAgo: 120 });
    await callGet();
    expect(ran()).toEqual(['player-new']);
  });

  it('a player with no open read is not picked', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    addIdle('player-dismissed', 30);
    tables.golf_coach_insights!.find((r) => r.player_id === 'player-dismissed')!.status = 'dismissed';
    await callGet();
    expect(ran()).toEqual(['player-new']);
  });

  it('a failed stale run is not counted as refreshed', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    addIdle('player-idle', 30);
    triggerMock.mockImplementation(async (playerId: string) =>
      playerId === 'player-idle'
        ? { success: false, code: 'engine_error' as never, error: 'boom' }
        : { success: true, insights_created: 1 },
    );
    const body = await callGet();
    expect(body).toMatchObject({ staleRefreshPicked: 1, staleRefreshed: 0, failed: 1 });
  });

  it('skips a player whose team has CoachHelm off, so they never take a slot', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    addIdle('player-off', 60);
    addIdle('player-on', 30);
    // player-off moves to a team that switched CoachHelm off (same org and coach).
    tables.golf_team_members!.find((m) => m.player_id === 'player-off')!.team_id = 't-off';
    tables.golf_team_coachhelm_settings!.push({ team_id: 't-off', enabled: false, disabled_reason: 'paused' });
    const body = await callGet();
    expect(ran()).toEqual(['player-new', 'player-on']);
    expect(body).toMatchObject({ staleRefreshPicked: 1 });
  });

  it('skips a player whose coach has CoachHelm off', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    addIdle('player-idle', 30);
    tables.golf_coachhelm_settings!.push({ coach_id: 'coach1', enabled: false, disabled_reason: null });
    await callGet();
    expect(ran()).toEqual(['player-new']);
  });

  it('stops the owner checks after STALE_REFRESH_OWNER_CHECK_CAP a night', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    for (let i = 0; i < STALE_REFRESH_OWNER_CHECK_CAP + 2; i++) addIdle(`player-off-${String(i).padStart(2, '0')}`, 20 + i);
    // A switched-off team: every check skips, so only the check cap ends the loop.
    for (const m of tables.golf_team_members!) if (m.player_id !== 'player-new') m.team_id = 't-off';
    tables.golf_team_coachhelm_settings!.push({ team_id: 't-off', enabled: false, disabled_reason: 'paused' });
    const body = await callGet();
    expect(ran()).toEqual(['player-new']);
    expect(ownerMock).toHaveBeenCalledTimes(STALE_REFRESH_OWNER_CHECK_CAP);
    expect(body).toMatchObject({ staleRefreshPicked: 0 });
    expect(staleEventExtra()).toMatchObject({
      stale: STALE_REFRESH_OWNER_CHECK_CAP + 2,
      ownerChecked: STALE_REFRESH_OWNER_CHECK_CAP,
      ownerCheckStop: 'check_cap',
      picked: 0,
    });
  });

  it('stops the owner checks once the time budget is spent and keeps the picks so far', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    addIdle('player-a', 30);
    addIdle('player-b', 40);
    addIdle('player-c', 50);
    const start = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start);
    ownerMock.mockImplementation(async (...args) => {
      // The first check uses up the budget.
      vi.setSystemTime(start + FRESHNESS_TIME_BUDGET_MS + 1_000);
      return actualResolveEngineOwner(...args);
    });
    const body = await callGet();
    expect(ownerMock).toHaveBeenCalledTimes(1);
    // The unanalyzed round still runs; the one stale pick is deferred by the same budget.
    expect(ran()).toEqual(['player-new']);
    expect(body).toMatchObject({ staleRefreshPicked: 1, staleRefreshDeferred: 1, staleRefreshed: 0 });
    expect(staleEventExtra()).toMatchObject({ ownerChecked: 1, ownerCheckStop: 'time_budget', picked: 1 });
  });

  describe('HELM_COACHHELM_TEAMS canary', () => {
    afterEach(() => {
      delete process.env.HELM_COACHHELM_TEAMS;
    });

    it('only picks players on a listed team', async () => {
      enabledFlags.add(STALE_REFRESH_FLAG);
      addIdle('player-listed', 30);
      addIdle('player-unlisted', 40);
      tables.golf_team_members!.find((m) => m.player_id === 'player-listed')!.team_id = 't2';
      process.env.HELM_COACHHELM_TEAMS = 't2';
      await callGet();
      expect(ran()).toEqual(['player-new', 'player-listed']);
    });
  });
});
