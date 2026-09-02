// =============================================================================
// The grouped filter bar — labels in words, an explicit "All" per group, and
// an active-filter summary that survives the panel being closed.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ErrorsFilterBar, type FilterGroup } from '@/app/admin/errors/_components/ErrorsFilterBar';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ children, href, className, ...rest }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

const groups: FilterGroup[] = [
  {
    param: 'sport',
    label: 'Sport',
    hint: 'Which product the error belongs to.',
    options: [
      { value: '', label: 'All', href: '/admin/errors', selected: false },
      { value: 'golf', label: 'Golf', href: '/admin/errors?sport=golf', selected: true },
      { value: 'baseball', label: 'Baseball', href: '/admin/errors?sport=baseball', selected: false },
    ],
  },
  {
    param: 'kind',
    label: 'Kind',
    hint: 'What the classifier decided an incident is.',
    options: [
      { value: '', label: 'Needs action', href: '/admin/errors?sport=golf', selected: true, description: 'the default' },
      { value: 'all', label: 'Everything', href: '/admin/errors?sport=golf&kind=all', selected: false },
    ],
  },
];

describe('ErrorsFilterBar', () => {
  it('renders every group with its label and hint, and every option as a pressable pill', () => {
    render(<ErrorsFilterBar groups={groups} active={[]} clearAllHref="/admin/errors" />);
    expect(screen.getByRole('group', { name: 'Sport' })).toBeInTheDocument();
    expect(screen.getByText('Which product the error belongs to.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Golf' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Baseball' })).toHaveAttribute('aria-pressed', 'false');
    // The resting state is a real option, not the absence of a highlight.
    expect(screen.getAllByRole('button', { name: 'All' })).toHaveLength(1);
    expect(screen.getByText('none active')).toBeInTheDocument();
  });

  it('navigates to the option’s server-computed href on click', () => {
    render(<ErrorsFilterBar groups={groups} active={[]} clearAllHref="/admin/errors" />);
    screen.getByRole('button', { name: 'Baseball' }).click();
    expect(push).toHaveBeenCalledWith('/admin/errors?sport=baseball');
  });

  it('summarises active filters in words, each clearable, with a clear-all link', () => {
    render(
      <ErrorsFilterBar
        groups={groups}
        active={[
          { param: 'sport', label: 'Sport', value: 'Golf', clearHref: '/admin/errors?window=168' },
          { param: 'window', label: 'Window', value: 'Last 7 days', clearHref: '/admin/errors?sport=golf' },
        ]}
        clearAllHref="/admin/errors"
      />,
    );
    expect(screen.getByText('2 active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear Sport: Golf' })).toHaveAttribute('href', '/admin/errors?window=168');
    expect(screen.getByRole('link', { name: 'Clear Window: Last 7 days' })).toHaveAttribute('href', '/admin/errors?sport=golf');
    expect(screen.getByRole('link', { name: 'Clear all' })).toHaveAttribute('href', '/admin/errors');
  });

  it('opens by default only when a filter is active', () => {
    const { container, unmount } = render(<ErrorsFilterBar groups={groups} active={[]} clearAllHref="/admin/errors" />);
    expect(container.querySelector('details')?.open).toBe(false);
    unmount();

    const withActive = render(
      <ErrorsFilterBar
        groups={groups}
        active={[{ param: 'sport', label: 'Sport', value: 'Golf', clearHref: '/admin/errors' }]}
        clearAllHref="/admin/errors"
      />,
    );
    expect(withActive.container.querySelector('details')?.open).toBe(true);
  });
});
