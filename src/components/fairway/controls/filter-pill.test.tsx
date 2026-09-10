// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilterPill, FilterPillLink } from './filter-pill';

describe('FilterPill touch target (WCAG 2.2 AA 2.5.8)', () => {
  it('keeps the sm pill visually compact (30px) while expanding to 44px on coarse pointers', () => {
    render(<FilterPill size="sm">All players</FilterPill>);
    const cls = screen.getByRole('button', { name: 'All players' }).className;
    // Desktop/mouse visual height is unchanged.
    expect(cls).toContain('min-h-[30px]');
    // Coarse-pointer (touch) devices get the full 44px hit area, gated by
    // the same `[@media(pointer:coarse)]:` pattern already used on Button
    // `sm` and Segmented `sm`/`md`.
    expect(cls).toContain('[@media(pointer:coarse)]:min-h-[44px]');
  });

  it('keeps the md pill visually compact (36px) while expanding to 44px on coarse pointers', () => {
    render(<FilterPill size="md">All players</FilterPill>);
    const cls = screen.getByRole('button', { name: 'All players' }).className;
    expect(cls).toContain('min-h-[36px]');
    expect(cls).toContain('[@media(pointer:coarse)]:min-h-[44px]');
  });

  it('applies the same coarse-pointer touch target to the link variant', () => {
    render(<FilterPillLink href="/roster?filter=all" size="sm">All players</FilterPillLink>);
    const cls = screen.getByRole('link', { name: 'All players' }).className;
    expect(cls).toContain('min-h-[30px]');
    expect(cls).toContain('[@media(pointer:coarse)]:min-h-[44px]');
  });
});

describe('FilterPill', () => {
  it('renders a real toggle button with aria-pressed reflecting `selected`', () => {
    const { rerender } = render(<FilterPill>Leaders</FilterPill>);
    const btn = screen.getByRole('button', { name: 'Leaders' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    rerender(<FilterPill selected>Leaders</FilterPill>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button')).toHaveAttribute('data-selected', 'true');
  });

  it('fires onClick when enabled and not when disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<FilterPill onClick={onClick}>Leaders</FilterPill>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <FilterPill disabled onClick={onClick}>
        Leaders
      </FilterPill>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the trailing count badge when provided', () => {
    render(<FilterPill count={12}>Leaders</FilterPill>);
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
