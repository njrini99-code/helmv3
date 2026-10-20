/**
 * Slice 0b sweep predicate. With `coachhelm_reads_v1_copy` off the sweep is
 * exactly the #920 rule (unanalyzed latest round only). With it on, a player
 * whose latest round is analyzed is still refreshed when their newest
 * countable round is newer than their newest visible read. Synthetic data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let tables: Record<string, Array<Record<string, unknown>>>;
const flagMock = vi.fn(() => false);

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flagMock() }));
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
import { __resetRoundIndexMemo } from '@/lib/coachhelm/v3/engine/read-window';

const triggerMock = vi.mocked(triggerPlayerInsightsAfterRound);

function roundRow(id: string, player: string, date: string, analyzed: boolean) {
  return {
    id,
    player_id: player,
    status: 'completed',
    is_test: false,
    round_date: date,
    created_at: `${date}T20:00:00Z`,
    coachhelm_analyzed_at: analyzed ? `${date}T21:00:00Z` : null,
    holes_played: 18,
    total_score: 76,
    front_nine: 38,
    back_nine: 38,
    total_putts: 31,
  };
}

function read(player: string, windowEnd: string, newestRoundId?: string) {
  return {
    id: `i-${player}-${windowEnd}`,
    player_id: player,
    engine_version: 'v3',
    lifecycle_state: 'detected',
    status: 'active',
    evidence: { window_end: windowEnd, ...(newestRoundId ? { newest_round_id: newestRoundId } : {}) },
  };
}

function seed() {
  tables = {
      golf_team_members: ['A', 'B', 'C', 'D'].map((p, i) => ({
        id: `m${i}`, team_id: 't1', player_id: `player-${p}`, status: 'active',
      })),
      golf_rounds: [
        // A: analyzed, but reads stop at Oct 10 and a round on Oct 18 exists.
        roundRow('a1', 'player-A', '2026-10-10', true),
        roundRow('a2', 'player-A', '2026-10-18', true),
        // B: analyzed and its newest read already reaches its newest round.
        roundRow('b1', 'player-B', '2026-10-18', true),
        // C: latest round unanalyzed: the legacy rule runs it either way.
        roundRow('c1', 'player-C', '2026-10-19', false),
        // D: analyzed, no reads at all: nothing for freshness to refresh.
        roundRow('d1', 'player-D', '2026-10-12', true),
      ],
      golf_coach_insights: [
        read('player-A', '2026-10-10'),
        read('player-A', '2026-09-30'),
        read('player-B', '2026-10-01'),
        read('player-B', '2026-10-18', 'b1'),
        // A dismissed read never counts as the newest read.
        { ...read('player-D', '2026-10-12'), status: 'dismissed' },
      ],
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

beforeEach(() => {
  vi.clearAllMocks();
  triggerMock.mockResolvedValue({ success: true, insights_created: 1 });
  process.env.CRON_SECRET = 'cs';
  __resetRoundIndexMemo();
  seed();
});

describe('roster sweep — Slice 0b freshness predicate', () => {
  it('flag off: only the unanalyzed-latest-round player runs (unchanged)', async () => {
    flagMock.mockReturnValue(false);
    const body = await callGet();
    expect(triggerMock.mock.calls.map((c) => c[0])).toEqual(['player-C']);
    expect(body).toMatchObject({ alreadyAnalyzedSkipped: 3, freshnessRefreshed: 0, freshnessDeferred: 0 });
  });

  it('flag on: also refreshes a player whose newest round is newer than their newest read', async () => {
    flagMock.mockReturnValue(true);
    const body = await callGet();
    expect(triggerMock.mock.calls.map((c) => c[0]).sort()).toEqual(['player-A', 'player-C']);
    expect(body).toMatchObject({
      playersTotal: 4,
      alreadyAnalyzedSkipped: 2,
      analyzed: 2,
      freshnessRefreshed: 1,
      freshnessDeferred: 0,
    });
  });

  it('a failed freshness run is not counted as refreshed', async () => {
    flagMock.mockReturnValue(true);
    triggerMock.mockImplementation(async (playerId: string) =>
      playerId === 'player-A'
        ? { success: false, code: 'engine_error' as never, error: 'boom' }
        : { success: true, insights_created: 1 },
    );
    const body = await callGet();
    expect(triggerMock.mock.calls.map((c) => c[0]).sort()).toEqual(['player-A', 'player-C']);
    expect(body).toMatchObject({ analyzed: 1, freshnessRefreshed: 0 });
  });

  it('finds the newest countable round behind more than a page of non-countable ones', async () => {
    flagMock.mockReturnValue(true);
    const rounds = tables.golf_rounds!;
    // E: a countable round on Oct 15 after their newest read (Oct 1), then
    // 60 newer imports missing a nine (not countable), the latest analyzed.
    rounds.push(roundRow('e-real', 'player-E', '2026-10-15', true));
    for (let i = 0; i < 60; i++) {
      rounds.push({
        ...roundRow(`e-imp-${i}`, 'player-E', '2026-10-16', true),
        created_at: `2026-10-16T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i).padStart(2, '0')}:00Z`,
        back_nine: null,
      });
    }
    tables.golf_team_members!.push({
      id: 'm4', team_id: 't1', player_id: 'player-E', status: 'active',
    });
    tables.golf_coach_insights!.push(read('player-E', '2026-10-01'));
    await callGet();
    expect(triggerMock.mock.calls.map((c) => c[0])).toContain('player-E');
  });

  it('counts a read the shared visibility filter keeps by its v3 signature alone', async () => {
    flagMock.mockReturnValue(true);
    // A's newest read has a lagging engine_version but a v3 signature and
    // already names A's newest round: A is current, so only C runs.
    tables.golf_coach_insights!.push({
      ...read('player-A', '2026-10-18', 'a2'),
      id: 'i-A-sig',
      engine_version: null,
      signature: 'v3:putt_distance:x',
    });
    await callGet();
    expect(triggerMock.mock.calls.map((c) => c[0])).toEqual(['player-C']);
  });

  it('ignores a newer test round and a newer non-countable round', async () => {
    flagMock.mockReturnValue(true);
    // B is current on Oct 18; a QA round and a 9-hole-missing import after it
    // must not make B "behind".
    tables.golf_rounds!.push(
      { ...roundRow('b-qa', 'player-B', '2026-10-19', true), is_test: true },
      { ...roundRow('b-imp', 'player-B', '2026-10-19', true), front_nine: null },
    );
    await callGet();
    expect(triggerMock.mock.calls.map((c) => c[0])).not.toContain('player-B');
  });

  it('skips a behind player whose engine ran inside the cooldown', async () => {
    flagMock.mockReturnValue(true);
    tables.golf_insight_generation_log = [
      { id: 'g1', player_id: 'player-A', insight_type: 'post_round_v2', created_at: new Date().toISOString() },
    ];
    const body = await callGet();
    expect(triggerMock.mock.calls.map((c) => c[0])).toEqual(['player-C']);
    expect(body).toMatchObject({ freshnessCooldown: 1, freshnessRefreshed: 0 });
  });

  it('an old engine run does not cool a player down', async () => {
    flagMock.mockReturnValue(true);
    tables.golf_insight_generation_log = [
      { id: 'g1', player_id: 'player-A', insight_type: 'post_round_v2', created_at: '2026-01-01T00:00:00Z' },
    ];
    await callGet();
    expect(triggerMock.mock.calls.map((c) => c[0]).sort()).toEqual(['player-A', 'player-C']);
  });

  function addBehindPlayers(n: number) {
    for (let i = 0; i < n; i++) {
      const p = `player-X${i}`;
      tables.golf_team_members!.push({ id: `mx${i}`, team_id: 't1', player_id: p, status: 'active' });
      tables.golf_rounds!.push(roundRow(`x${i}`, p, '2026-10-18', true));
      tables.golf_coach_insights!.push({ ...read(p, '2026-10-01'), id: `i-x${i}` });
    }
  }

  it('runs at most 25 freshness refreshes a night and defers the rest', async () => {
    flagMock.mockReturnValue(true);
    addBehindPlayers(30);
    const body = await callGet();
    // 31 behind (A + 30), plus C on the legacy rule.
    expect(triggerMock).toHaveBeenCalledTimes(26);
    expect(body).toMatchObject({ freshnessRefreshed: 25, freshnessDeferred: 6 });
  });

  it('starts no freshness batch after the time budget and reports the rest as deferred', async () => {
    flagMock.mockReturnValue(true);
    addBehindPlayers(10);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T02:00:00Z'));
    triggerMock.mockImplementation(async () => {
      // The first batch (C plus two refreshes) uses up the budget.
      vi.setSystemTime(new Date('2026-10-20T02:04:10Z'));
      return { success: true, insights_created: 1 };
    });
    try {
      const body = await callGet();
      expect(triggerMock).toHaveBeenCalledTimes(3);
      expect(body).toMatchObject({ freshnessRefreshed: 2, freshnessDeferred: 9 });
    } finally {
      vi.useRealTimers();
    }
  });
});
