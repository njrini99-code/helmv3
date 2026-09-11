/**
 * The stored narrative must not state a measurement the round never carried.
 *
 * A scorecard-only round has a total score and no `golf_holes` rows. Every
 * clause in the summary is guarded on its own count being non-zero except the
 * par clause, which printed unconditionally — so those rounds got "0 pars,"
 * a hole-by-hole fact derived from no holes at all. The view model was fixed
 * for the rendered page (`buildReviewViewModel`); this pins the same rule at
 * the source that writes the narrative.
 */
import { describe, it, expect } from 'vitest';
import { generateReviewContent } from '../round-review-content';
import type { RoundData, HoleBreakdown } from '../round-review-content';

const round = {
  id: 'r1',
  course_name: 'Test Links',
  total_score: 88,
  score_to_par: 17,
  holes_played: 18,
  total_putts: 36,
} as unknown as RoundData;

function hole(overrides: Partial<HoleBreakdown>): HoleBreakdown {
  return {
    hole: 1,
    par: 4,
    score: 4,
    scoreToPar: 0,
    putts: 2,
    fairwayHit: true,
    greenInRegulation: true,
    ...overrides,
  } as HoleBreakdown;
}

describe('generateReviewContent summary', () => {
  it('never says "0 pars" for a round with no hole rows', () => {
    const content = generateReviewContent(round, [], null, []);
    expect(content.summary).not.toMatch(/\b0 pars\b/);
    // and it must not leave a dangling separator where the clause would be
    expect(content.summary).not.toMatch(/\.\s+\.\s/);
  });

  it('still reports zero pars for a round we actually measured hole by hole', () => {
    // Eighteen bogeys: "0 pars" here is a true statement about a real round.
    const holes = Array.from({ length: 18 }, (_, i) => hole({ hole: i + 1, score: 5, scoreToPar: 1 }));
    const content = generateReviewContent(round, holes, null, []);
    expect(content.summary).toMatch(/\b0 pars\b/);
  });

  it('counts pars normally when some exist', () => {
    const holes = [
      ...Array.from({ length: 4 }, (_, i) => hole({ hole: i + 1 })),
      ...Array.from({ length: 14 }, (_, i) => hole({ hole: i + 5, score: 5, scoreToPar: 1 })),
    ];
    const content = generateReviewContent(round, holes, null, []);
    expect(content.summary).toMatch(/\b4 pars\b/);
  });
});
