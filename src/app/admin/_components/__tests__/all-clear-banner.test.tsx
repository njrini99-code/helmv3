import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AllClearBanner } from '../AllClearBanner';
import type { AllClearClaim } from '@/lib/admin/incidents/all-clear';

const CHECKED_AT = '2026-10-06T12:00:00.000Z';

function claim(overrides: Partial<AllClearClaim> = {}): AllClearClaim {
  return {
    state: 'all-clear',
    windowHours: 72,
    sourcesReading: 5,
    sourcesTotal: 5,
    checkedAt: CHECKED_AT,
    olderOpenCount: 0,
    ...overrides,
  };
}

describe('AllClearBanner', () => {
  it('leads a fully clear board with one calm confirmation and its provenance', () => {
    const { container } = render(
      <AllClearBanner claim={claim()} details={['release 8e4c5b7 clean so far']} olderOpenHref="#older" />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'All clear' })).toBeInTheDocument();
    expect(screen.getByText('No errors need action in the last 72 hours.')).toBeInTheDocument();
    expect(screen.getByText('5 of 5 sources reading')).toBeInTheDocument();
    expect(screen.getByText(/checked/)).toBeInTheDocument();
    expect(screen.getByText('release 8e4c5b7 clean so far')).toBeInTheDocument();
    // Nothing to act on, so no action is offered.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('[data-all-clear="all-clear"]')).not.toBeNull();
  });

  // /admin re-renders every 30s and the checked time changes each time; a
  // live region would re-announce the banner to a screen reader on every one.
  it('is not a live region', () => {
    const { container } = render(<AllClearBanner claim={claim()} olderOpenHref="#older" />);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('section')).toHaveAttribute('aria-labelledby', 'bridge-all-clear-heading');
  });

  it('uses the screen-specific timestamp verb', () => {
    render(<AllClearBanner claim={claim()} checkedLabel="reconciled" olderOpenHref="#older" />);
    expect(screen.getByText(/reconciled/)).toBeInTheDocument();
    expect(screen.queryByText(/checked/)).not.toBeInTheDocument();
  });

  it('never says "All clear" while older errors are still open, and offers them as the one action', () => {
    render(
      <AllClearBanner claim={claim({ state: 'window-clear', olderOpenCount: 3 })} olderOpenHref="/admin/errors#stale" />,
    );
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing new in 72 hours' })).toBeInTheDocument();
    expect(screen.getByText(/3 older errors are still open but quiet\./)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Review the 3 older errors/ });
    expect(link).toHaveAttribute('href', '/admin/errors#stale');
  });

  it('words a single older error in the singular', () => {
    render(<AllClearBanner claim={claim({ state: 'window-clear', olderOpenCount: 1 })} olderOpenHref="#older" />);
    expect(screen.getByText(/1 older error is still open but quiet\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Review the 1 older error\b/ })).toBeInTheDocument();
  });

  it('names a week-long window in days', () => {
    render(<AllClearBanner claim={claim({ windowHours: 168 })} olderOpenHref="#older" />);
    expect(screen.getByText('No errors need action in the last 7 days.')).toBeInTheDocument();
  });
});
