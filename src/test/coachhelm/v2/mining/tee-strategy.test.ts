/**
 * Tests for generateTeeStrategyInsights (Group B3).
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
  GATED_OUT: '__gated_out__',
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: logServerErrorMock,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}));

import { generateTeeStrategyInsights } from '@/lib/coachhelm/v2/mining/tee-strategy';

function insightCalls<T = Record<string, unknown>>(): T[] {
  return (
    upsertInsightMock.mock.calls as unknown as Array<[unknown, T]>
  ).map(([, arg]) => arg);
}

interface TeeFixture {
  club: 'driver' | 'non_driver';
  fwHit: boolean;
  shotDistance: number;
  par: number;
}

function shape(fixtures: TeeFixture[]) {
  return fixtures.map((f) => ({
    club_type: f.club,
    distance_to_hole_before: 400,
    distance_to_hole_after: 400 - f.shotDistance,
    shot_distance: f.shotDistance,
    golf_rounds: {
      player_id: 'player-1',
      round_date: '2026-04-01',
    },
    golf_holes: {
      par: f.par,
      yardage: 400,
      fairway_hit: f.fwHit,
    },
  }));
}

function makeClient(fixtures: TeeFixture[]) {
  const fromFn = vi.fn(() => {
    const thenable: Record<string, unknown> = {};
    const chain = () => thenable;
    thenable.select = vi.fn(chain);
    thenable.eq = vi.fn(chain);
    thenable.gte = vi.fn(chain);
    // fetchTeeShots now terminates the chain with .limit(50000) (truncation fix).
    thenable.limit = vi.fn(() => Promise.resolve({ data: shape(fixtures), error: null }));
    return thenable;
  });
  return { from: fromFn };
}

function tee(
  club: 'driver' | 'non_driver',
  fwHit: boolean,
  shotDistance: number,
  par = 4,
): TeeFixture {
  return { club, fwHit, shotDistance, par };
}

/* -------------------------------------------------------------------------- */

