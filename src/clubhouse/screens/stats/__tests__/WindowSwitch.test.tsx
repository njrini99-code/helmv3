// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { WindowSwitch } from '../WindowSwitch';

afterEach(cleanup);

/** Decision Q5: the range is counted in rounds. The phone drops the word "Last" (`.ch-sw-last`); a screen reader keeps the whole name. */
describe('WindowSwitch · the range in rounds', () => {
  it('offers Last 5, Last 10, Last 20, Season and Qualifiers, in that order, with the chosen one checked', () => {
    render(<WindowSwitch value="last20" onChange={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['Last 5', 'Last 10', 'Last 20', 'Season', 'Qualifiers']);
    expect(screen.getByRole('radio', { name: 'Last 20' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Last 10' }).getAttribute('aria-checked')).toBe('false');
  });

  it('wraps only the word "Last" of the three counts, so hiding it leaves the number', () => {
    const { container } = render(<WindowSwitch value="last10" onChange={() => {}} />);
    const words = [...container.querySelectorAll('.ch-sw-last')];
    expect(words).toHaveLength(3);
    expect(words.every((w) => w.textContent === 'Last ')).toBe(true);
    expect(words.map((w) => w.parentElement!.textContent)).toEqual(['Last 5', 'Last 10', 'Last 20']);
  });

  it('a custom range adds a chosen "Custom", and choosing a count passes the range on', () => {
    const onChange = vi.fn();
    render(<WindowSwitch value="last10" onChange={onChange} custom />);
    expect(screen.getByRole('radio', { name: 'Custom' }).getAttribute('aria-checked')).toBe('true');
    screen.getByRole('radio', { name: 'Last 5' }).click();
    expect(onChange).toHaveBeenCalledWith('last5');
  });

  it('the stylesheet hides the word only in the phone row (820px and below), never on a wider screen', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats.css'), 'utf8');
    const at = css.indexOf('.ch-stm-controls .ch-sw-last {');
    expect(at).toBeGreaterThan(-1);
    expect(css.match(/\.ch-sw-last\s*\{/g)).toHaveLength(1);
    const block = css.lastIndexOf('@media', at);
    expect(css.slice(block, css.indexOf('{', block))).toBe('@media (max-width: 820px) ');
  });

  it('the phone segments grow from their own label widths, so "Qualifiers" is not clipped beside 5, 10 and 20 (390px, PR #2257)', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/stats.css'), 'utf8');
    expect(css).toMatch(/\.ch-stm-controls > :first-child \.ch-seg__b \{\s*flex: 1 1 auto;/);
  });
});
