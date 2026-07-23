// @vitest-environment jsdom
/**
 * ============================================================================
 * StandingTrack — label-row positioning regression suite
 * ----------------------------------------------------------------------------
 * Covers the "where this sits" bug: the label row used to render with
 * `flex justify-between`, which evenly spread the You/Team/Tour text across
 * the row width with ZERO relation to the real percentages driving the pin
 * and benchmark ticks above it. `layoutTrackLabels` is the pure fix (unit
 * tested directly, no DOM); the render tests below pin that the component
 * actually renders labels at (approximately, post-clamp/nudge) their real
 * marker position instead of evenly-distributed flex slots.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  StandingTrack,
  layoutTrackLabels,
  STANDING_TRACK_SUBJECT_KEY,
  STANDING_TRACK_MIN_GAP_PCT,
  STANDING_TRACK_EDGE_MARGIN_PCT,
} from '../StandingTrack';

describe('layoutTrackLabels (pure)', () => {
  it('places well-separated labels at their own real percentage, unchanged', () => {
    const result = layoutTrackLabels([
      { key: 'You', pct: 75 },
      { key: 'Team', pct: 55 },
      { key: 'Tour', pct: 20 },
    ]);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.pct]));
    expect(byKey.You).toBeCloseTo(75, 5);
    expect(byKey.Team).toBeCloseTo(55, 5);
    expect(byKey.Tour).toBeCloseTo(20, 5);
  });

  it('never reproduces the old bug: three real, well-separated values render at their own positions, not evenly-spread across the row', () => {
    // A common real case from the recon: SG pin at 75%, Team benchmark at
    // 45%, Tour fixed at 10% — under the old `justify-between` row these
    // rendered flush-left / center / flush-right (0/50/100-ish) regardless
    // of these actual values. None of these three are within the minimum
    // gap of each other, so the fix (unlike the old row) leaves all three
    // exactly at their real percentage.
    const result = layoutTrackLabels([
      { key: 'You', pct: 75 },
      { key: 'Team', pct: 45 },
      { key: 'Tour', pct: 10 },
    ]);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.pct]));
    expect(byKey.You).toBeCloseTo(75, 5);
    expect(byKey.Team).toBeCloseTo(45, 5);
    expect(byKey.Tour).toBeCloseTo(10, 5);
  });

  it('a nudge can cascade: pushing one label clear of its neighbor can, in turn, push a third that was originally far enough away', () => {
    // You=75, Team=55, Tour=50 — Team and Tour start only 5pt apart (well
    // inside the 16pt minimum gap) and get pushed apart first; that push can
    // carry Team close enough to You to need a second push. This is the
    // correct, intentional behavior of a left→right minimum-gap sweep (never
    // silently leave a newly-introduced collision unresolved) — NOT the old
    // bug (which ignored real values entirely). The invariant that survives
    // is boundedness + order + a same-direction shift, not "untouched".
    const result = layoutTrackLabels([
      { key: 'You', pct: 75 },
      { key: 'Team', pct: 55 },
      { key: 'Tour', pct: 50 },
    ]);
    const sorted = [...result].sort((a, b) => a.pct - b.pct);
    expect(sorted.map((r) => r.key)).toEqual(['Tour', 'Team', 'You']);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.pct - sorted[i - 1]!.pct).toBeGreaterThanOrEqual(STANDING_TRACK_MIN_GAP_PCT - 1e-6);
    }
    // You only ever moves to clear a real collision, and only to the RIGHT
    // (never past its own true value in the wrong direction).
    const you = result.find((r) => r.key === 'You')!;
    expect(you.pct).toBeGreaterThanOrEqual(75);
  });

  it('nudges apart two labels whose real percentages land within the minimum gap', () => {
    const result = layoutTrackLabels([
      { key: 'Team', pct: 50 },
      { key: 'Tour', pct: 52 },
    ]);
    const team = result.find((r) => r.key === 'Team')!;
    const tour = result.find((r) => r.key === 'Tour')!;
    expect(Math.abs(tour.pct - team.pct)).toBeGreaterThanOrEqual(STANDING_TRACK_MIN_GAP_PCT - 1e-6);
    // Relative order is preserved (Team was left of Tour going in).
    expect(team.pct).toBeLessThanOrEqual(tour.pct);
  });

  it('nudges apart three labels stacked on (near) the exact same value', () => {
    const result = layoutTrackLabels([
      { key: 'You', pct: 50 },
      { key: 'Team', pct: 50 },
      { key: 'Tour', pct: 50 },
    ]);
    const sorted = [...result].sort((a, b) => a.pct - b.pct);
    expect(sorted[1]!.pct - sorted[0]!.pct).toBeGreaterThanOrEqual(STANDING_TRACK_MIN_GAP_PCT - 1e-6);
    expect(sorted[2]!.pct - sorted[1]!.pct).toBeGreaterThanOrEqual(STANDING_TRACK_MIN_GAP_PCT - 1e-6);
  });

  it('never returns a position outside the edge-clamped safe zone, even for extreme inputs', () => {
    const result = layoutTrackLabels([
      { key: 'You', pct: 0 },
      { key: 'Team', pct: 3 },
      { key: 'Tour', pct: 100 },
    ]);
    for (const r of result) {
      expect(r.pct).toBeGreaterThanOrEqual(STANDING_TRACK_EDGE_MARGIN_PCT - 1e-6);
      expect(r.pct).toBeLessThanOrEqual(100 - STANDING_TRACK_EDGE_MARGIN_PCT + 1e-6);
    }
  });

  it('handles a moderately tight cluster (still fits after the shift-left pass) without crossing order', () => {
    const result = layoutTrackLabels(
      [
        { key: 'a', pct: 50 },
        { key: 'b', pct: 51 },
        { key: 'c', pct: 52 },
        { key: 'd', pct: 53 },
        { key: 'e', pct: 54 },
      ],
      16,
      6,
    );
    const sorted = [...result].sort((a, b) => a.pct - b.pct);
    expect(sorted.map((r) => r.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
    for (const r of sorted) {
      expect(r.pct).toBeGreaterThanOrEqual(6 - 1e-6);
      expect(r.pct).toBeLessThanOrEqual(94 + 1e-6);
    }
    // 5 items comfortably fit a 16pt-min-gap spread inside an 88pt safe zone
    // (4 gaps × 16 = 64 ≤ 88), so the minimum gap is fully honored here.
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.pct - sorted[i - 1]!.pct).toBeGreaterThanOrEqual(16 - 1e-6);
    }
  });

  it('a cluster genuinely wider than the safe zone still stays in bounds and preserves order, even though the minimum gap can no longer be fully honored', () => {
    // 7 items need 6 × 16 = 96pt of spread; the safe zone is only 88pt wide
    // (100 − 2×6) — physically impossible to space all 7 a full 16pt apart.
    // The guarantee that survives is boundedness + order, not the gap.
    const result = layoutTrackLabels(
      [
        { key: 'a', pct: 50 },
        { key: 'b', pct: 51 },
        { key: 'c', pct: 52 },
        { key: 'd', pct: 53 },
        { key: 'e', pct: 54 },
        { key: 'f', pct: 55 },
        { key: 'g', pct: 56 },
      ],
      16,
      6,
    );
    const sorted = [...result].sort((a, b) => a.pct - b.pct);
    expect(sorted.map((r) => r.key)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    for (const r of sorted) {
      expect(r.pct).toBeGreaterThanOrEqual(6 - 1e-6);
      expect(r.pct).toBeLessThanOrEqual(94 + 1e-6);
    }
    // Order never crosses even where the gap had to compress below minGap.
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.pct).toBeGreaterThanOrEqual(sorted[i - 1]!.pct);
    }
  });

  it('returns an empty array for no items', () => {
    expect(layoutTrackLabels([])).toEqual([]);
  });

  it('returns the single item at its edge-clamped position for one item', () => {
    const result = layoutTrackLabels([{ key: 'solo', pct: 2 }]);
    expect(result).toEqual([{ key: 'solo', pct: STANDING_TRACK_EDGE_MARGIN_PCT }]);
  });
});

describe('StandingTrack (render)', () => {
  it('renders the subject label at its own real percentage, not an evenly-spread flex position', () => {
    const { container } = render(
      <StandingTrack
        pct={75}
        subjectLabel="You"
        benchmarks={[
          { label: 'Team', pct: 55 },
          { label: 'Tour', pct: 20, emphasis: true },
        ]}
      />,
    );
    const subject = container.querySelector('[data-slot="standing-track-subject-label"]') as HTMLElement | null;
    expect(subject).not.toBeNull();
    expect(subject!.textContent).toBe('You');
    expect(subject!.style.left).toBe('75%');
  });

  it('renders each benchmark label at its own clamped percentage', () => {
    const { container } = render(
      <StandingTrack
        pct={75}
        subjectLabel="You"
        benchmarks={[
          { label: 'Team', pct: 55 },
          { label: 'Tour', pct: 20, emphasis: true },
        ]}
      />,
    );
    const labels = Array.from(
      container.querySelectorAll('[data-slot="standing-track-bench-label"]'),
    ) as HTMLElement[];
    expect(labels).toHaveLength(2);
    const team = labels.find((l) => l.textContent === 'Team');
    const tour = labels.find((l) => l.textContent === 'Tour');
    expect(team?.style.left).toBe('55%');
    expect(tour?.style.left).toBe('20%');
  });

  it('never renders the label row with the old evenly-distributed flex layout', () => {
    const { container } = render(
      <StandingTrack
        pct={75}
        subjectLabel="You"
        benchmarks={[{ label: 'Team', pct: 55 }, { label: 'Tour', pct: 20 }]}
      />,
    );
    const row = container.querySelector('[data-slot="standing-track-labels"]');
    expect(row).not.toBeNull();
    expect(row!.className).not.toMatch(/justify-between/);
    // Every label is absolutely positioned within that row (the structural
    // fix), not laid out as flex siblings.
    const labels = row!.querySelectorAll('span[style]');
    expect(labels.length).toBeGreaterThan(0);
    for (const label of Array.from(labels)) {
      expect(label.className).toMatch(/absolute/);
    }
  });

  it('nudges apart a Team/Tour benchmark pair that lands within the minimum gap', () => {
    const { container } = render(
      <StandingTrack
        pct={5}
        subjectLabel="You"
        benchmarks={[{ label: 'Team', pct: 50 }, { label: 'Tour', pct: 51 }]}
      />,
    );
    const labels = Array.from(
      container.querySelectorAll('[data-slot="standing-track-bench-label"]'),
    ) as HTMLElement[];
    const team = labels.find((l) => l.textContent === 'Team')!;
    const tour = labels.find((l) => l.textContent === 'Tour')!;
    const teamPct = parseFloat(team.style.left);
    const tourPct = parseFloat(tour.style.left);
    expect(Math.abs(tourPct - teamPct)).toBeGreaterThanOrEqual(STANDING_TRACK_MIN_GAP_PCT - 1e-6);
  });

  it('still positions the pin and benchmark ticks at their true, un-nudged percentages', () => {
    const { container } = render(
      <StandingTrack
        pct={75}
        subjectLabel="You"
        benchmarks={[{ label: 'Team', pct: 55 }, { label: 'Tour', pct: 50, emphasis: true }]}
      />,
    );
    const pin = container.querySelector('[data-slot="standing-track-pin"]') as HTMLElement;
    expect(pin.style.left).toBe('75%');
    const ticks = Array.from(container.querySelectorAll('[data-slot="standing-track-bench"]')) as HTMLElement[];
    const leftValues = ticks.map((t) => t.style.left).sort();
    expect(leftValues).toEqual(['50%', '55%']);
  });

  it('subject "You" uses the sentinel key internally, never colliding with a real benchmark label', () => {
    expect(STANDING_TRACK_SUBJECT_KEY).not.toBe('You');
    expect(STANDING_TRACK_SUBJECT_KEY).not.toBe('Team');
    expect(STANDING_TRACK_SUBJECT_KEY).not.toBe('Tour');
  });
});