describe('generateTeeStrategyInsights', () => {
  beforeEach(() => {
    upsertInsightMock.mockClear();
    attachDrillsMock.mockClear();
    createAdminClientMock.mockReset();
  });

  it('skips when driver attempts are below the minimum', async () => {
    const fixtures: TeeFixture[] = [];
    // 14 driver, plenty of non-driver
    for (let i = 0; i < 14; i++) fixtures.push(tee('driver', i % 2 === 0, 270));
    for (let i = 0; i < 12; i++) fixtures.push(tee('non_driver', true, 235));
    createAdminClientMock.mockReturnValue(makeClient(fixtures));

    await generateTeeStrategyInsights('player-1');

    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('skips when non-driver attempts are below the minimum', async () => {
    const fixtures: TeeFixture[] = [];
    for (let i = 0; i < 20; i++) fixtures.push(tee('driver', true, 280));
    for (let i = 0; i < 7; i++) fixtures.push(tee('non_driver', true, 240));
    createAdminClientMock.mockReturnValue(makeClient(fixtures));

    await generateTeeStrategyInsights('player-1');

    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('excludes par-3 tee shots from the comparison', async () => {
    // 20 driver tees on par-3s (ignored), 9 non-driver par-4s.
    const fixtures: TeeFixture[] = [];
    for (let i = 0; i < 20; i++) fixtures.push(tee('driver', true, 190, 3));
    for (let i = 0; i < 9; i++) fixtures.push(tee('non_driver', true, 235, 4));
    createAdminClientMock.mockReturnValue(makeClient(fixtures));

    await generateTeeStrategyInsights('player-1');

    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('emits the "layback" insight when driver is much less accurate for only marginal distance', async () => {
    // 20 drivers at 40% FW, 270yd avg. 10 non-drivers at 80% FW, 240yd avg.
    const fixtures: TeeFixture[] = [];
    for (let i = 0; i < 20; i++) fixtures.push(tee('driver', i < 8, 270)); // 8/20 = 40%
    for (let i = 0; i < 10; i++) fixtures.push(tee('non_driver', i < 8, 240)); // 8/10 = 80%
    createAdminClientMock.mockReturnValue(makeClient(fixtures));

    await generateTeeStrategyInsights('player-1');

    expect(upsertInsightMock).toHaveBeenCalledTimes(1);
    const [arg] = insightCalls<{
      signature: string;
      category: string;
      drill_tags: string[];
      title: string;
      evidence: { detail?: { mode: string } };
    }>();
    expect(arg?.signature).toBe('player-1:tee_strategy:driver_vs_layback');
    expect(arg?.category).toBe('course_management');
    expect(arg?.drill_tags).toEqual([
      'course_management',
      'tee_strategy',
      'risk_reward',
    ]);
    expect(arg?.evidence.detail?.mode).toBe('layback');
    expect(arg?.title.toLowerCase()).toContain('layback');
  });

  it('emits the "sharp driver" insight when driver accuracy stays within 5pp of non-driver', async () => {
    // 20 drivers at 70% FW, 280yd avg. 10 non-drivers at 70% FW, 235yd avg.
    const fixtures: TeeFixture[] = [];
    for (let i = 0; i < 20; i++) fixtures.push(tee('driver', i < 14, 280));
    for (let i = 0; i < 10; i++) fixtures.push(tee('non_driver', i < 7, 235));
    createAdminClientMock.mockReturnValue(makeClient(fixtures));

    await generateTeeStrategyInsights('player-1');

    const [arg] = insightCalls<{
      signature: string;
      title: string;
      evidence: { detail?: { mode: string } };
    }>();
    expect(arg?.signature).toBe('player-1:tee_strategy:driver_vs_layback');
    expect(arg?.evidence.detail?.mode).toBe('sharp');
    expect(arg?.title.toLowerCase()).toContain('driver');
  });

  it('does not emit when driver is worse but also much longer than non-driver', async () => {
    // 20 drivers at 45% FW, 300yd avg. 10 non-drivers at 75% FW, 230yd avg.
    // Distance gap 70yd >> 35yd threshold, so "layback" signal doesn't fire.
    // Accuracy gap 30pp, so "sharp" doesn't fire either.
    const fixtures: TeeFixture[] = [];
    for (let i = 0; i < 20; i++) fixtures.push(tee('driver', i < 9, 300));
    for (let i = 0; i < 10; i++) fixtures.push(tee('non_driver', i < 7, 230));
    createAdminClientMock.mockReturnValue(makeClient(fixtures));

    await generateTeeStrategyInsights('player-1');

    expect(upsertInsightMock).not.toHaveBeenCalled();
  });

  it('includes both groups stats in evidence.detail for UI rendering', async () => {
    const fixtures: TeeFixture[] = [];
    for (let i = 0; i < 20; i++) fixtures.push(tee('driver', i < 8, 270));
    for (let i = 0; i < 10; i++) fixtures.push(tee('non_driver', i < 8, 240));
    createAdminClientMock.mockReturnValue(makeClient(fixtures));

    await generateTeeStrategyInsights('player-1');

    const [arg] = insightCalls<{
      evidence: {
        detail?: {
          driver?: { attempts: number };
          non_driver?: { attempts: number };
        };
      };
    }>();
    expect(arg?.evidence.detail?.driver?.attempts).toBe(20);
    expect(arg?.evidence.detail?.non_driver?.attempts).toBe(10);
  });

  it('upserts with the same signature on repeat runs', async () => {
    const fixtures: TeeFixture[] = [];
    for (let i = 0; i < 20; i++) fixtures.push(tee('driver', i < 8, 270));
    for (let i = 0; i < 10; i++) fixtures.push(tee('non_driver', i < 8, 240));
    createAdminClientMock.mockReturnValue(makeClient(fixtures));
    await generateTeeStrategyInsights('player-1');

    createAdminClientMock.mockReturnValue(makeClient(fixtures));
    await generateTeeStrategyInsights('player-1');

    const signatures = insightCalls<{ signature: string }>().map(
      (a) => a.signature,
    );
    expect(signatures).toEqual([
      'player-1:tee_strategy:driver_vs_layback',
      'player-1:tee_strategy:driver_vs_layback',
    ]);
  });
});
