import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TodayEvent } from '@/app/golf/actions/dashboard-data';

// Mock scrollTo for jsdom
Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  useReducedMotion: () => false,
  m: {
    div: ({
      children,
      className,
      style,
      ...rest
    }: {
      children?: React.ReactNode;
      className?: string;
      style?: React.CSSProperties;
      [key: string]: unknown;
    }) => (
      <div className={className} style={style} data-testid={rest['data-testid'] as string}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

// Mock icon components
vi.mock('@/components/icons', () => ({
  IconCalendar: () => <span data-testid="icon-calendar" />,
  IconMapPin: () => <span data-testid="icon-map-pin" />,
  IconClock: () => <span data-testid="icon-clock" />,
  IconArrowRight: () => <span data-testid="icon-arrow-right" />,
}));

import { TodayTimeline } from '../today-timeline';

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<TodayEvent> = {}): TodayEvent {
  const now = new Date();
  const startTime = new Date(now);
  startTime.setHours(10, 0, 0, 0);
  const endTime = new Date(now);
  endTime.setHours(12, 0, 0, 0);

  return {
    id: 'evt-1',
    title: 'Morning Practice',
    event_type: 'practice',
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    location: 'Practice Facility',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TodayTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================================================
  // Empty state
  // ========================================================================
  describe('empty state', () => {
    it('renders empty state message when no events', () => {
      render(<TodayTimeline events={[]} role="coach" />);
      expect(screen.getByText('Clear schedule today')).toBeInTheDocument();
    });

    // TODO(user-wip): un-skip after a11y / design-token sweep. See src/test/SKIPPED.md.
    it.skip('shows suggestion text for empty schedule', () => {
      render(<TodayTimeline events={[]} role="player" />);
      expect(screen.getByText(/No events scheduled/)).toBeInTheDocument();
    });

    it('renders calendar link in empty state', () => {
      render(<TodayTimeline events={[]} role="coach" />);
      expect(screen.getByText('View Full Calendar')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Single event
  // ========================================================================
  describe('single event', () => {
    it('renders event title', () => {
      render(<TodayTimeline events={[makeEvent()]} role="coach" />);
      expect(screen.getAllByText('Morning Practice').length).toBeGreaterThan(0);
    });

    it('renders event type badge', () => {
      render(<TodayTimeline events={[makeEvent()]} role="coach" />);
      expect(screen.getAllByText('Practice').length).toBeGreaterThan(0);
    });

    it('renders event location', () => {
      render(<TodayTimeline events={[makeEvent()]} role="coach" />);
      expect(screen.getAllByText('Practice Facility').length).toBeGreaterThan(0);
    });

    it('shows event count badge', () => {
      render(<TodayTimeline events={[makeEvent()]} role="coach" />);
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('renders header with "Today\'s Schedule"', () => {
      render(<TodayTimeline events={[makeEvent()]} role="coach" />);
      expect(screen.getByText("Today's Schedule")).toBeInTheDocument();
    });

    it('renders calendar link in header', () => {
      render(<TodayTimeline events={[makeEvent()]} role="coach" />);
      expect(screen.getByText('Calendar')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Multiple / overlapping events
  // ========================================================================
  describe('multiple events', () => {
    it('renders all events', () => {
      const events = [
        makeEvent({ id: '1', title: 'Morning Session' }),
        makeEvent({ id: '2', title: 'Afternoon Round', event_type: 'tournament' }),
      ];
      render(<TodayTimeline events={events} role="coach" />);
      expect(screen.getAllByText('Morning Session').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Afternoon Round').length).toBeGreaterThan(0);
    });

    it('shows correct event count for multiple events', () => {
      const events = [
        makeEvent({ id: '1', title: 'A' }),
        makeEvent({ id: '2', title: 'B' }),
        makeEvent({ id: '3', title: 'C' }),
      ];
      render(<TodayTimeline events={events} role="coach" />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('handles overlapping events (same start time)', () => {
      const now = new Date();
      const start = new Date(now);
      start.setHours(9, 0, 0, 0);
      const end = new Date(now);
      end.setHours(11, 0, 0, 0);

      const events = [
        makeEvent({ id: '1', title: 'Event A', start_time: start.toISOString(), end_time: end.toISOString() }),
        makeEvent({ id: '2', title: 'Event B', start_time: start.toISOString(), end_time: end.toISOString() }),
      ];
      render(<TodayTimeline events={events} role="coach" />);
      expect(screen.getAllByText('Event A').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Event B').length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Coach vs Player RSVP display
  // ========================================================================
  describe('RSVP display', () => {
    it('shows RSVP count for coach role', () => {
      const event = makeEvent({ rsvp_yes: 8, rsvp_total: 12 });
      render(<TodayTimeline events={[event]} role="coach" />);
      expect(screen.getAllByText('8/12 confirmed').length).toBeGreaterThan(0);
    });

    it('does not show RSVP count for player role', () => {
      const event = makeEvent({ rsvp_yes: 8, rsvp_total: 12 });
      render(<TodayTimeline events={[event]} role="player" />);
      expect(screen.queryByText('8/12 confirmed')).not.toBeInTheDocument();
    });
  });

  // ========================================================================
  // Event types
  // ========================================================================
  describe('event type labels', () => {
    it('maps tournament event type correctly', () => {
      render(<TodayTimeline events={[makeEvent({ event_type: 'tournament' })]} role="coach" />);
      expect(screen.getAllByText('Tournament').length).toBeGreaterThan(0);
    });

    it('maps qualifier event type correctly', () => {
      render(<TodayTimeline events={[makeEvent({ event_type: 'qualifier' })]} role="coach" />);
      expect(screen.getAllByText('Qualifier').length).toBeGreaterThan(0);
    });

    it('maps unknown event type to "Event"', () => {
      render(<TodayTimeline events={[makeEvent({ event_type: 'unknown_type' })]} role="coach" />);
      expect(screen.getAllByText('Event').length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Null end_time
  // ========================================================================
  describe('null end_time', () => {
    it('renders event with null end_time without crashing', () => {
      render(<TodayTimeline events={[makeEvent({ end_time: null })]} role="coach" />);
      expect(screen.getAllByText('Morning Practice').length).toBeGreaterThan(0);
    });
  });

  // ========================================================================
  // Null location
  // ========================================================================
  describe('null location', () => {
    it('does not render location when null', () => {
      render(<TodayTimeline events={[makeEvent({ location: null })]} role="coach" />);
      expect(screen.queryByText('Practice Facility')).not.toBeInTheDocument();
    });
  });
});
