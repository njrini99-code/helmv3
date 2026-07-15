import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

// ─────────────────────────────────────────────────────────────────────────────
// #485 REGRESSION GUARD
//
// The defect: CalendarFairway's outer shell derived its height from a flat,
// hand-guessed `h-[calc(100vh-5.5rem-...)]` that predated the current
// AppShell chrome (sticky glass top bar + a coach-only Team-hub sub-nav strip)
// and never matched either — producing double-scroll / dead space on mobile.
//
// This test never renders the heavy children (BaseballCalendarWrapper →
// PremiumCalendarClient, the Living-Annual kit) — it stubs them so it
// exercises ONLY the outer shell wrapper's className, the actual #485
// surface, the same way BaseballCalendarWrapper.rsvp-routing.test.tsx stubs
// PremiumCalendarClient to isolate the wrapper's own prop-injection logic.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/components/baseball/calendar/BaseballCalendarWrapper', () => ({
  BaseballCalendarWrapper: () => null,
}));
vi.mock('@/components/baseball/living-annual', () => ({
  SectionMasthead: () => null,
  EditorsLetter: () => null,
  InkBadge: () => null,
  LiveDot: () => null,
}));
vi.mock('@/components/fairway', () => ({
  Button: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// Import AFTER mocks are registered.
import { CalendarFairway, type CalendarFairwayProps } from '@/components/baseball/calendar/CalendarFairway';

function renderShell(overrides: Partial<CalendarFairwayProps> = {}): HTMLElement {
  const { container } = render(
    <CalendarFairway
      recruitingEmpty={false}
      noTeamEmpty={false}
      events={[]}
      teamMembers={[]}
      teamId="team-1"
      isCoach={false}
      upcomingEvents={0}
      eventTypeCounts={{}}
      {...overrides}
    />,
  );
  return container.firstElementChild as HTMLElement;
}

describe('CalendarFairway — #485 shell height regression', () => {
  it('never reintroduces the flat 100vh guess', () => {
    expect(renderShell().className).not.toContain('100vh');
  });

  it('uses 100dvh (not 100vh) so the mobile Safari dynamic toolbar cannot leave a dead-space/double-scroll sliver', () => {
    expect(renderShell().className).toContain('h-[calc(100dvh-');
  });

  it('subtracts the shared AppShell top-bar offset var instead of a hardcoded rem guess', () => {
    expect(renderShell().className).toContain('var(--golf-mobile-header-offset)');
  });

  it('subtracts the coach-only Team-hub sub-nav row height only when the viewer is a coach', () => {
    expect(renderShell({ isCoach: true }).className).toContain('45px');
    expect(renderShell({ isCoach: false }).className).not.toContain('45px');
  });

  it('mirrors AppShell bottom-nav clearance (2rem + 56px bottom-bar + safe-area-inset-bottom on mobile)', () => {
    expect(renderShell().className).toContain('(2rem+56px+env(safe-area-inset-bottom,0px))');
  });

  it('drops the 56px mobile bottom-bar term at md: (desktop has no bottom-tab bar)', () => {
    const className = renderShell().className;
    expect(className).toContain('md:h-[calc(100dvh-var(--golf-mobile-header-offset)-(2rem+env(safe-area-inset-bottom,0px)))]');
  });

  it('applies the identical shell height across the recruiting-empty, no-team-empty, and main render branches', () => {
    const main = renderShell({ isCoach: true });
    const recruiting = renderShell({ isCoach: true, recruitingEmpty: true });
    const noTeam = renderShell({ isCoach: true, noTeamEmpty: true, recruitingEmpty: false });
    expect(recruiting.className).toBe(main.className);
    expect(noTeam.className).toBe(main.className);
  });
});
