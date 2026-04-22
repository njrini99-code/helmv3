/**
 * Tests for generateApproachMissInsights (Group B1).
 *
 * Strategy: intercept the `upsertInsight` / `attachDrills` helpers so we
 * never need a real DB. Build small synthetic miss-rows and make them
 * available through a fake Supabase admin client. Then assert on what
 * upsertInsight was called with (signature, category, drill tags, etc.).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks — vi.hoisted keeps variable references available inside the
// vi.mock factories that are themselves hoisted above normal `const`s.
const { upsertInsightMock, attachDrillsMock, logServerErrorMock, createAdminClientMock } =
  vi.hoisted(() => ({
    upsertInsightMock: vi.fn(async () => 'insight-id'),
    attachDrillsMock: vi.fn(async () => undefined),
    logServerErrorMock: vi.fn(async () => undefined),
    createAdminClientMock: vi.fn(),
  }));

vi.mock('@/lib/coachhelm/v2/insights/upsert', () => ({
  upsertInsight: upsertInsightMock,
  attachDrills: attachDrillsMock,
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: logServerErrorMock,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import { generateApproachMissInsights } from '@/lib/coachhelm/v2/mining/approach-analytics';

/**
 * upsertInsight is called as upsertInsight(supabaseClient, input). We only
 * care about the second arg in these assertions; this helper coerces the
 * strict typed mock.calls into a simpler shape.
 */
function insightCalls<T = Record<string, unknown>>(): T[] {
  return (
    upsertInsightMock.mock.calls as unknown as Array<[unknown, T]>
  ).map(([, arg]) => arg);
}

/* -------------------------------------------------------------------------- */
/*  Fake supabase client                                                      */
/* -------------------------------------------------------------------------- */

interface MissRowFixture {
  miss_direction: string | null;
  lie_type: string | null;
  distance_from_green_yards: number | null;
  shot_distance: number | null;
}

function shapeRows(rows: MissRowFixture[]) {
  return rows.map((r) => ({
    miss_direction: r.miss_direction,
    lie_type: r.lie_type,
    distance_from_green_yards: r.distance_from_green_yards,
    golf_shots: {
      shot_distance: r.shot_distance,
      golf_rounds: {
        player_id: 'player-1',
        round_date: '2026-04-01',
      },
    },
  }));
}

function makeClient(rows: MissRowFixture[]) {
  const fromFn = vi.fn(() => {
    const thenable: Record<string, unknown> = {};
    const chain = () => thenable;
    thenable.select = vi.fn(chain);
    thenable.eq = vi.fn(chain);
    thenable.gte = vi.fn(() => Promise.resolve({ data: shapeRows(rows), error: null }));
    return thenable;
  });
  return { from: fromFn };
}

/* -------------------------------------------------------------------------- */
/*  Test fixtures                                                             */
/* -------------------------------------------------------------------------- */

function row(
  distance: number,
  lie: string,
  direction: string,
  dfg: number,
): MissRowFixture {
  return {
    shot_distance: distance,
    lie_type: lie,
    miss_direction: direction,
    distance_from_green_yards: dfg,
  };
}

/* -------------------------------------------------------------------------- */

