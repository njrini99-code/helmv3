/**
 * Slice 0b sweep predicate. With `coachhelm_reads_v1_copy` off the sweep is
 * exactly the #920 rule (unanalyzed latest round only). With it on, a player
 * whose latest round is analyzed is still refreshed when their newest
 * countable round is newer than their newest visible read. Synthetic data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
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
  fake = createFakeSupabase({
    tables: {
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
    },
  });
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
});
