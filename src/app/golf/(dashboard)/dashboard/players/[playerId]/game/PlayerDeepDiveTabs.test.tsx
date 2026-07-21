// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerDeepDiveTabs } from './PlayerDeepDiveTabs';

let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
}));

vi.mock('@/components/fairway/pages/player-game', () => ({
  FairwayPlayerGameFingerprint: () => <div data-testid="fingerprint-view" />,
}));

vi.mock('@/components/fairway/pages/coachhelm/CoachHelmShell', () => ({
  CoachHelmShell: ({ children, embedded }: { children: React.ReactNode; embedded?: boolean }) => (
    <div data-testid="coachhelm-shell" data-embedded={embedded ? 'true' : 'false'}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/fairway/pages/coachhelm/FairwayPlayerInsight', () => ({
  FairwayPlayerInsight: () => <div data-testid="scouting-view" />,
}));

const props = {
  fingerprint: {
    player: { id: 'player-1', first_name: 'Cole', last_name: 'Bennett' },
  },
  insight: {
    player: { first_name: 'Cole', last_name: 'Bennett' },
    signalCount: 2,
  },
} as unknown as React.ComponentProps<typeof PlayerDeepDiveTabs>;

describe('PlayerDeepDiveTabs', () => {
  beforeEach(() => {
    params = new URLSearchParams();
    window.history.replaceState({}, '', '/golf/dashboard/players/player-1/game');
  });

  it('uses one embedded leaf shell instead of the stale nested Brief chrome', () => {
    render(<PlayerDeepDiveTabs {...props} />);

    expect(screen.getByTestId('coachhelm-shell')).toHaveAttribute('data-embedded', 'true');
    expect(screen.getByTestId('fingerprint-view')).toBeInTheDocument();
  });

  it('switches to the scouting report immediately with a shallow URL update', () => {
    render(<PlayerDeepDiveTabs {...props} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Scouting Report' }));

    expect(screen.getByTestId('scouting-view')).toBeInTheDocument();
    expect(window.location.search).toBe('?tab=scouting');
  });
});