describe('generateApproachMissInsights', () => {
  beforeEach(() => {
    upsertInsightMock.mockClear();
    attachDrillsMock.mockClear();
    logServerErrorMock.mockClear();
    createAdminClientMock.mockReset();
  });

  it('respects minimum sample threshold — 7 rows in a bucket → no emit', async () => {
    const rows = [
      row(160, 'rough', 'left', 10),
      row(160, 'rough', 'left', 12),
      row(160, 'rough', 'right', 11),
      row(160, 'rough', 'left', 14),
      row(160, 'rough', 'left', 13),
      row(160, 'rough', 'left', 15),
      row(160, 'rough', 'left', 10),
    ];
    createAdminClientMock.mockReturnValue(makeClient(rows));

    await generateApproachMissInsights('player-1');

    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits the dominant-lie insight when >=40% of misses land in one lie', async () => {
    // 10 misses in 150_175, 60% rough, mixed directions
    const rows = [
      row(160, 'rough', 'left', 10),
      row(160, 'rough', 'right', 12),
      row(160, 'rough', 'long', 11),
      row(160, 'rough', 'short', 14),
      row(160, 'rough', 'left', 13),
      row(160, 'rough', 'right', 15),
      row(160, 'fairway', 'short', 6),
      row(160, 'fairway', 'long', 7),
      row(160, 'bunker', 'short_right', 10),
      row(160, 'bunker', 'short_left', 9),
    ];
    createAdminClientMock.mockReturnValue(makeClient(rows));

    await generateApproachMissInsights('player-1');

    const signatures = insightCalls<{ signature: string }>().map((a) => a.signature);
    expect(signatures).toContain('player-1:approach_miss_lie:150_175_rough');
  });

  it('does not emit dominant-lie insight when misses are balanced across lies', async () => {
    // 8 misses spread evenly: 2 each across fairway/rough/bunker/hazard
    const rows = [
      row(160, 'fairway', 'short', 5),
      row(160, 'fairway', 'long', 6),
      row(160, 'rough', 'left', 11),
      row(160, 'rough', 'right', 10),
      row(160, 'bunker', 'short_right', 10),
      row(160, 'bunker', 'short_left', 9),
      row(160, 'water', 'long_left', 30), // hazard
      row(160, 'water', 'long_right', 30),
    ];
    createAdminClientMock.mockReturnValue(makeClient(rows));

    await generateApproachMissInsights('player-1');

    const lieSignatures = insightCalls<{ signature: string }>()
      .map((a) => a.signature)
      .filter((s) => s.startsWith('player-1:approach_miss_lie:'));
    expect(lieSignatures).toHaveLength(0);
  });

  it('emits the severity insight when avg distance_from_green exceeds 1.5x baseline', async () => {
    // 9 misses in 175_200 with an average distance_from_green ~30yd
    // (baseline for 175_200 is 18yd, so 30/18 = 1.67x).
    const rows = Array.from({ length: 9 }, (_, i) =>
      row(185, 'rough', i % 2 === 0 ? 'left' : 'short', 30),
    );
    createAdminClientMock.mockReturnValue(makeClient(rows));

    await generateApproachMissInsights('player-1');

    const severitySigs = insightCalls<{
      signature: string;
      drill_tags?: string[];
    }>().filter(
      (a) => a.signature === 'player-1:approach_severity:175_200',
    );
    expect(severitySigs).toHaveLength(1);
    expect(severitySigs[0]?.drill_tags).toEqual([
      'approach',
      '175_200',
      'proximity',
      'distance_control',
    ]);
  });

  it('does not emit severity insight when avg distance_from_green is near baseline', async () => {
    const rows = Array.from({ length: 9 }, () =>
      row(185, 'fairway', 'short', 12),
    );
    createAdminClientMock.mockReturnValue(makeClient(rows));

    await generateApproachMissInsights('player-1');

    const sigs = insightCalls<{ signature: string }>().map((a) => a.signature);
    expect(sigs).not.toContain('player-1:approach_severity:175_200');
  });

  it('emits the direction-bias insight only when one side >=60%', async () => {
    // 10 misses at 160yd — 8 left, 2 right. Also 60% rough so dominant lie
    // still fires, but we only assert on the direction insight here.
    const rows = [
      row(160, 'rough', 'left', 10),
      row(160, 'rough', 'left', 12),
      row(160, 'rough', 'left', 11),
      row(160, 'rough', 'long_left', 14),
      row(160, 'rough', 'left', 13),
      row(160, 'rough', 'left', 15),
      row(160, 'fairway', 'left', 6),
      row(160, 'fairway', 'short_left', 7),
      row(160, 'bunker', 'right', 10),
      row(160, 'bunker', 'right', 9),
    ];
    createAdminClientMock.mockReturnValue(makeClient(rows));

    await generateApproachMissInsights('player-1');

    const dirSigs = insightCalls<{
      signature: string;
      drill_tags?: string[];
    }>().filter((a) =>
      a.signature.startsWith('player-1:approach_direction:150_175'),
    );
    expect(dirSigs).toHaveLength(1);
    expect(dirSigs[0]?.signature).toBe(
      'player-1:approach_direction:150_175_left',
    );
    expect(dirSigs[0]?.drill_tags).toEqual([
      'approach',
      '150_175',
      'direction_bias',
      'face_alignment',
    ]);
  });

  it('upserts with the same signature on repeat runs (dedup relies on upsertInsight)', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(160, 'rough', i < 6 ? 'left' : 'right', 12),
    );
    createAdminClientMock.mockReturnValue(makeClient(rows));

    await generateApproachMissInsights('player-1');
    createAdminClientMock.mockReturnValue(makeClient(rows)); // fresh builder
    await generateApproachMissInsights('player-1');

    // Every signature should appear exactly twice with the same args.
    const signatures = insightCalls<{ signature: string }>().map(
      (a) => a.signature,
    );
    const counts = signatures.reduce<Record<string, number>>((acc, s) => {
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
    for (const count of Object.values(counts)) {
      expect(count).toBe(2);
    }
  });
});
