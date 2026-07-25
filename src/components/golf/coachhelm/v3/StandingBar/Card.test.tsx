// @vitest-environment jsdom
/**
 * Card.tsx — regression coverage for the founder's round-review "standing"
 * bug report (same class of bug fixed in StandingStrip.tsx, see that file's
 * test suite for the DOM-position variant of these same pins):
 *
 *   1. FIXED DOMAIN CLIPS REAL VALUES — `props.scale` (metric-config's fixed
 *      per-metric range, e.g. sg_approach: -1.5..1.5) is a typical range,
 *      not a hard bound. An outlier round's team_avg/player_value beyond it
 *      used to clamp `toScalePct` to the literal 0%/100% edge — a marker
 *      pinned there gets half-cut by the card's `overflow-clip` ("half-
 *      clipped circle"), and silently draws a -2.43 in the exact same spot
 *      as a -1.50 (the "T" marker effectively vanishing into the edge).
 *   2. MARKER COLLISIONS — near-equal T/●/P values render as overlapping,
 *      unreadable letter-glyph circles.
 *   3. WRONG VERDICT ON EQUALITY — two chips that DISPLAY the same rounded
 *      number (e.g. both "65%") must never verdict as one being above/below
 *      the other.
 *
 * `Marker`/`Bar` render their leftPct via framer-motion `m.div` `animate`
 * props — the FINAL DOM `style.left` depends on animation-frame timing, not
 * something jsdom resolves deterministically on a synchronous render. The
 * pure functions the component's math runs through (`resolveDisplayScale`,
 * `layoutMarkerPositions`, `deltaVsTeam`, `teamRelativeText`) are the
 * reliable, fixture-testable surface for pinning the actual math; the
 * render tests below stick to PLAIN (non-animated) text nodes — scale
 * endpoints, cohort caption, marker existence — which render synchronously.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card } from './Card';
import type { StandingBarProps } from './types';
import {
  resolveDisplayScale,
  layoutMarkerPositions,
  deltaVsTeam,
  teamRelativeText,
  valuesDisplayEqual,
  MARKER_MIN_GAP_PCT,
  BAR_MARKER_MIN_GAP_PCT,
} from './utils';

// ---------------------------------------------------------------------------
// resolveDisplayScale (pure) — bug #1
// ---------------------------------------------------------------------------

describe('resolveDisplayScale (pure)', () => {
  it('no-ops when every value already fits the caller-supplied scale', () => {
    const result = resolveDisplayScale({ min: -1.5, max: 1.5 }, [0.4, 0.1, 0], { symmetric: true });
    expect(result).toEqual({ min: -1.5, max: 1.5 });
  });

  it('widens the domain to cover an out-of-range value, with padding beyond the raw extreme', () => {
    const result = resolveDisplayScale({ min: -1.5, max: 1.5 }, [-1.54, -2.43, 0]);
    // -2.43 is the new floor; padded strictly past it (never sits at the
    // literal edge once mapped through toScalePct).
    expect(result.min).toBeLessThan(-2.43);
    expect(result.max).toBeGreaterThanOrEqual(1.5);
  });

  it('founder screenshot repro: TEAM -2.43 / player -1.54 on a -1.50..1.50 SG scale widens AND re-centers on zero', () => {
    const result = resolveDisplayScale(
      { min: -1.5, max: 1.5 },
      [-1.54, -2.43, 0],
      { symmetric: true },
    );
    // Symmetric convention: |min| === |max|, and the definitional
    // field-average zero point stays exactly centered between them.
    expect(Math.abs(result.min)).toBeCloseTo(Math.abs(result.max), 5);
    expect(result.min).toBeLessThan(-2.43);
  });

  it('keeps an unrelated axis untouched when only one side is pushed and symmetric is not requested', () => {
    const result = resolveDisplayScale({ min: 30, max: 80 }, [92], {});
    expect(result.min).toBeLessThanOrEqual(30);
    expect(result.max).toBeGreaterThan(92);
  });

  it('ignores null/undefined/non-finite values in the plotted set', () => {
    const result = resolveDisplayScale({ min: 0, max: 60 }, [null, undefined, Number.NaN, 30]);
    expect(result).toEqual({ min: 0, max: 60 });
  });
});

// ---------------------------------------------------------------------------
// layoutMarkerPositions (pure) — bug #2
// ---------------------------------------------------------------------------

describe('layoutMarkerPositions (pure)', () => {
  it('leaves well-separated markers exactly where they are', () => {
    const result = layoutMarkerPositions([
      { key: 'pga', pct: 20 },
      { key: 'team', pct: 50 },
      { key: 'you', pct: 80 },
    ]);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.pct]));
    expect(byKey.pga).toBeCloseTo(20, 5);
    expect(byKey.team).toBeCloseTo(50, 5);
    expect(byKey.you).toBeCloseTo(80, 5);
  });

  it('nudges near-equal markers apart by at least the minimum gap (T 0.70 vs CB/You 0.81 on a 3-unit scale, ~3.7% apart raw)', () => {
    // toScalePct(0.70, {-1.5,1.5}) ≈ 73.33, toScalePct(0.81, {-1.5,1.5}) ≈ 77
    const result = layoutMarkerPositions([
      { key: 'team', pct: 73.33 },
      { key: 'you', pct: 77 },
    ]);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.pct]));
    expect(Math.abs(byKey.you! - byKey.team!)).toBeGreaterThanOrEqual(MARKER_MIN_GAP_PCT - 0.01);
  });

  it('resolves a three-way collision (GIR 65/65/66-style cluster) preserving left-to-right order', () => {
    const result = layoutMarkerPositions([
      { key: 'pga', pct: 66 },
      { key: 'team', pct: 65 },
      { key: 'you', pct: 65 },
    ]);
    const byKey = Object.fromEntries(result.map((r) => [r.key, r.pct]));
    expect(byKey.team!).toBeLessThanOrEqual(byKey.you!);
    expect(byKey.you!).toBeLessThanOrEqual(byKey.pga!);
    expect(byKey.you! - byKey.team!).toBeGreaterThanOrEqual(MARKER_MIN_GAP_PCT - 0.01);
    expect(byKey.pga! - byKey.you!).toBeGreaterThanOrEqual(MARKER_MIN_GAP_PCT - 0.01);
  });

  // The collision tests above only ever asserted that markers end up FAR
  // ENOUGH APART. Nothing asserted they end up in the RIGHT PLACE — which is
  // how the bar came to exaggerate a 2.5-point spread into an 18-point one and
  // still pass its suite (Nick's 07-24 round-review screenshot: the reference
  // marker reported 66% while drawn at 98% of the rail).
  it('keeps a nudged cluster centred on its true midpoint', () => {
    const raw = [
      { key: 'team', pct: 80 },
      { key: 'you', pct: 81.25 },
      { key: 'pga', pct: 82.5 },
    ];
    const result = layoutMarkerPositions(raw, BAR_MARKER_MIN_GAP_PCT);
    const rawMid = (80 + 82.5) / 2;
    const drawn = result.map((r) => r.pct);
    const drawnMid = (Math.min(...drawn) + Math.max(...drawn)) / 2;
    expect(drawnMid).toBeCloseTo(rawMid, 5);
  });

  it('never drifts a marker more than one min-gap from the value it reports', () => {
    // You 65% / ref 66% / team 64% on a 0..80 domain — the screenshot case.
    const raw = [
      { key: 'team', pct: 80 },
      { key: 'you', pct: 81.25 },
      { key: 'pga', pct: 82.5 },
    ];
    const byKey = Object.fromEntries(
      layoutMarkerPositions(raw, BAR_MARKER_MIN_GAP_PCT).map((r) => [r.key, r.pct]),
    );
    for (const { key, pct } of raw) {
      expect(Math.abs(byKey[key]! - pct)).toBeLessThanOrEqual(BAR_MARKER_MIN_GAP_PCT);
    }
  });

  it('does not inflate a tight cluster beyond what the min-gap strictly requires', () => {
    const raw = [
      { key: 'team', pct: 50 },
      { key: 'you', pct: 50 },
      { key: 'pga', pct: 50 },
    ];
    const drawn = layoutMarkerPositions(raw, BAR_MARKER_MIN_GAP_PCT).map((r) => r.pct);
    // 3 markers => exactly 2 gaps. Anything wider is spacing invented from
    // nothing and read by a coach as a real performance difference.
    const span = Math.max(...drawn) - Math.min(...drawn);
    expect(span).toBeCloseTo(BAR_MARKER_MIN_GAP_PCT * 2, 5);
  });

  it('never pushes a marker outside [0, 100] even for a cluster pinned at the edge', () => {
    const result = layoutMarkerPositions([
      { key: 'a', pct: 99 },
      { key: 'b', pct: 99 },
      { key: 'c', pct: 99 },
    ]);
    for (const r of result) {
      expect(r.pct).toBeGreaterThanOrEqual(0);
      expect(r.pct).toBeLessThanOrEqual(100);
    }
  });
});

// ---------------------------------------------------------------------------
// Equality verdict — bug #3
// ---------------------------------------------------------------------------

describe('valuesDisplayEqual / deltaVsTeam / teamRelativeText — equality verdict (pure)', () => {
  it('treats two values that round to the SAME displayed percent as equal, even though they differ by more than the old 0.01 absolute epsilon', () => {
    // 64.6 vs 65.3 -> both "65%"; diff (0.7) is 70x the old epsilon.
    expect(valuesDisplayEqual(64.6, 65.3, 'percent')).toBe(true);
    expect(deltaVsTeam(64.6, 65.3, 'higher_better', 'percent')).toEqual({ arrow: '·', tone: 'neutral' });
    expect(teamRelativeText(64.6, 65.3, 'higher_better', 'percent')).toBe('Matches team average');
  });

  it('does NOT treat values as equal when their displayed percents genuinely differ', () => {
    expect(valuesDisplayEqual(50, 65.3, 'percent')).toBe(false);
    expect(deltaVsTeam(50, 65.3, 'higher_better', 'percent').tone).toBe('bad');
    expect(teamRelativeText(50, 65.3, 'higher_better', 'percent')).toBe('Below team average');
  });

  it('omitting `unit` preserves the prior absolute-epsilon behavior (backward compatible)', () => {
    expect(deltaVsTeam(38.001, 38, 'higher_better').tone).toBe('neutral');
    expect(teamRelativeText(38.001, 38, 'higher_better')).toBe('Matches team average');
  });

  it('a strokes-unit pair that is genuinely close but NOT display-identical still verdicts normally', () => {
    // 0.81 vs 0.70 both display distinctly ("0.81" vs "0.70").
    expect(valuesDisplayEqual(0.81, 0.7, 'strokes')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Render — Card component (static, non-animated text only; see file header)
// ---------------------------------------------------------------------------

const SG_APPROACH_BASE: StandingBarProps = {
  metric_id: 'sg_approach',
  metric_label: 'SG: Approach',
  player_value: -1.54,
  team_avg: -2.43,
  team_n: 8,
  team_pct: 20,
  pga_value: 0,
  direction: 'higher_better',
  unit: 'strokes',
  scale: { min: -1.5, max: 1.5 },
  size: 'card',
};

describe('Card — dynamic domain render (founder screenshot repro)', () => {
  it('prints WIDENED scale endpoints, not the raw -1.50..1.50 caller domain', () => {
    render(<Card {...SG_APPROACH_BASE} />);
    // formatValue('strokes') = 2dp. The widened+padded domain must NOT
    // read the original fixed endpoints.
    expect(screen.queryByText('-1.50')).toBeNull();
    expect(screen.queryByText('1.50')).toBeNull();
  });

  it('still renders the Team ("T") marker glyph — never silently dropped for being out of the typical range', () => {
    const { container } = render(<Card {...SG_APPROACH_BASE} />);
    expect(screen.getByText('T')).toBeTruthy();
    // The "you" marker is a SOLID dot, not a '●' glyph — an 11px white bullet
    // inside a 12px green circle rendered as a hollow donut (07-24 screenshot).
    // Assert the marker element exists via its brand fill instead of by text.
    expect(screen.queryByText('●')).toBeNull();
    expect(container.querySelector('.bg-primary-600')).toBeTruthy();
  });

  it('still shows the real Team value in the comparison cell (not a suppressed "—")', () => {
    render(<Card {...SG_APPROACH_BASE} />);
    expect(screen.getByText('-2.43')).toBeTruthy();
  });
});

describe('Card — equality verdict render (founder screenshot: CB 65% vs TEAM 65% showing red "Below team average")', () => {
  const GIR_LIKE: StandingBarProps = {
    metric_id: 'gir_pct',
    metric_label: 'GIR %',
    player_value: 64.6,
    team_avg: 65.3,
    team_n: 8,
    team_pct: 40,
    pga_value: 68,
    direction: 'higher_better',
    unit: 'percent',
    scale: { min: 30, max: 80 },
    size: 'card',
  };

  it('renders neutral "Matches team average" instead of "Below team average" for a display-rounding tie', () => {
    render(<Card {...GIR_LIKE} />);
    expect(screen.getByText('Matches team average')).toBeTruthy();
    expect(screen.queryByText('Below team average')).toBeNull();
  });

  it('the caption uses the neutral tone class, never the danger/red token', () => {
    render(<Card {...GIR_LIKE} />);
    const caption = screen.getByText('Matches team average');
    expect(caption.className).not.toContain('fw-danger');
    expect(caption.className).toContain('text-text-tertiary');
  });

  it('the header arrow reads neutral (·), not down, for the same tie', () => {
    render(<Card {...GIR_LIKE} />);
    expect(screen.getByText(/·\s*vs team/)).toBeTruthy();
    expect(screen.queryByText(/↓\s*vs team/)).toBeNull();
  });

  it('a genuinely different pair (not a rounding tie) still verdicts normally', () => {
    render(<Card {...GIR_LIKE} player_value={50} />);
    expect(screen.getByText('Below team average')).toBeTruthy();
    expect(screen.queryByText('Matches team average')).toBeNull();
  });
});
