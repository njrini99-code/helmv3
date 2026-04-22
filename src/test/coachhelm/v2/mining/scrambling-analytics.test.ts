/**
 * Tests for generateScramblingInsights (Group B2).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { generateScramblingInsights } from '@/lib/coachhelm/v2/mining/scrambling-analytics';

function insightCalls<T = Record<string, unknown>>(): T[] {
  return (
    upsertInsightMock.mock.calls as unknown as Array<[unknown, T]>
  ).map(([, arg]) => arg);
}

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */

interface Attempt {
  lie: 'fairway' | 'rough' | 'bunker' | 'sand';
  up_and_down: boolean;
  round_id: string;
  hole_number: number;
}

/**
 * Build a fake Supabase client whose first `.from('approach_miss_details')`
 * call resolves to the miss rows and whose second `.from('golf_holes')`
 * call resolves to the hole rows. Order matters because the generator
 * queries in that sequence.
 */
function makeClient(attempts: Attempt[]) {
  const missRows = attempts.map((a) => ({
    lie_type: a.lie,
    golf_shots: {
      round_id: a.round_id,
      hole_number: a.hole_number,
      golf_rounds: {
        player_id: 'player-1',
        round_date: '2026-04-01',
      },
    },
  }));

  const holeRows = attempts.map((a) => ({
    round_id: a.round_id,
    hole_number: a.hole_number,
    up_and_down: a.up_and_down,
  }));

  let callIdx = 0;

  const fromFn = vi.fn((table: string) => {
    const isMissQuery = table === 'approach_miss_details';
    const isHoleQuery = table === 'golf_holes';
    const thenable: Record<string, unknown> = {};
    const chain = () => thenable;
    thenable.select = vi.fn(chain);
    thenable.eq = vi.fn(chain);
    thenable.gte = vi.fn(() => {
      if (isMissQuery) {
        callIdx++;
        return Promise.resolve({ data: missRows, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    thenable.in = vi.fn(() => {
      if (isHoleQuery) {
        callIdx++;
        return Promise.resolve({ data: holeRows, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    return thenable;
  });

  return { from: fromFn };
}

function mk(
  lie: Attempt['lie'],
  up_and_down: boolean,
  i: number,
): Attempt {
  return {
    lie,
    up_and_down,
    round_id: 'r-1',
    hole_number: i,
  };
}

/* -------------------------------------------------------------------------- */

describe('generateScramblingInsights', () => {
  beforeEach(() => {
    upsertInsightMock.mockClear();
    attachDrillsMock.mockClear();
    createAdminClientMock.mockReset();
  });

  it('respects minimum attempt threshold (needs 6+ per lie)', async () => {
    // 5 bunker attempts only — under threshold.
    const attempts = [
      mk('bunker', false, 1),
      mk('bunker', false, 2),
      mk('bunker', false, 3),
      mk('bunker', false, 4),
      mk('bunker', true, 5),
    ];
    createAdminClientMock.mockReturnValue(makeClient(attempts));

    await generateScramblingInsights('player-1');

    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits a below-baseline insight when gap >=8pp (bunker 17% vs 38%)', async () => {
    const attempts = [
      mk('bunker', false, 1),
      mk('bunker', false, 2),
      mk('bunker', false, 3),
      mk('bunker', false, 4),
      mk('bunker', false, 5),
      mk('bunker', true, 6),
    ];
    createAdminClientMock.mockReturnValue(makeClient(attempts));

    await generateScramblingInsights('player-1');

    expect(upsertInsightMock).toHaveBeenCalledTimes(1);
    const [arg] = insightCalls<{
      signature: string;
      category: string;
      drill_tags: string[];
    }>();
    expect(arg?.signature).toBe('player-1:scrambling:bunker');
    expect(arg?.category).toBe('short_game');
    expect(arg?.drill_tags).toEqual(['short_game', 'bunker_fundamentals']);
  });

  it('emits an above-baseline insight when the player is >=8pp better', async () => {
    // 8 fairway attempts, 7 up-and-down → 87.5% vs 50% baseline.
    const attempts: Attempt[] = [];
    for (let i = 0; i < 7; i++) attempts.push(mk('fairway', true, i));
    attempts.push(mk('fairway', false, 7));
    createAdminClientMock.mockReturnValue(makeClient(attempts));

    await generateScramblingInsights('player-1');

    const [arg] = insightCalls<{
      signature: string;
      drill_tags: string[];
    }>();
    expect(arg?.signature).toBe('player-1:scrambling:fairway');
    expect(arg?.drill_tags).toEqual(['short_game', 'chip_proximity', 'pitch_control']);
  });

  it('does not emit when gap is within 8pp of baseline', async () => {
    // 8 rough attempts, ~37.5% up-and-down vs 32% baseline (gap ~5.5pp).
    const attempts: Attempt[] = [];
    for (let i = 0; i < 3; i++) attempts.push(mk('rough', true, i));
    for (let i = 3; i < 8; i++) attempts.push(mk('rough', false, i));
    createAdminClientMock.mockReturnValue(makeClient(attempts));

    await generateScramblingInsights('player-1');

    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('upserts with the same signature on repeat runs (dedup deferred to upsertInsight)', async () => {
    const attempts: Attempt[] = [];
    for (let i = 0; i < 6; i++) attempts.push(mk('bunker', false, i));
    createAdminClientMock.mockReturnValue(makeClient(attempts));
    await generateScramblingInsights('player-1');

    createAdminClientMock.mockReturnValue(makeClient(attempts));
    await generateScramblingInsights('player-1');

    const signatures = insightCalls<{ signature: string }>().map(
      (a) => a.signature,
    );
    expect(signatures).toEqual([
      'player-1:scrambling:bunker',
      'player-1:scrambling:bunker',
    ]);
  });
});
