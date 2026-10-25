import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FigureGauge } from '../charts';

/**
 * Review of #2361 (should-fix 2): Scrambling's mark is the team's own earlier period. Its bar is coloured by the tested
 * change (A1), never by which side of the mark it ends on, and the mark says "Previous", not "Tour". A benchmark mark
 * with no tone (Greens against Tour) still colours by side.
 */
const fill = (el: HTMLElement) => el.querySelector('.ch-fg__track i')!.className;

describe('FigureGauge: a rate against an earlier period', () => {
  it('stays neutral when the change is inside its noise, even above the mark', () => {
    const { container } = render(<FigureGauge gauge={{ kind: 'rate', ref: 40, refLabel: 'Previous', tone: '' }} n={46} />);
    expect(fill(container)).toBe('is-neutral');
    expect(container.querySelector('em')!.textContent).toBe('Previous');
  });

  it('takes the tested tone when the change clears it', () => {
    const { container } = render(<FigureGauge gauge={{ kind: 'rate', ref: 40, refLabel: 'Previous', tone: 'is-loss' }} n={46} />);
    expect(fill(container)).toBe('is-loss');
  });

  it('a Tour benchmark with no tone colours by side, as before', () => {
    const { container } = render(<FigureGauge gauge={{ kind: 'rate', ref: 60 }} n={50} />);
    expect(fill(container)).toBe('is-loss');
    expect(container.querySelector('em')!.textContent).toBe('Tour');
  });
});
