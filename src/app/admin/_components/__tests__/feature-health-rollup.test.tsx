import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FeatureHealthRollup } from '@/app/admin/_components/FeatureHealthRollup';
import type { FeatureHealthSummary } from '@/lib/admin/data/feature-health';

// See feature-dot-grid.test.tsx — next/link's prefetch path needs a real
// constructor-callable IntersectionObserver the jsdom setup mock doesn't
// provide.
vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

function summary(overrides: Partial<FeatureHealthSummary> = {}): FeatureHealthSummary {
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

describe('FeatureHealthRollup', () => {
  it('renders the compact "N green · M amber · R red · K neutral" line, linking to /admin/health', () => {
    render(<FeatureHealthRollup summary={summary({ green: 30, amber: 2, red: 1, neutral: 4 })} />);
    const link = screen.getByRole('link', { name: /30 green.*2 amber.*1 red.*4 neutral/i });
    expect(link).toHaveAttribute('href', '/admin/health');
  });

  it('renders up to 4 inline red/amber chips, then "+n more"', () => {
    const redFeatures = Array.from({ length: 3 }, (_, i) => ({ key: `f${i}` as never, label: `Feature ${i}` }));
    const amberFeatures = Array.from({ length: 3 }, (_, i) => ({ key: `g${i}` as never, label: `Amber ${i}` }));
    render(<FeatureHealthRollup summary={summary({ red: 3, amber: 3, redFeatures, amberFeatures })} />);
    // 6 flagged total, 4 shown, "+2 more"
    expect(screen.getByText('Feature 0')).toBeInTheDocument();
    expect(screen.getByText(/\+2 more/i)).toBeInTheDocument();
    expect(screen.queryByText('Amber 2')).not.toBeInTheDocument();
  });

  it('all-green renders a single quiet line — no celebration wall, no chips', () => {
    render(<FeatureHealthRollup summary={summary({ green: 37, amber: 0, red: 0, neutral: 0 })} />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByText(/more →/i)).not.toBeInTheDocument();
  });

  it('a degraded pipeline renders "unavailable", never a fabricated count', () => {
    render(<FeatureHealthRollup summary={summary({ degraded: true })} />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
