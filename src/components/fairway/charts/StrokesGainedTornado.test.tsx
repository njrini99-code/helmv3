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
import { TornadoInner, type SGCategory } from './StrokesGainedTornado';

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
