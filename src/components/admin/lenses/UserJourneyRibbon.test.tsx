// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserJourneyRibbon } from './UserJourneyRibbon';
import type { UserJourneyRibbon as RibbonData, RibbonStage } from '@/lib/admin/lenses/user-ribbon';

function stage(overrides: Partial<RibbonStage> = {}): RibbonStage {
  return { id: 's', label: 'Stage', reached: null, at: null, sourceNote: 'note', ...overrides };
}

function ribbon(stages: RibbonStage[]): RibbonData {
  return {
    subjectRef: 'u1',
    stages,
    incidents: { count: 2, recentTitles: ['boom'] },
    sessions: { count: 3 },
    release: { sha: 'abc123', sinceIso: '2026-09-01T00:00:00Z' },
    flagsCohort: { note: 'not tracked' },
    traceReplayAvailable: false,
    threadHref: '/admin/thread/user/u1',
    generatedAt: '2026-09-03T00:00:00Z',
    degradedNote: null,
  };
}

describe('UserJourneyRibbon', () => {
  it('renders one node per stage with its label', () => {
    render(<UserJourneyRibbon ribbon={ribbon([stage({ id: 'a', label: 'Login' }), stage({ id: 'b', label: 'Submit' })])} />);
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Submit')).toBeInTheDocument();
  });

  it('never renders raw PII (email/name) — the ribbon prop carries none', () => {
    render(<UserJourneyRibbon ribbon={ribbon([stage()])} />);
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('shows "Unavailable" for a null incident/session count, not a fabricated zero', () => {
    const r = ribbon([stage()]);
    r.incidents = { count: null, recentTitles: [] };
    r.sessions = { count: null };
    render(<UserJourneyRibbon ribbon={r} />);
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  });

  it('renders the flags/cohort honesty note rather than fabricating cohort data', () => {
    render(<UserJourneyRibbon ribbon={ribbon([stage()])} />);
    expect(screen.getByText('not tracked')).toBeInTheDocument();
  });
});
