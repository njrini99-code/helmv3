// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityThreadsPanel } from './ActivityThreadsPanel';
import type { ActivityThreadsLens } from '@/lib/admin/lenses/activity-threads';

function lens(overrides: Partial<ActivityThreadsLens> = {}): ActivityThreadsLens {
  return { threads: [], generatedAt: '2026-09-03T00:00:00Z', degradedNote: null, ...overrides };
}

describe('ActivityThreadsPanel', () => {
  it('renders an honest empty state, not a fabricated thread', () => {
    render(<ActivityThreadsPanel lens={lens()} />);
    expect(screen.getByText('No team activity in the last 48 hours.')).toBeInTheDocument();
  });

  it('renders a thread sentence and its severity pill', () => {
    render(
      <ActivityThreadsPanel
        lens={lens({
          threads: [
            {
              teamId: 't1',
              teamName: 'Rini University',
              sport: 'golf',
              sentence: 'Rini University (golf) — 5 events · 1 error in the last 48h',
              severity: 'warning',
              lastActivityDate: '2026-09-02',
              threadHref: '/admin/thread/team/t1',
            },
          ],
        })}
      />,
    );
    expect(screen.getByText(/Rini University \(golf\)/)).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
  });
});
