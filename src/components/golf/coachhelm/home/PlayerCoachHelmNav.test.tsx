// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerCoachHelmNav } from './PlayerCoachHelmNav';

let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
}));

describe('PlayerCoachHelmNav', () => {
  beforeEach(() => {
    params = new URLSearchParams();
    window.history.replaceState({}, '', '/golf/dashboard/coachhelm');
  });

  it('provides working URLs for every CoachHelm section', () => {
    render(<PlayerCoachHelmNav />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/golf/dashboard/coachhelm');
    expect(screen.getByRole('link', { name: 'Development' })).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=development');
    expect(screen.getByRole('link', { name: 'Game profile' })).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=profile');
    expect(screen.getByRole('link', { name: 'Standing' })).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=standing');
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=insights');
    expect(screen.getByRole('link', { name: 'Deep dive' })).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=deep-dive');
  });

  it('marks a deep-linked section active and preserves unrelated query state', () => {
    params = new URLSearchParams('view=profile&demo=1');
    render(<PlayerCoachHelmNav />);

    expect(screen.getByRole('link', { name: 'Game profile' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/golf/dashboard/coachhelm?demo=1');
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=insights&demo=1');
  });

  it('switches sections immediately without a force-dynamic server navigation', () => {
    render(<PlayerCoachHelmNav />);

    fireEvent.click(screen.getByRole('link', { name: 'Insights' }));

    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(window.location.search).toBe('?view=insights');
  });
});
