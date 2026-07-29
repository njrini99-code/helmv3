// =============================================================================
// The public landing page's copy, under the recruiting sunset.
//
// /baseball is the front door. Everything below is about one failure mode: a
// prospect arriving for something the page promised and not finding it. That
// reads as "the product is broken", not "that module is off" — which is worse
// than never having mentioned it.
//
// These assertions are deliberately about ABSENCE OF A PROMISE rather than
// exact strings, so the copy can be rewritten without the tests becoming a
// transcription exercise that everyone updates without reading.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

const moduleFlags = vi.hoisted(() => ({ recruitingEnabled: false }));

vi.mock('@/lib/baseball/product-modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/product-modules')>();
  return { ...actual, isRecruitingEnabled: () => moduleFlags.recruitingEnabled };
});

import { resolveBaseballLandingCopy } from '../landing-copy';

/** Everything a reader would take as a promise of the recruiting module. */
const RECRUITING_PROMISES = /recruit|prospect|pipeline|watchlist|committed|offer extended|20-80/i;

describe('resolveBaseballLandingCopy — recruiting sunset', () => {
  it('promises no recruiting anywhere in the prose', () => {
    moduleFlags.recruitingEnabled = false;
    const copy = resolveBaseballLandingCopy();

    for (const [field, value] of Object.entries(copy)) {
      if (typeof value !== 'string') continue;
      expect(
        value,
        `${field} still promises recruiting: ${JSON.stringify(value)}`,
      ).not.toMatch(RECRUITING_PROMISES);
    }
  });

  it('drops the pipeline section and stands something real in its place', () => {
    // Not merely removed. Three sections where there were four reads as a page
    // with something cut out of it, and the replacement has to be a claim
    // about code that actually ships.
    moduleFlags.recruitingEnabled = false;
    const copy = resolveBaseballLandingCopy();

    expect(copy.showPipelineSection).toBe(false);
    expect(copy.showPracticeSection).toBe(true);
  });

  it('never shows both feature sections at once', () => {
    for (const enabled of [true, false]) {
      moduleFlags.recruitingEnabled = enabled;
      const copy = resolveBaseballLandingCopy();
      expect(copy.showPipelineSection).not.toBe(copy.showPracticeSection);
    }
  });

  it('still says what the product IS — the fix is not deletion', () => {
    // A page stripped of claims sells nothing. Guards against a future edit
    // that satisfies the first test by emptying the strings.
    moduleFlags.recruitingEnabled = false;
    const copy = resolveBaseballLandingCopy();

    expect(copy.metaTitle.length).toBeGreaterThan(20);
    expect(copy.heroHeading.length).toBeGreaterThan(20);
    expect(copy.heroDescription.length).toBeGreaterThan(80);
    expect(copy.rosterBody.length).toBeGreaterThan(80);
    expect(copy.passportBody.length).toBeGreaterThan(80);
  });
});

describe('resolveBaseballLandingCopy — restoration path', () => {
  it('returns the original recruiting pitch verbatim when the module comes back', () => {
    moduleFlags.recruitingEnabled = true;
    const copy = resolveBaseballLandingCopy();

    expect(copy.metaTitle).toBe(
      'BaseballHelm — Recruiting & Team Management for College Baseball',
    );
    expect(copy.heroHeading).toBe('Recruiting and team operations for college baseball.');
    expect(copy.heroDescription).toMatch(/prospect pipeline/);
    expect(copy.rosterBody).toMatch(/recruiting file/);
    expect(copy.showPipelineSection).toBe(true);
  });
});
