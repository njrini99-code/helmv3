import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Mock next/navigation for PatternsDashboardClient.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Stub the big PatternDashboard render tree so this test only exercises the
// prop-sync behaviour we added in Task C10.
vi.mock('@/components/golf/coachhelm/patterns', () => ({
  PatternDashboard: ({ patterns }: { patterns: Array<{ id: string; name?: string }> }) => (
    <div data-testid="pattern-dashboard">
      {patterns.map((p) => (
        <div key={p.id} data-testid="pattern-row">{p.id}</div>
      ))}
    </div>
  ),
}));

// LargeTitleHeader is heavy and not relevant here.
vi.mock('@/components/golf/layout/LargeTitleHeader', () => ({
  LargeTitleHeader: ({ children }: { children?: React.ReactNode }) => <header>{children}</header>,
}));

import { PatternsDashboardClient } from '@/app/golf/(dashboard)/dashboard/patterns/PatternsDashboardClient';

describe('PatternsDashboardClient — prop sync', () => {
  it('updates rendered pattern list when initialPatterns prop changes', () => {
    const { rerender } = render(
      <PatternsDashboardClient initialPatterns={[{ id: 'p-1' } as never]} />,
    );
    expect(screen.getAllByTestId('pattern-row')).toHaveLength(1);
    expect(screen.getByText('p-1')).toBeInTheDocument();

    rerender(
      <PatternsDashboardClient initialPatterns={[{ id: 'p-1' }, { id: 'p-2' }] as never[]} />,
    );
    expect(screen.getAllByTestId('pattern-row')).toHaveLength(2);
    expect(screen.getByText('p-2')).toBeInTheDocument();

    cleanup();
  });
});
