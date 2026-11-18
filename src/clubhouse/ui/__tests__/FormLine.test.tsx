import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FormBars, FormRange } from '../FormLine';

/**
 * The roster's last five rounds (stats and charts audit 2026-11-15, CH-03): a row of rounds is a position chart, so each round is a
 * dot at its score's height on the range the list shares, with the player's mean as a rule. The old bars ran from a 30% floor across
 * each player's own best-to-worst, so 72, 73, 72 drew as different as 68, 84, 70.
 */
afterEach(cleanup);

/** Each round's height, as the share of the strip from its foot (a lower score sits higher). */
const heights = (root: Element) => [...root.querySelectorAll('.ch-formbars i')].map((i) => parseFloat((i as HTMLElement).style.bottom));
const gap = (hs: number[]) => Math.max(...hs) - Math.min(...hs);

describe('FormBars · dots on one shared range (CH-03)', () => {
  it('on a shared range, a one-stroke wobble stays small and a sixteen-stroke spread fills the strip', () => {
    const steady = [72, 73, 72];
    const wild = [68, 84, 70];
    const { container } = render(
      <FormRange trends={[steady, wild]} earlyBelow={3}>
        <div data-p="steady">
          <FormBars data={steady} mean={72.3} />
        </div>
        <div data-p="wild">
          <FormBars data={wild} mean={74} />
        </div>
      </FormRange>,
    );
    expect(gap(heights(container.querySelector('[data-p="steady"]')!))).toBeLessThan(10);
    expect(gap(heights(container.querySelector('[data-p="wild"]')!))).toBeGreaterThan(60);
  });

  it('a lower score sits higher, and the same score sits at the same height in every row', () => {
    const { container } = render(
      <FormRange trends={[[70, 76], [76, 70]]} earlyBelow={2}>
        <div data-p="a">
          <FormBars data={[70, 76]} />
        </div>
        <div data-p="b">
          <FormBars data={[76, 70]} />
        </div>
      </FormRange>,
    );
    const [a70, a76] = heights(container.querySelector('[data-p="a"]')!);
    const [b76, b70] = heights(container.querySelector('[data-p="b"]')!);
    expect(a70).toBeGreaterThan(a76!);
    expect(a70).toBe(b70);
    expect(a76).toBe(b76);
  });

  it('alone (a leader card with no list around it), a range inside a round’s usual spread is not stretched to the full strip', () => {
    const { container } = render(<FormBars data={[72, 73, 72]} mean={72.3} />);
    expect(gap(heights(container))).toBeLessThan(10);
  });

  it('draws the player’s mean as a rule at its own height, and no bar has a floor', () => {
    const { container } = render(<FormBars data={[70, 74, 78]} mean={74} />);
    const rule = container.querySelector('.ch-formbars b') as HTMLElement;
    expect(rule).not.toBeNull();
    const [, mid] = heights(container);
    expect(parseFloat(rule.style.bottom)).toBeCloseTo(mid!, 5);
    for (const i of container.querySelectorAll('.ch-formbars i')) expect((i as HTMLElement).style.height).toBe('');
  });
});
