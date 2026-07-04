import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { FeatureDotGrid } from '@/app/admin/_components/FeatureDotGrid';
import type { FeatureHealth } from '@/lib/admin/data/feature-health';

// next/link's prefetch path calls `new IntersectionObserver(...)`; the
// global jsdom mock in src/test/setup.tsx is a plain vi.fn() (not
// constructor-callable), so a real next/link in a mounted tree throws.
// Same swap as triage-queue.test.tsx (W6).
vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

function fh(overrides: Partial<FeatureHealth>): FeatureHealth {
  return {
    key: 'round_tracking',
    app: 'golfhelm',
    label: 'Round Tracking',
    status: 'green',
    trend: 'flat',
    reason: 'Healthy',
    summary: '0 error incident(s) across 0 signature(s) in 24h, flat vs yesterday.',
    topSignatures: [],
    drillIn: { warnings24h: 0, rlsDenials24h: 0, heartbeatAgeHours: 1 },
    healthSignal: 'Round submits complete.',
    knownGaps: [],
    ...overrides,
  };
}

const FEATURES: FeatureHealth[] = [
  fh({ key: 'stats_analytics', app: 'golfhelm', label: 'Stats & Analytics', status: 'green' }),
  fh({ key: 'round_tracking', app: 'golfhelm', label: 'Round Tracking', status: 'red', reason: '2 unresolved critical incidents.' }),
  fh({ key: 'course_library', app: 'golfhelm', label: 'Course Library', status: 'amber', reason: '3 error fingerprints.' }),
  fh({ key: 'whats_new', app: 'golfhelm', label: "What's New", status: 'neutral', reason: 'No feature-tagged data yet.' }),
  fh({
    key: 'coachhelm_ai_engine',
    app: 'coachhelm',
    label: 'CoachHelm Engine',
    status: 'green',
    topSignatures: [
      { fingerprint: 'fp1', title: 'timeout on fan-out', count: 4, firstSeen: '2026-07-01T00:00:00Z', lastSeen: '2026-07-02T10:00:00Z', severity: 'error' },
    ],
  }),
  fh({ key: 'baseball_roster', app: 'baseballhelm', label: 'Baseball Roster', status: 'amber', reason: '1 warning event.' }),
];

describe('FeatureDotGrid', () => {
  it('renders each of the 4 tones with an icon AND a text label (queried by text, not color)', () => {
    render(<FeatureDotGrid features={FEATURES} />);
    expect(screen.getByRole('button', { name: /Round Tracking: red/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Course Library: needs attention/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stats & Analytics: healthy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /What's New: no data/i })).toBeInTheDocument();
  });

  it('neutral renders "no data" — never "red"', () => {
    render(<FeatureDotGrid features={FEATURES} />);
    const neutralChip = screen.getByRole('button', { name: /What's New/i });
    expect(neutralChip.getAttribute('aria-label')).toMatch(/no data/i);
    expect(neutralChip.getAttribute('aria-label')).not.toMatch(/: red/i);
  });

  it('renders GolfHelm, CoachHelm, and BaseballHelm lanes in command order', () => {
    render(<FeatureDotGrid features={FEATURES} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('GolfHelm')).toBeLessThan(headings.indexOf('CoachHelm'));
    expect(headings.indexOf('CoachHelm')).toBeLessThan(headings.indexOf('BaseballHelm'));
  });

  it('sorts red first within a group, regardless of input order', () => {
    render(<FeatureDotGrid features={FEATURES} />);
    const golfSection = screen.getByRole('region', { name: 'GolfHelm' });
    const buttons = within(golfSection).getAllByRole('button');
    expect(buttons[0]?.getAttribute('aria-label')).toMatch(/Round Tracking: red/i);
  });

  it('renders BaseballHelm as live feature chips, not a paused note', () => {
    const { container } = render(<FeatureDotGrid features={FEATURES} />);
    expect(screen.queryByText(/Baseball — paused/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Baseball Roster: needs attention/i })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="fw-status-pill"]').length).toBe(FEATURES.length);
  });

  it('clicking a chip expands the per-feature card with top signatures as grouped single lines with counts', async () => {
    const user = userEvent.setup();
    render(<FeatureDotGrid features={FEATURES} />);
    await user.click(screen.getByRole('button', { name: /CoachHelm Engine/i }));
    const card = screen.getByLabelText('CoachHelm Engine detail');
    expect(within(card).getByText(/timeout on fan-out/i)).toBeInTheDocument();
    expect(within(card).getByText(/4×/)).toBeInTheDocument();
    // ONE line per fingerprint, not N rows.
    expect(within(card).getAllByText(/timeout on fan-out/i)).toHaveLength(1);
  });
});
