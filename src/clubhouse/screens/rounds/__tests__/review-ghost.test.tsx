// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChReviewHole } from '../../../data/round-review-shape';
import { ScoreFlow } from '../RoundZones';

afterEach(cleanup);

const holes: ChReviewHole[] = Array.from({ length: 18 }, (_, i) => ({ n: i + 1, par: 4, yards: null, score: i === 13 ? 6 : 4, putts: null, fairway: null, gir: null, penalties: 0, shots: [] }));

describe('the review arc’s ghost (P-7 4.5.2)', () => {
  it('draws another round under this one and says it in the slider', () => {
    const cum = Array.from({ length: 18 }, (_, i) => (i >= 13 ? 1 : 0));
    const { container, getByRole } = render(<ScoreFlow holes={holes} outScore={36} outToPar={0} inScore={38} inToPar={2} selected={14} ghost={{ cum, label: 'Best here · 73', spoken: 'best here' }} />);
    expect(container.querySelector('.ch-rzghost polyline')!.getAttribute('stroke-dasharray')).toBe('4 3');
    expect(container.querySelector('.ch-rzghost text')!.textContent).toBe('Best here · 73');
    expect(getByRole('slider').getAttribute('aria-valuetext')).toBe('Hole 14, par 4, made 6, plus 2 through 14, best here plus 1 through 14');
  });

  it('speaks an average to one decimal', () => {
    const cum = Array.from({ length: 18 }, () => 4 / 3);
    const { getByRole } = render(<ScoreFlow holes={holes} outScore={36} outToPar={0} inScore={38} inToPar={2} selected={14} ghost={{ cum, label: 'Average here', spoken: 'average here' }} />);
    expect(getByRole('slider').getAttribute('aria-valuetext')).toBe('Hole 14, par 4, made 6, plus 2 through 14, average here plus 1.3 through 14');
  });
});
