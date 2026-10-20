/**
 * The player Stats page rounds a headline percentage ONCE, at display.
 *
 * `safePercent` stores rates at 1 dp (59/96 = 61.458… → 61.5) and the bento,
 * ledger and drills print whole percents, so the page used to round twice:
 * 61.458 → 61.5 → "62%". The true figure rounds to 61%. `withExactHeadlineRates`
 * rebuilds the four rates that ship their counts from those counts, so the
 * display's own rounding is the only one.
 */
import { describe, expect, it } from 'vitest';
import { calculateStatsFromShots, type GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { buildApproachRows, buildDrivingRows, buildShortGameRows } from '../StatsBento';
import { buildLedger, withExactHeadlineRates } from '../buildStatsViewModel';

function stats(overrides: Partial<GolfStats>): GolfStats {
  return { ...calculateStatsFromShots([], [], []), ...overrides };
}

// 59 of 96 is 61.458…%: stored as 61.5, which Math.round lifts to 62.
const SIXTY_ONE = { made: 59, attempts: 96, stored: 61.5 };

describe('withExactHeadlineRates — one rounding, at display', () => {
  const s = stats({
    roundsPlayed: 6,
    fairwaysHit: SIXTY_ONE.made,
    fairwayOpportunities: SIXTY_ONE.attempts,
    fairwayPercentage: SIXTY_ONE.stored,
    girTotal: SIXTY_ONE.made,
    girOpportunities: SIXTY_ONE.attempts,
    girPercentage: SIXTY_ONE.stored,
    scramblesMade: SIXTY_ONE.made,
    scrambleAttempts: SIXTY_ONE.attempts,
    scramblingPercentage: SIXTY_ONE.stored,
    sandSavesMade: SIXTY_ONE.made,
    sandSaveAttempts: SIXTY_ONE.attempts,
    sandSavePercentage: SIXTY_ONE.stored,
  });

  it('illustrates the input: the stored 1 dp rate alone prints 62%', () => {
    expect(buildDrivingRows(s)[0]!.value).toBe('62%');
  });

  it('prints 61% on every headline rate that carries its counts', () => {
    const exact = withExactHeadlineRates(s)!;
    expect(buildDrivingRows(exact)[0]!.value).toBe('61%');
    expect(buildApproachRows(exact, new Map())[0]!.value).toBe('61%');
    const short = buildShortGameRows(exact);
    expect(short[0]!.value).toBe('61%');
    expect(short[1]!.value).toBe('61%');
    const ledger = buildLedger({
      roundsPlayed: exact.roundsPlayed,
      fairwayPct: exact.fairwayPercentage,
      girPct: exact.girPercentage,
      puttsPerRound: null,
    });
    expect(ledger.find((r) => r.label === 'Fairways')?.value).toBe('61%');
    expect(ledger.find((r) => r.label === 'Greens')?.value).toBe('61%');
  });

  it('keeps a rate with no attempts as no data, never 0%', () => {
    const empty = withExactHeadlineRates(stats({ fairwayPercentage: null, fairwaysHit: 0, fairwayOpportunities: 0 }))!;
    expect(empty.fairwayPercentage).toBeNull();
    expect(buildDrivingRows(empty)[0]!.value).toBe('—');
  });

  it('keeps the stored rate when the counts do not describe it', () => {
    // A rate that is not made/attempts (rounded) came from somewhere else; leave it alone.
    const odd = withExactHeadlineRates(stats({ fairwayPercentage: 40, fairwaysHit: 59, fairwayOpportunities: 96 }))!;
    expect(odd.fairwayPercentage).toBe(40);
  });

  it('passes null through', () => {
    expect(withExactHeadlineRates(null)).toBeNull();
  });
});
