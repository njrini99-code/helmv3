import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { bucketSeverityMix, SeverityMixStrip } from '@/app/admin/_components/SeverityMixStrip';

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

describe('bucketSeverityMix', () => {
  it('counts critical/error/warning and silently drops anything else', () => {
    const items = [
      { severity: 'critical' },
      { severity: 'critical' },
      { severity: 'error' },
      { severity: 'warning' },
      { severity: 'info' },
      { severity: 'bogus' },
    ];
    expect(bucketSeverityMix(items)).toEqual({ critical: 2, error: 1, warning: 1 });
  });

  it('returns all-zero counts for an empty feed', () => {
    expect(bucketSeverityMix([])).toEqual({ critical: 0, error: 0, warning: 0 });
  });
});

describe('SeverityMixStrip', () => {
  it('claims all-clear only when every count is zero AND the Sentry half of the feed actually ran', () => {
    render(<SeverityMixStrip counts={{ critical: 0, error: 0, warning: 0 }} sentryStatus="ok" />);
    expect(screen.getByText(/no critical, error, or warning incidents/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('never renders an all-clear when the Sentry feed errored, even at zero counts', () => {
    render(<SeverityMixStrip counts={{ critical: 0, error: 0, warning: 0 }} sentryStatus="error" />);
    expect(screen.queryByText(/no critical, error, or warning incidents/i)).not.toBeInTheDocument();
    expect(screen.getByText(/this is not an all-clear/i)).toBeInTheDocument();
  });

  it('labels an unconfigured Sentry integration distinctly from a live failure', () => {
    render(<SeverityMixStrip counts={{ critical: 0, error: 0, warning: 0 }} sentryStatus="unconfigured" />);
    expect(screen.getByText(/sentry not configured/i)).toBeInTheDocument();
  });

  it('renders one labelled, deep-linked, tabular-nums chip per non-zero severity', () => {
    render(<SeverityMixStrip counts={{ critical: 3, error: 0, warning: 5 }} sentryStatus="ok" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2); // error omitted — its count is 0

    const critical = screen.getByRole('link', { name: /critical/i });
    expect(critical).toHaveAttribute('href', '/admin/errors?window=24&severity=critical');
    expect(critical).toHaveTextContent('3');
    expect(critical.querySelector('.tabular-nums')).not.toBeNull();

    const warning = screen.getByRole('link', { name: /warning/i });
    expect(warning).toHaveAttribute('href', '/admin/errors?window=24&severity=warning');
    expect(warning).toHaveTextContent('5');
  });

  it('surfaces a partial-feed caveat rather than silently under-counting when Sentry errored but app-origin incidents exist', () => {
    render(<SeverityMixStrip counts={{ critical: 1, error: 0, warning: 0 }} sentryStatus="error" />);
    expect(screen.getByText(/counts below are in-app incidents only/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /critical/i })).toBeInTheDocument();
  });
});
