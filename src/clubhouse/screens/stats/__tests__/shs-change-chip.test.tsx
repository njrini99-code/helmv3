import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ShsChangeChip } from '../SummaryCard';
import { scoreChangeChip } from '../shs-figures';

afterEach(cleanup);

const words = { than: 'than the 10 before', vs: 'vs previous 10' };

/**
 * Owner's screenshot (27 Nov 2026, team Scoring average): a "−0.9" pill beside "No clear change vs previous 10" read as a result in a
 * chip, then the words took it back (the same reading PL-HOME-02 and CONS-20 found on Home). Inside its standard error the pill carries
 * the verdict and the signed figure follows it in plain ink; the words are W27's, so Home and Stats still say the same change.
 */
describe('ShsChangeChip', () => {
  it('no clear change: the verdict in the pill, then the signed figure and what it is against', () => {
    const { container } = render(<ShsChangeChip change={scoreChangeChip(-0.9, 0.76, true, words)} />);
    const pill = container.querySelector('.ch-shs-pill')!;
    expect(pill.textContent).toBe('No clear change');
    expect(pill.className).not.toMatch(/is-gain|is-loss/);
    expect(pill.querySelector('svg')).toBeNull();
    expect(container.textContent).toBe('No clear change−0.9 vs previous 10');
  });

  it('a clear change keeps its arrow and tone in the pill, with the words after it', () => {
    const { container } = render(<ShsChangeChip change={scoreChangeChip(-0.9, 0.3, true, words)} />);
    const pill = container.querySelector('.ch-shs-pill')!;
    expect(pill.className).toMatch(/is-gain/);
    expect(pill.querySelector('svg')).not.toBeNull();
    expect(pill.textContent).toBe('0.9 lower');
    expect(container.textContent).toBe('0.9 lowerthan the 10 before');
  });
});
