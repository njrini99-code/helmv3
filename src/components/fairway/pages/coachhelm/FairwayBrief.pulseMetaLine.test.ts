/**
 * Regression test for audit W3 (freshness honesty): the PulseStrip meta
 * caption composes the player-count clause with two OPTIONAL clauses —
 * "N need attention" and "updated <date>" — and the freshness clause must be
 * OMITTED entirely (not rendered as a misleading stamp) whenever
 * `getTeamCategoryInsights` couldn't honestly determine a `lastAnalyzed`
 * date (no completed round in the trend window → `lastAnalyzed` is '').
 *
 * This composition previously lived inline in the PulseStrip JSX and was
 * silently dropped once already during cross-PR merge-conflict resolution
 * (#925/#929, restored in commit 09f13c0b) — regressing, in the interim, to
 * a build that rendered a fabricated clock time (e.g. "Jun 8, 8:00 PM")
 * instead of the honest date-only stamp fixed by #920/#925. Pulling the
 * composition into `pulseMetaLine` gives that "omit rather than mislead"
 * contract a direct test at the exact layer that broke, on top of the
 * existing `formatAnalyzed` unit tests that pin the date-only formatting
 * itself (see FairwayBrief.formatAnalyzed.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { pulseMetaLine, formatAnalyzed } from './FairwayBrief';

describe('FairwayBrief pulseMetaLine (audit W3 — freshness honesty)', () => {
  it('omits the freshness clause entirely when lastAnalyzed is empty', () => {
    expect(pulseMetaLine(12, 0, '')).toBe('12 active players');
    // Never a dangling separator or a fabricated "updated" claim.
    expect(pulseMetaLine(12, 0, '')).not.toMatch(/updated/i);
  });

  it('appends the freshness clause only when a real date is honestly known', () => {
    expect(pulseMetaLine(12, 0, 'Jun 8')).toBe('12 active players · updated Jun 8');
  });

  it('composes all three clauses in order when all are present', () => {
    expect(pulseMetaLine(12, 3, 'Jun 8')).toBe(
      '12 active players · 3 need attention · updated Jun 8',
    );
  });

  it('uses singular "player" for a roster of exactly one', () => {
    expect(pulseMetaLine(1, 0, '')).toBe('1 active player');
  });

  it('never renders a clock time — the exact defect this audit reported', () => {
    // End-to-end through the real formatter: a date-only round_date must
    // compose into "updated Jun 8", never "updated Jun 8, 8:00 PM".
    const line = pulseMetaLine(12, 0, formatAnalyzed('2026-06-08'));
    expect(line).toBe('12 active players · updated Jun 8');
    expect(line).not.toMatch(/\d{1,2}:\d{2}/);
    expect(line).not.toMatch(/AM|PM/i);
  });
});
