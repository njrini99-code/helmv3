import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/admin/require-super-admin', () => ({
  requireSuperAdmin: vi.fn(async () => ({ userId: 'admin-1' })),
}));

vi.mock('@/lib/admin/data/users', () => ({
  fetchUsersTab: vi.fn(async () => ({
    users: [],
    atRisk: [],
    teams: [
      {
        sport: 'baseball',
        teamId: 'team-1',
        name: 'Demo Baseball',
        playerCount: 1,
        lastActivity: '2026-07-04T12:00:00.000Z',
        health: 'active',
        errors7d: 0,
        players: [
          {
            sport: 'baseball',
            teamId: 'team-1',
            playerId: 'player-1',
            userId: 'user-1',
            href: '/admin/users/user-1',
            name: 'Ben Demo',
            email: 'ben@example.com',
            jerseyNumber: 7,
            position: 'SS',
            status: 'active',
            lastSeen: '2026-07-04T12:00:00.000Z',
            activity30d: 3,
            lastActivity: '2026-07-04T12:00:00.000Z',
            errors7d: 0,
            profileQuality: 'complete',
            detail: '100% profile',
          },
        ],
        activePlayers: 1,
        attentionPlayers: 0,
        profileGaps: 0,
      },
    ],
  })),
}));

vi.mock('@/lib/admin/data/errors', () => ({
  fetchErrorsTab: vi.fn(async () => ({
    sentry: { status: 'unconfigured' },
    hourly: { status: 'unconfigured' },
    deployments: { status: 'unconfigured' },
    deployMarkers: [],
    incidents: [],
    rlsDenials24h: 0,
  })),
}));

// bridge-baseball-rollup-parity: fetchBaseballTab() is the new sport-specific
// engine rollup (games trend + Lift Lab) wired into BaseballBody.
vi.mock('@/lib/admin/data/baseball', () => ({
  fetchBaseballTab: vi.fn(async () => ({
    games: {
      gamesThisWeek: 2,
      gamesLastWeek: 1,
      gamesToday: 0,
      completedGames30d: 3,
      lastGameAt: '2026-07-04',
      gamesByWeek: [{ week: '2026-06-29', count: 2 }],
    },
    liftLab: { sessions30d: 5, activeAthletes30d: 2 },
  })),
}));

// Only fetchFeatureHealth touches Supabase (user-scoped RPC) — keep
// summarizeFeatureHealth (pure) real so the app='baseballhelm' filter path
// is exercised for real.
vi.mock('@/lib/admin/data/feature-health', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin/data/feature-health')>();
  return {
    ...actual,
    fetchFeatureHealth: vi.fn(async () => ({
      features: [],
      generatedAt: '2026-07-04T12:00:00.000Z',
      degraded: false,
    })),
  };
});

import BaseballTabPage from '@/app/admin/baseball/page';

/**
 * AppShell (src/components/fairway/app-shell/AppShell.tsx) already renders
 * the page's <main> landmark and supplies its own padding. This page must
 * not nest a second <main> inside it — that duplicates the ARIA landmark
 * and double-pads the content (fixed across every other admin tab in
 * 190364b00; baseball/page.tsx was the one straggler).
 */
describe('AdminBaseballPage', () => {
  it('does not render a nested <main> landmark', async () => {
    const element = await BaseballTabPage();
    render(element);
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByText(/baseball tab is held/i)).not.toBeInTheDocument();
  });
});
