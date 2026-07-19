// @vitest-environment jsdom
/**
 * ============================================================================
 * StrokesGainedTornado — duplicate-label row-collision regression guard
 * ----------------------------------------------------------------------------
 * Bug: `TornadoInner`'s y-scale (`scaleBand`) used to key its domain by
 * `d.label`. Two rows CAN legitimately share a label — e.g. the Effectiveness
 * cockpit's "Most impactful patterns" tornado labels each bar with the
 * player's NAME, and one player can have two separate top-N patterns —
 * `scaleBand`'s domain is a distinct key set, so a duplicate label collapsed
 * both rows onto the SAME band. Their bars AND their signed value-annotation
 * text then rendered on top of each other — observed live as two adjacent
 * labels like "+4.10" and "+4.67" reading as the single garbled string
 * "+4.10+4.67".
 *
 * Fix: the y-scale is now keyed by ROW INDEX (always unique), never by the
 * display label. This locks that duplicate labels get distinct rows.
 * ========================================================================== */
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TornadoInner, estimateLabelWidth, type SGCategory } from './StrokesGainedTornado';

describe('StrokesGainedTornado — duplicate-label collision guard', () => {
  it('two rows sharing the SAME label render on DISTINCT y positions (never collide)', () => {
    const data: SGCategory[] = [
      { label: 'Jordan Lee', value: 4.1 },
      { label: 'Jordan Lee', value: 4.67 }, // same player, two top-N patterns
      { label: 'Sam Park', value: -2.3 },
    ];
    const { container } = render(<TornadoInner width={400} height={220} data={data} />);
    const texts = Array.from(container.querySelectorAll('text'));
    const find = (t: string) => texts.find((el) => el.textContent === t);

    const first = find('+4.10');
    const second = find('+4.67');
    const third = find('−2.30'); // formatSigned uses U+2212 minus, not a hyphen

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();

    const ys = [first, second, third].map((el) => el!.getAttribute('y'));
    // All three rows must land on distinct y positions — a regression back to
    // label-keying would collapse the two 'Jordan Lee' rows onto the same y.
    expect(new Set(ys).size).toBe(3);
  });

  it('unique labels still render one row each at distinct positions (no regression)', () => {
    const data: SGCategory[] = [
      { label: 'Off the tee', value: 1.1 },
      { label: 'Approach', value: -0.8 },
    ];
    const { container } = render(<TornadoInner width={400} height={200} data={data} />);
    const texts = Array.from(container.querySelectorAll('text'));
    const ys = texts
      .filter((el) => el.textContent === '+1.10' || el.textContent === '−0.80')
      .map((el) => el.getAttribute('y'));
    expect(ys.length).toBe(2);
    expect(new Set(ys).size).toBe(2);
  });
});

/** Isolates just the axis-tick `<text>` nodes (the sparse `text-anchor="middle"`
 *  labels below the plot) from the per-row category labels and value
 *  annotations, which anchor `start`/`end` and keep their own fixed format. */
function axisTickLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('text[text-anchor="middle"]')).map(
    (el) => el.textContent ?? '',
  );
}

