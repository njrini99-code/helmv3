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
