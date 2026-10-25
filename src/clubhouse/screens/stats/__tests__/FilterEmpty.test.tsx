import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterEmpty } from '../StatsFilter';

afterEach(() => cleanup());

/** CONS-11, auditor on #2361: the page-wide "No rounds match these filters" had no kind, so it drew the first-run page
 *  medallion. Both forms say they are filtered: the status title, the filter glyph, and Clear filters. */
describe('Stats filter empty (CONS-11)', () => {
  it.each([false, true])('page %s: filtered, read as a status, and clears', (page) => {
    const onClear = vi.fn();
    const { container } = render(<FilterEmpty code="CH-4306" onClear={onClear} page={page} />);
    const root = container.querySelector('[data-ch-state]')!;
    expect(root.getAttribute('data-ch-state')).toBe('filtered');
    expect(root.className).toMatch(page ? /\bch-es--page\b/ : /\bch-es--section\b/);
    expect(screen.getByRole('status').textContent).toBe('No rounds match these filters');
    expect(root.querySelector('.ch-es__glyph svg')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
