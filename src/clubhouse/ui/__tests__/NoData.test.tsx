import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NO_DATA } from '../../lib/format';
import { NoData } from '../NoData';

afterEach(cleanup);

describe('NoData (row 46)', () => {
  it('shows the dash to the eye and says "No data" to a screen reader', () => {
    const { container } = render(<NoData />);
    const dash = container.querySelector('[aria-hidden="true"]');
    expect(dash?.textContent).toBe(NO_DATA);
    expect(container.querySelector('.ch-sr-only')?.textContent).toBe('No data');
  });
  it('takes a word that fits the context', () => {
    const { container } = render(<NoData label="Not played" />);
    expect(container.querySelector('.ch-sr-only')?.textContent).toBe('Not played');
  });
  it('reads at the tertiary ink', () => {
    const css = readFileSync(join(__dirname, '../../styles/ui.css'), 'utf8');
    expect(css).toMatch(/\.ch-nodata \{\s*color: var\(--ch-text-tertiary\);/);
  });
});
