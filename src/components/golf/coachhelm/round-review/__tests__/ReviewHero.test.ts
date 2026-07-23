/**
 * ReviewHero — pure-function tests.
 *
 * Scope: `formatHoleSgNarrative`, the per-hole "expected vs actual" line
 * (Wave D, 2026-07-23). `ReviewHero` itself is a full client component
 * (router/searchParams/dynamic-imported framer-motion children) — this
 * suite exercises the pure narrative formatter directly rather than
 * rendering the component tree, mirroring `buildReviewViewModel.test.ts`'s
 * pure-adapter testing style for the rest of this surface.
 */
import { describe, it, expect } from 'vitest';
import { formatHoleSgNarrative } from '../ReviewHero';
import type { HoleStrokesGainedByCategory } from '../shot-strokes-gained';

function sg(overrides: Partial<HoleStrokesGainedByCategory> = {}): HoleStrokesGainedByCategory {
  return {
    total: null,
    computedShots: 0,
    totalShots: 0,
    tee: null,
    approach: null,
    around_green: null,
    putting: null,
    ...overrides,
  };
}

describe('formatHoleSgNarrative', () => {
  it('is null-safe: returns null when sg itself is null (nothing computable on this hole)', () => {
    expect(formatHoleSgNarrative(null)).toBeNull();
  });

  it('is null-safe: returns null when sg.total is null (zero shots scored)', () => {
    expect(formatHoleSgNarrative(sg({ total: null }))).toBeNull();
  });

  it('matches the spec\'s worked example: "Lost 2.1 strokes here — 1.1 off the tee, 1.0 putting"', () => {
    const result = formatHoleSgNarrative(
      sg({ total: -2.1, tee: -1.1, putting: -1.0, approach: 0, around_green: null }),
    );
    expect(result).not.toBeNull();
    expect(result!.tone).toBe('loss');
    expect(result!.text).toBe('Lost 2.1 strokes here — 1.1 off the tee, 1.0 putting.');
  });

  it('matches the spec\'s short-form example: "Gained 0.4" when only ONE category contributed (no redundant breakdown)', () => {
    // A single clean 1-putt hole — only `putting` crossed the near-zero
    // threshold, so the breakdown clause (which would just repeat the
    // total) is skipped.
    const result = formatHoleSgNarrative(sg({ total: 0.4, putting: 0.4 }));
    expect(result).not.toBeNull();
    expect(result!.tone).toBe('gain');
    expect(result!.text).toBe('Gained 0.4 strokes here.');
  });

  it('reads "Even strokes gained here." for a near-zero total (never a misleading "Lost 0.0"/"Gained 0.0")', () => {
    const result = formatHoleSgNarrative(sg({ total: 0.02, tee: 0.02 }));
    expect(result).not.toBeNull();
    expect(result!.tone).toBe('even');
    expect(result!.text).toBe('Even strokes gained here.');
  });

  it('names the top TWO contributing categories, largest magnitude first, when three or more contributed', () => {
    const result = formatHoleSgNarrative(
      sg({ total: -1.5, tee: -0.9, approach: -0.5, around_green: -0.1, putting: 0 }),
    );
    expect(result!.text).toBe('Lost 1.5 strokes here — 0.9 off the tee, 0.5 approach.');
  });

  it('ignores near-zero (|value| < 0.05) categories entirely when choosing the breakdown', () => {
    const result = formatHoleSgNarrative(sg({ total: -1.0, tee: -0.97, approach: -0.03, putting: 0 }));
    // approach's -0.03 is below the near-zero threshold — only tee crossed
    // it, so this collapses to the short (no-breakdown) form, not a
    // breakdown naming a near-invisible contributor.
    expect(result!.text).toBe('Lost 1.0 strokes here.');
  });

  it('reproduces the real prod hole-6 shape (par 5, penalty + 3-putt): tee -1.9, approach +0.8, putting +0.5, total -0.6', () => {
    const result = formatHoleSgNarrative(
      sg({ total: -0.6, tee: -1.9, approach: 0.8, around_green: null, putting: 0.5 }),
    );
    expect(result).not.toBeNull();
    expect(result!.tone).toBe('loss');
    // Ranked by |value|: tee (1.9) > approach (0.8) > putting (0.5) — only
    // the top two make the breakdown clause.
    expect(result!.text).toBe('Lost 0.6 strokes here — 1.9 off the tee, 0.8 approach.');
  });
});
