import { describe, it, expect } from 'vitest';
import { generateReviewContent } from '../round-review-content';
import type { HoleBreakdown } from '../round-review-system';

/**
 * Regression coverage for #150 — one of the six AI round-review
 * recommendations used a colon-prefixed internal-sounding label
 * ("Lag putting drill: hit 10 putts from 30ft...") that broke the natural
 * coach voice every sibling recommendation reads in ("On the range, aim...",
 * "Practice approach shots from...", "Review your pre-shot routine...").
 *
 * `generateReviewContent` is exported (test-only surface) so this asserts
 * directly against the pushed strings without standing up the full
 * Supabase-backed `generateAndStoreRoundReview` action.
 */

function makeHole(overrides: Partial<HoleBreakdown> = {}): HoleBreakdown {
  return {
    hole: 1,
    par: 4,
    score: 4,
    scoreToPar: 0,
    putts: 2,
    fairwayHit: true,
    gir: true,
    threePutt: false,
    onePutt: false,
    penalties: 0,
    scrambleAttempt: false,
    scrambleSuccess: false,
    sandSaveAttempt: false,
    sandSaveSuccess: false,
    driveClub: null,
    driveDist: null,
    driveMiss: null,
    firstPuttFeet: null,
    approachClub: null,
    approachDist: null,
    approachMiss: null,
    ...overrides,
  };
}

const BASE_ROUND = {
  id: 'round-1',
  player_id: 'player-1',
  course_name: 'Test GC',
  round_date: '2026-01-01',
  total_score: 78,
  score_to_par: 6,
  total_putts: 34,
  total_fairways_hit: 8,
  total_fairways: 14,
  total_gir: 8,
  total_gir_possible: 18,
  holes_played: 18,
  status: 'completed',
};

/** A natural coach sentence never opens with a short "Label:" prefix. */
const COLON_LABEL_PREFIX = /^[A-Z][A-Za-z0-9 ]{2,40}:\s/;

describe('generateReviewContent recommendations — natural coach voice (#150)', () => {
  it('the three-putt recommendation reads as a spoken instruction, not a labeled drill card', () => {
    const holes: HoleBreakdown[] = Array.from({ length: 18 }, (_, i) =>
      makeHole({
        hole: i + 1,
        threePutt: i < 2,
        putts: i < 2 ? 3 : 2,
        firstPuttFeet: i < 2 ? 30 : null,
      }),
    );
    const content = generateReviewContent(BASE_ROUND, holes, null);

    expect(content.recommendations.length).toBeGreaterThan(0);
    expect(content.recommendations).toContain(
      'On the practice green, hit 10 lag putts from 30 feet and get each one to stop within 3 feet of the hole',
    );
    for (const rec of content.recommendations) {
      expect(rec).not.toMatch(COLON_LABEL_PREFIX);
    }
  });

  it('never emits a colon-prefixed internal-sounding label across every recommendation branch', () => {
    // Trip every recommendation-pushing branch at once (three-putts, a
    // dominant left tee miss, short approach misses, low GIR) so all six+
    // recommendation strings the engine can produce are checked together.
    const holes: HoleBreakdown[] = Array.from({ length: 18 }, (_, i) =>
      makeHole({
        hole: i + 1,
        threePutt: i < 2,
        putts: i < 2 ? 3 : 2,
        firstPuttFeet: i < 2 ? 30 : null,
        fairwayHit: i < 3 ? false : true,
        driveMiss: i < 3 ? 'left' : null,
        gir: i < 8 ? false : true,
        approachMiss: i < 4 ? 'short' : null,
      }),
    );
    const content = generateReviewContent(
      { ...BASE_ROUND, total_gir: 10, total_gir_possible: 18 },
      holes,
      null,
    );

    expect(content.recommendations.length).toBeGreaterThan(0);
    for (const rec of content.recommendations) {
      expect(rec).not.toMatch(COLON_LABEL_PREFIX);
    }
  });
});
