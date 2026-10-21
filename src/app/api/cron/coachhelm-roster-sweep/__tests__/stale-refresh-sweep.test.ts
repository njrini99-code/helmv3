/**
 * Idle-player stale refresh (`coachhelm_stale_refresh_v1`). An analyzed
 * player with an open read whose newest analysis is 14+ days old is
 * re-analyzed, oldest first, at most STALE_REFRESH_CAP a night. Flag off:
 * the sweep is unchanged. Synthetic data.
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
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { GET } from '../route';
import { triggerPlayerInsightsAfterRound } from '@/lib/coachhelm/v2/trigger-insights-bridge';
import { logServerEvent } from '@/lib/server-error-logger';
import { __resetRoundIndexMemo } from '@/lib/coachhelm/v3/engine/read-window';
import { STALE_REFRESH_CAP, STALE_REFRESH_FLAG } from '@/lib/coachhelm/v3/engine/stale-refresh';

const triggerMock = vi.mocked(triggerPlayerInsightsAfterRound);
const DAY = 86_400_000;
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
  tables.golf_team_members!.push({ id: `m-${player}`, team_id: 't1', player_id: player, status: 'active' });
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

beforeEach(() => {
  vi.clearAllMocks();
  enabledFlags.clear();
  triggerMock.mockResolvedValue({ success: true, insights_created: 1 });
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

  it('holds the nightly cap, oldest first', async () => {
    enabledFlags.add(STALE_REFRESH_FLAG);
    for (let i = 0; i < STALE_REFRESH_CAP + 3; i++) addIdle(`player-${String(i).padStart(2, '0')}`, 20 + i);
    const body = await callGet();
    const stale = ran().filter((id) => id !== 'player-new');
    expect(stale).toHaveLength(STALE_REFRESH_CAP);
    expect(stale).toEqual(['player-08', 'player-07', 'player-06', 'player-05', 'player-04', 'player-03']);
    expect(body).toMatchObject({ staleRefreshPicked: STALE_REFRESH_CAP, alreadyAnalyzedSkipped: 3 });
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
