// @vitest-environment jsdom
//
// Regression guard for the confirmed player-affordance leak: the desktop
// calendar header used to be built with `onAddEvent={handleAddEvent}`
// UNCONDITIONALLY, so a signed-in PLAYER saw a live, primary-styled
// "+ Add Event" CTA on the desktop calendar even though only coaches may
// create events (`createBaseballEvent`/`createGolfEvent` are capability-
// gated server-side). Every other call site in this file already gated on
// `isCoach` (mobile day view `:1249`, mobile FAB `:1444`) — only the desktop
// header (`:1153`) didn't. This test renders the real desktop header
// (`CalendarHeader` → `PageHeader` `variant="calendar"`, unmocked) so the
// assertion exercises the actual DOM the player would see, not a mocked
// stand-in.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Lightweight stand-ins for everything EXCEPT the header under test — mirrors
// the "stub the heavy neighbors, render the real thing you're testing"
// strategy already used for this shared component in
// BaseballCalendarWrapper.rsvp-routing.test.tsx.
// ---------------------------------------------------------------------------

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/hooks/use-mobile-detection', () => ({
  useMobileDetection: () => ({
    isMobile: false,
    isTablet: false,
    isTouch: false,
    isMobileDevice: false,
    screenWidth: 1440,
    screenHeight: 900,
    orientation: 'landscape',
    preferMobileUI: false,
    setPreferMobileUI: vi.fn(),
    togglePreferMobileUI: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => false, // desktop viewport
}));

vi.mock('@/hooks/golf/use-calendar-range-events', () => ({
  useCalendarRangeEvents: () => ({
    events: [],
    isLoadingRange: false,
    rangeError: null,
    retryRange: vi.fn(),
  }),
}));

vi.mock('@/hooks/useRSVP', () => ({
  usePlayerEventRSVP: () => ({ status: null, respondedAt: null, isLoading: false, error: null }),
  useEventRSVP: () => ({ rsvpSummary: null, isLoading: false, error: null }),
}));

vi.mock('@/components/golf/calendar/NotificationCenter', () => ({
  NotificationCenter: () => <div data-testid="notification-center-stub" />,
}));

vi.mock('@/components/golf/calendar/CalendarAvatarSidebar', () => ({
  CalendarAvatarSidebar: () => <div data-testid="avatar-sidebar-stub" />,
  PLAYER_COLORS: [{ bg: '#000', light: '#000', border: '#000', name: 'Stub' }],
}));

vi.mock('@/components/golf/calendar/EventCard', () => ({
  EventCard: () => null,
}));

// Import AFTER mocks are registered.
import { PremiumCalendarClient } from '@/components/golf/calendar/PremiumCalendarClient';

function renderCalendar(isCoach: boolean) {
  return render(
    <PremiumCalendarClient
      initialEvents={[]}
      teamMembers={[]}
      isCoach={isCoach}
      teamId="team-1"
      capabilities={{ recurring: false, rsvpRead: false, availability: false, rsvpWrite: false }}
    />,
  );
}

describe('PremiumCalendarClient — desktop "Add Event" role gating', () => {
  it('shows the coach a live "Add Event" button on the desktop header', () => {
    renderCalendar(true);
    expect(screen.getByRole('button', { name: /add event/i })).toBeInTheDocument();
  });

  it('does NOT show a player any "Add Event" affordance on the desktop header', () => {
    renderCalendar(false);
    expect(screen.queryByRole('button', { name: /add event/i })).not.toBeInTheDocument();
  });
});
