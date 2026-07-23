import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression guard for the live prod "CoachHelm tab not working" P0.
//
// ShotPatternMiner.analyzeShotPatterns() used to call this.savePatterns()
// UNCONDITIONALLY — a write-on-read that upserted into `golf_patterns_v2` as
// a side effect of the player CoachHelm dashboard's page load, racing the
// coachhelm-safety-net / coachhelm-validation / coachhelm-calibration /
// coachhelm-roster-sweep crons' own writes to the same table and surfacing
// as a live Postgres deadlock (40P01) that failed the whole page.
//
// The fix threads a `persistPatterns` option (default `true`, so the crons
// and the post-round trigger keep persisting exactly as before) down from
// `analyzePlayer` → `analyzeShotPatterns`. The dashboard read path
// (getPlayerCoachHelmDashboardImpl) is the one caller that passes `false`.
// These tests lock in that contract at the miner level.
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    throw new Error('createAdminClient should not be reached — loadShots/savePatterns are mocked in this suite');
  }),
}));

const { ShotPatternMiner } = await import('@/lib/coachhelm/v2/mining/shot-pattern-miner');

interface MinerInternals {
  loadShots: () => Promise<void>;
  savePatterns: (patterns: unknown[]) => Promise<void>;
  shots: unknown[];
}

/** Enough fake shots to clear the MIN_SAMPLE_SIZE * 3 early-return gate. */
function fakeShots(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `shot-${i}`,
    round_id: 'round-1',
    hole_number: 1,
    shot_number: i,
    shot_type: 'approach',
    club_type: '7i',
    lie_before: 'fairway',
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 10,
    distance_unit_after: 'yards',
    miss_direction: 'right',
    shot_distance: 140,
    result: 'green',
  }));
}

describe('ShotPatternMiner.analyzeShotPatterns persistPatterns gating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('persists by default (no options) — preserves existing cron / post-round-trigger behavior', async () => {
    const miner = new ShotPatternMiner('player-1');
    const internals = miner as unknown as MinerInternals;
    vi.spyOn(internals, 'loadShots').mockImplementation(async () => {
      internals.shots = fakeShots(15);
    });
    const saveSpy = vi.spyOn(internals, 'savePatterns').mockResolvedValue(undefined);

    await miner.analyzeShotPatterns();

    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('persists when persistPatterns: true is passed explicitly', async () => {
    const miner = new ShotPatternMiner('player-1');
    const internals = miner as unknown as MinerInternals;
    vi.spyOn(internals, 'loadShots').mockImplementation(async () => {
      internals.shots = fakeShots(15);
    });
    const saveSpy = vi.spyOn(internals, 'savePatterns').mockResolvedValue(undefined);

    await miner.analyzeShotPatterns({ persistPatterns: true });

    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT persist when persistPatterns: false — the dashboard read path', async () => {
    const miner = new ShotPatternMiner('player-1');
    const internals = miner as unknown as MinerInternals;
    vi.spyOn(internals, 'loadShots').mockImplementation(async () => {
      internals.shots = fakeShots(15);
    });
    const saveSpy = vi.spyOn(internals, 'savePatterns').mockResolvedValue(undefined);

    const result = await miner.analyzeShotPatterns({ persistPatterns: false });

    expect(saveSpy).not.toHaveBeenCalled();
    // Analysis itself is still returned — only the write is skipped.
    expect(result).not.toBeNull();
  });

  it('never reaches savePatterns (or loadShots\' underlying DB call) when there is not enough shot data, regardless of persistPatterns', async () => {
    const miner = new ShotPatternMiner('player-1');
    const internals = miner as unknown as MinerInternals;
    vi.spyOn(internals, 'loadShots').mockImplementation(async () => {
      internals.shots = fakeShots(3); // below MIN_SAMPLE_SIZE * 3 (15)
    });
    const saveSpy = vi.spyOn(internals, 'savePatterns').mockResolvedValue(undefined);

    const result = await miner.analyzeShotPatterns({ persistPatterns: true });

    expect(result).toBeNull();
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
