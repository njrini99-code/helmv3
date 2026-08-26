import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiSourceNote } from '@/app/admin/_components/KpiSourceNote';

describe('KpiSourceNote', () => {
  it('starts collapsed (native <details>, no `open` attribute) but keeps the source text in the DOM', () => {
    render(<KpiSourceNote source="Sentry issues API — unresolved, org-wide (not windowed)." />);
    const summary = screen.getByText('Source');
    const details = summary.closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    // Content exists in the DOM even while collapsed — native browser
    // display:none, not a React unmount — so it's reachable without a click.
    expect(screen.getByText(/unresolved, org-wide/i)).toBeInTheDocument();
  });

  it('renders the freshness line only when one is supplied', () => {
    const { rerender } = render(<KpiSourceNote source="users.last_seen since UTC midnight." />);
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();

    rerender(<KpiSourceNote source="users.last_seen since UTC midnight." freshnessLabel="fresh · 4m ago" />);
    expect(screen.getByText('fresh · 4m ago')).toBeInTheDocument();
  });

  it('gives the toggle a real (>=44px) tap target, not just the visible icon+text', () => {
    render(<KpiSourceNote source="x" />);
    const summary = screen.getByText('Source').closest('summary');
    expect(summary?.className).toMatch(/min-h-11/);
  });
});
