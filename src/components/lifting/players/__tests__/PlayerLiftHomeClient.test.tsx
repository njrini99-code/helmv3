// =============================================================================
// PlayerLiftHomeClient — basePath link-wiring regression tests.
//
// Before the fix, every Link on this shared component (readiness check-in,
// today's session, upcoming/recent session cards) was hardcoded to
// '/lifting/dashboard/...', so BaseballHelm players (rendered via
// /baseball/dashboard/lift) were bounced into the sibling Lifting Lab
// product's login gate. This component must build every href off the
// caller-supplied `basePath` prop instead.
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

import { PlayerLiftHomeClient } from '../PlayerLiftHomeClient';
import type { HelmLiftingSessionRow } from '@/lib/types';

// Override the default vi.fn() IntersectionObserver with a real class — next/link's
// prefetch calls `new IntersectionObserver(...)`, and arrow-function mocks aren't
// constructable (mirrors src/test/golf/components/CoachInsightCard.test.tsx).
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

function makeSession(overrides: Partial<HelmLiftingSessionRow> = {}): HelmLiftingSessionRow {
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
    status: 'assigned',
    started_at: null,
    completed_at: null,
    readiness_checkin_id: null,
    coach_review_status: 'none',
    player_note: null,
    coach_note: null,
    legacy_baseball_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PlayerLiftHomeClient — basePath link wiring', () => {
  it('builds the readiness check-in link off the baseball basePath, not a hardcoded /lifting path', () => {
    render(
      <PlayerLiftHomeClient
        upcoming={[]}
        recent={[]}
        readinessSubmittedToday={false}
        basePath="/baseball/dashboard"
      />,
    );

    const checkInLink = screen.getByRole('link', { name: 'Check in' });
    expect(checkInLink).toHaveAttribute('href', '/baseball/dashboard/readiness');
  });

  it("builds today's session link off the baseball basePath", () => {
    const today = new Date().toISOString().slice(0, 10);
    render(
      <PlayerLiftHomeClient
        upcoming={[makeSession({ id: 'sess-today', scheduled_date: today })]}
        recent={[]}
        readinessSubmittedToday
        basePath="/baseball/dashboard"
      />,
    );

    const startLink = screen.getByRole('link', { name: 'Start' });
    expect(startLink).toHaveAttribute('href', '/baseball/dashboard/lift/sess-today');
  });

  it('still builds /lifting/dashboard links when the Lifting Lab caller passes that basePath', () => {
    const today = new Date().toISOString().slice(0, 10);
    render(
      <PlayerLiftHomeClient
        upcoming={[makeSession({ id: 'sess-today', scheduled_date: today })]}
        recent={[]}
        readinessSubmittedToday={false}
        basePath="/lifting/dashboard"
      />,
    );

    expect(screen.getByRole('link', { name: 'Check in' })).toHaveAttribute(
      'href',
      '/lifting/dashboard/readiness',
    );
    expect(screen.getByRole('link', { name: 'Start' })).toHaveAttribute(
      'href',
      '/lifting/dashboard/lift/sess-today',
    );
  });
});
