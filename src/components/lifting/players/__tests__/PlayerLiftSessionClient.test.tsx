// =============================================================================
// PlayerLiftSessionClient — basePath link-wiring regression test.
//
// Before the fix, every Link on this component (BackLink, the readiness-gate
// "Check in" CTA, and the post-completion "Back to Lift" CTA) was hardcoded
// to '/lifting/dashboard/...'. Its sibling PlayerLiftHomeClient documents and
// implements a `basePath` prop so shared Lift Lab components never leak
// navigation into the sibling product's route tree — but this component had
// no such prop, so a BaseballHelm player tapping any of these three links on
// /baseball/dashboard/lift/[sessionId] (the highest-frequency mobile screen)
// was bounced into the Lifting Lab product's own route tree. Mirrors
// PlayerLiftHomeClient.test.tsx's coverage pattern.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('framer-motion', async () => {
  const ReactMod = await import('react');
  return {
    useReducedMotion: () => true,
    motion: new Proxy(
      {},
      {
        get: (_target, prop) =>
          ReactMod.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
            const { children, initial: _i, animate: _a, exit: _e, transition: _t, ...rest } = props;
            void _i; void _a; void _e; void _t;
            return ReactMod.createElement(prop as string, { ...rest, ref }, children as React.ReactNode);
          }),
      },
    ),
  };
});

vi.mock('@/app/lifting/actions/player-sessions', () => ({
  startMySession: vi.fn(async () => ({ success: true })),
  logMySetResult: vi.fn(async () => ({ success: true })),
  completeMySession: vi.fn(async () => ({ success: true })),
}));

import { PlayerLiftSessionClient } from '../PlayerLiftSessionClient';
import type { HelmLiftingSessionWithExercises } from '@/lib/types';

// Override the default vi.fn() IntersectionObserver with a real class — next/link's
// prefetch calls `new IntersectionObserver(...)`, and arrow-function mocks aren't
// constructable (mirrors PlayerLiftHomeClient.test.tsx / CoachInsightCard.test.tsx).
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = '';
  thresholds = [];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IntersectionObserver = MockIntersectionObserver;

function makeSession(
  overrides: Partial<HelmLiftingSessionWithExercises> = {},
): HelmLiftingSessionWithExercises {
  return {
    id: 'session-1',
    program_assignment_id: null,
    organization_id: 'org-1',
    sport: 'baseball',
    team_id: 'team-1',
    athlete_id: 'athlete-1',
    title: 'Upper Body',
    day_type: null,
    sport_context: null,
    scheduled_date: '2026-07-10',
    estimated_minutes: 45,
    status: 'started',
    started_at: '2026-07-10T00:00:00.000Z',
    completed_at: null,
    readiness_checkin_id: null,
    coach_review_status: 'none',
    player_note: null,
    coach_note: null,
    legacy_baseball_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    exercises: [],
    ...overrides,
  };
}

describe('PlayerLiftSessionClient — basePath link wiring', () => {
  it('builds the BackLink and readiness-gate link off the baseball basePath, not a hardcoded /lifting path', () => {
    render(
      <PlayerLiftSessionClient
        session={makeSession()}
        athleteId="athlete-1"
        readinessSubmittedToday={false}
        basePath="/baseball/dashboard"
      />,
    );

    expect(screen.getByRole('link', { name: /Back to Lift/i })).toHaveAttribute(
      'href',
      '/baseball/dashboard/lift',
    );
    expect(screen.getByRole('link', { name: 'Check in' })).toHaveAttribute(
      'href',
      '/baseball/dashboard/readiness',
    );
  });

  it('builds the post-completion "Back to Lift" link off the baseball basePath', () => {
    render(
      <PlayerLiftSessionClient
        session={makeSession({ status: 'completed', completed_at: '2026-07-10T01:00:00.000Z' })}
        athleteId="athlete-1"
        readinessSubmittedToday
        basePath="/baseball/dashboard"
      />,
    );

    const backToLiftLinks = screen.getAllByRole('link', { name: /Back to Lift/i });
    for (const link of backToLiftLinks) {
      expect(link).toHaveAttribute('href', '/baseball/dashboard/lift');
    }
  });

  it('still builds /lifting/dashboard links when the Lifting Lab caller passes that basePath', () => {
    render(
      <PlayerLiftSessionClient
        session={makeSession()}
        athleteId="athlete-1"
        readinessSubmittedToday={false}
        basePath="/lifting/dashboard"
      />,
    );

    expect(screen.getByRole('link', { name: /Back to Lift/i })).toHaveAttribute(
      'href',
      '/lifting/dashboard/lift',
    );
    expect(screen.getByRole('link', { name: 'Check in' })).toHaveAttribute(
      'href',
      '/lifting/dashboard/readiness',
    );
  });

  it('strips a trailing slash from basePath before building links', () => {
    render(
      <PlayerLiftSessionClient
        session={makeSession()}
        athleteId="athlete-1"
        readinessSubmittedToday={false}
        basePath="/baseball/dashboard/"
      />,
    );

    expect(screen.getByRole('link', { name: /Back to Lift/i })).toHaveAttribute(
      'href',
      '/baseball/dashboard/lift',
    );
  });
});
