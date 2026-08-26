import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { FeatureHealthSummary } from '@/app/admin/_components/FeatureHealthSummary';
import type { FeatureHealthSummary as FeatureHealthSummaryData } from '@/lib/admin/data/feature-health';

// Same swap as feature-health-rollup.test.tsx / feature-dot-grid.test.tsx —
// next/link's prefetch path needs a real constructor-callable
// IntersectionObserver the jsdom setup mock doesn't provide.
vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

function summary(overrides: Partial<FeatureHealthSummaryData> = {}): FeatureHealthSummaryData {
  return {
    green: 30,
    amber: 0,
    red: 0,
    neutral: 7,
    redFeatures: [],
    amberFeatures: [],
    newFingerprints24h: 0,
    degraded: false,
    generatedAt: '2026-07-02T12:00:00Z',
    ...overrides,
  };
}

describe('FeatureHealthSummary — variant="compact" (the Overview/golf/baseball banner)', () => {
  it('renders the "N green · M amber · R red · K neutral" line, linking to /admin/health', () => {
    render(<FeatureHealthSummary variant="compact" summary={summary({ green: 30, amber: 2, red: 1, neutral: 4 })} />);
    const link = screen.getByRole('link', { name: /30 green.*2 amber.*1 red.*4 neutral/i });
    expect(link).toHaveAttribute('href', '/admin/health');
  });

  it('all-green renders a single quiet line — no celebration wall, no chips', () => {
    render(<FeatureHealthSummary variant="compact" summary={summary({ green: 37, amber: 0, red: 0, neutral: 0 })} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('a degraded pipeline renders "unavailable", never a fabricated count', () => {
    render(<FeatureHealthSummary variant="compact" summary={summary({ degraded: true })} />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('FeatureHealthSummary — variant="full" (the Health board group header)', () => {
  it('renders "N red · M amber" when the group needs eyes', () => {
    render(<FeatureHealthSummary variant="full" summary={summary({ green: 10, amber: 2, red: 1, neutral: 0 })} />);
    expect(screen.getByText(/1 red/i)).toBeInTheDocument();
    expect(screen.getByText(/2 amber/i)).toBeInTheDocument();
  });

  it('renders "N healthy · M no data" — never "healthy" alone — when neutral features remain', () => {
    render(<FeatureHealthSummary variant="full" summary={summary({ green: 10, amber: 0, red: 0, neutral: 3 })} />);
    expect(screen.getByText(/10 healthy/i)).toBeInTheDocument();
    expect(screen.getByText(/3 no data/i)).toBeInTheDocument();
  });

  it('renders a plain "N healthy" only when there is nothing else to report', () => {
    render(<FeatureHealthSummary variant="full" summary={summary({ green: 12, amber: 0, red: 0, neutral: 0 })} />);
    expect(screen.getByText('12 healthy')).toBeInTheDocument();
  });

  it('a degraded pipeline renders "unavailable" for the full variant too', () => {
    render(<FeatureHealthSummary variant="full" summary={summary({ degraded: true })} />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
});