describe('StrokesGainedTornado — x-axis ticks never collapse into raw/duplicate labels', () => {
  it('a small-magnitude "niced" domain gets enough decimals that adjacent ticks stay distinct', () => {
    // Peak ~0.05 → niced domain [-0.06, 0.06] with a 0.02 step. A FIXED
    // 1-decimal display (the old behavior) rounds -0.02 and 0.02 to the
    // indistinguishable "−0.0" / "+0.0" — a raw, unrounded-reading artifact
    // right around the zero benchmark. The tick label's own decimal count
    // must now track the scale's actual step.
    const data: SGCategory[] = [
      { label: 'Putting read', value: 0.05 },
      { label: 'Wedge distance', value: -0.03 },
    ];
    const { container } = render(<TornadoInner width={400} height={220} data={data} />);
    const ticks = axisTickLabels(container);

    expect(ticks.length).toBeGreaterThan(1);
    // No tick label may read as a signed, garbled near-zero.
    expect(ticks).not.toContain('−0.0');
    expect(ticks).not.toContain('+0.0');
    // Every tick must be visually distinct from every other tick.
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it('a normal-magnitude domain still renders clean whole ticks (no unnecessary ".0")', () => {
    const data: SGCategory[] = [
      { label: 'Off the tee', value: 2.3 },
      { label: 'Approach', value: -1.1 },
    ];
    const { container } = render(<TornadoInner width={400} height={220} data={data} />);
    const ticks = axisTickLabels(container);
    // The niced domain for this peak (~2.3 * 1.15) is [-3, 3] with a step of
    // 1 — ticks should read as clean whole numbers, not "+1.0" noise.
    expect(ticks).toContain('0');
    expect(ticks).toContain('+3');
    expect(ticks).toContain('−3');
    expect(new Set(ticks).size).toBe(ticks.length);
  });
});

/**
 * ============================================================================
 * #111 — category label / own-value / x-axis-tick collision guards
 * ----------------------------------------------------------------------------
 * Two DISTINCT geometry bugs reported live alongside the two correctly-
 * rendering LeakMap charts on the same FairwayTeamStats page:
 *
 *  1. A row's signed value annotation renders just past its own bar tip. At
 *     the domain's extreme (a tight/zero-headroom `domainMax`, a real caller
 *     path) that annotation's own text width could carry it PAST x = 0 —
 *     landing on top of the SAME row's category label in the left gutter.
 *  2. `xScale.ticks(5)` is a request, not a guarantee: for small-magnitude
 *     data it can hand back 7 ticks whose decimal labels ("−0.06"/"−0.04"/…)
 *     are individually wider than the pixel gap between them, so adjacent
 *     digits visually merge into one unreadable run.
 *
 * jsdom has no `getBBox` (real SVG layout), so both guards work from the
 * SAME geometry the component itself computes — parsed `x`/`y` attributes
 * plus the shared `estimateLabelWidth` heuristic — rather than a DOM bbox.
 * ========================================================================== */
describe('StrokesGainedTornado — #111 value-annotation stays clear of its own category label', () => {
  it('an extreme value at a tight (zero-headroom) domainMax never bleeds its annotation past x = 0', () => {
    // domainMax === the exact peak (no auto 1.15 headroom) is the worst case:
    // the bar's tip lands EXACTLY on the plot's reserved inset boundary.
    const data: SGCategory[] = [
      { label: 'Around the Green', value: -15 },
      { label: 'Putting', value: 4.2 },
    ];
    const { container } = render(
      <TornadoInner width={500} height={260} data={data} domainMax={15} />,
    );
    const texts = Array.from(container.querySelectorAll('text'));
    const valueLabel = texts.find((el) => el.textContent === '−15.00');
    expect(valueLabel).toBeDefined();

    const x = Number(valueLabel!.getAttribute('x'));
    const textAnchor = valueLabel!.getAttribute('text-anchor');
    expect(textAnchor).toBe('end'); // anchors AWAY from the bar, toward x = 0
    const width = estimateLabelWidth('−15.00', 11);
    const leftEdge = x - width;

    // The category-label gutter lives at x <= -12 (local, Group-offset)
    // coordinates. The value annotation's own left edge must stay clear of
    // it — a regression back to an un-inset `range: [0, innerW]` would push
    // this leftEdge negative, overlapping the row's own label.
    expect(leftEdge).toBeGreaterThan(0);
  });

  it('a mid-range value still renders its annotation with normal clearance (no regression)', () => {
    const data: SGCategory[] = [
      { label: 'Off the tee', value: 1.2 },
      { label: 'Approach', value: -0.6 },
    ];
    const { container } = render(<TornadoInner width={500} height={220} data={data} />);
    const texts = Array.from(container.querySelectorAll('text'));
    const valueLabel = texts.find((el) => el.textContent === '+1.20');
    expect(valueLabel).toBeDefined();
    expect(Number(valueLabel!.getAttribute('x'))).toBeGreaterThan(0);
  });
});

describe('StrokesGainedTornado — #111 x-axis tick labels never overlap', () => {
  it('a small-magnitude domain (many candidate ticks, wide decimal labels) renders only ticks with real breathing room between them', () => {
    const data: SGCategory[] = [
      { label: 'Putting read', value: 0.05 },
      { label: 'Wedge distance', value: -0.03 },
    ];
    // A NARROW plot (worst case for cramped ticks) — the exact geometry that
    // used to render "−0.06" and "−0.04" close enough to visually merge.
    const { container } = render(<TornadoInner width={400} height={220} data={data} />);
    const tickTexts = Array.from(
      container.querySelectorAll('text[text-anchor="middle"]'),
    ).sort((a, b) => Number(a.getAttribute('x')) - Number(b.getAttribute('x')));

    expect(tickTexts.length).toBeGreaterThan(1);

    for (let i = 1; i < tickTexts.length; i++) {
      const prev = tickTexts[i - 1]!;
      const curr = tickTexts[i]!;
      const prevX = Number(prev.getAttribute('x'));
      const currX = Number(curr.getAttribute('x'));
      const prevRightEdge = prevX + estimateLabelWidth(prev.textContent ?? '', 11) / 2;
      const currLeftEdge = currX - estimateLabelWidth(curr.textContent ?? '', 11) / 2;
      // Every KEPT tick must have visible daylight from its neighbor — the
      // literal guarantee that fixes "digits merge into unreadable text".
      expect(currLeftEdge).toBeGreaterThanOrEqual(prevRightEdge);
    }
  });

  it('a normal-magnitude domain at a comfortable width keeps every one of its whole-number ticks (no over-thinning)', () => {
    const data: SGCategory[] = [
      { label: 'Off the tee', value: 2.3 },
      { label: 'Approach', value: -1.1 },
    ];
    const { container } = render(<TornadoInner width={900} height={220} data={data} />);
    const ticks = axisTickLabels(container);
    expect(ticks).toContain('0');
    expect(ticks).toContain('+3');
    expect(ticks).toContain('−3');
    expect(new Set(ticks).size).toBe(ticks.length);
  });
});
