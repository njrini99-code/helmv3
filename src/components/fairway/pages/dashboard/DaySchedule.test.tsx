// @vitest-environment jsdom
/**
 * ============================================================================
 * DaySchedule — replaces ActionItemsPanel/PlayerActionCenter on both home
 * dashboards with an honest today+upcoming agenda.
 * ----------------------------------------------------------------------------
 * Uses the REAL system clock (no fake timers) — same convention as
 * FairwayTasks.render.test.tsx / the former FairwayCoachDashboard date-parity
 * suite — so day-bucketing ("Today" / "Tomorrow" / a dated later-group) is
 * exercised against genuine relative dates instead of a date that eventually
 * goes stale. `timezone` is intentionally omitted in every test so grouping
 * runs against the SAME local clock the fixtures are built from.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { DaySchedule, type DayScheduleEvent } from './DaySchedule';

function isoAt(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function event(overrides: Partial<DayScheduleEvent> & Pick<DayScheduleEvent, 'id' | 'title' | 'start_time'>): DayScheduleEvent {
  return {
    event_type: 'practice',
    end_time: null,
    location: null,
    ...overrides,
  };
}

describe('DaySchedule — honest empty state', () => {
  it('shows "Nothing scheduled" (no fake flat content) when there are no events at all', () => {
    render(<DaySchedule events={[]} />);
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('never shows the empty state when at least one event exists', () => {
    render(
      <DaySchedule
        events={[event({ id: 'e1', title: 'Team practice', start_time: isoAt(0, 14) })]}
      />,
    );
    expect(screen.queryByText('Nothing scheduled')).not.toBeInTheDocument();
    expect(screen.getByText('Team practice')).toBeInTheDocument();
  });
});

describe('DaySchedule — day grouping', () => {
  it('groups a today event under "Today" and a tomorrow event under "Tomorrow"', () => {
    render(
      <DaySchedule
        events={[
          event({ id: 'today-1', title: 'Morning practice', start_time: isoAt(0, 9) }),
          event({ id: 'tomorrow-1', title: 'Qualifier round', start_time: isoAt(1, 8), event_type: 'qualifier' }),
        ]}
      />,
    );

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow')).toBeInTheDocument();
    expect(screen.getByText('Morning practice')).toBeInTheDocument();
    expect(screen.getByText('Qualifier round')).toBeInTheDocument();
  });

  it('renders a real dated label (not "Tomorrow") for an event 3+ days out', () => {
    render(
      <DaySchedule
        events={[event({ id: 'later-1', title: 'Conference tournament', start_time: isoAt(4, 10), event_type: 'tournament' })]}
      />,
    );
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
    expect(screen.queryByText('Tomorrow')).not.toBeInTheDocument();
    expect(screen.getByText('Conference tournament')).toBeInTheDocument();
  });

  it('sorts events within a day by start time', () => {
    render(
      <DaySchedule
        events={[
          event({ id: 'later-today', title: 'Afternoon session', start_time: isoAt(0, 16) }),
          event({ id: 'earlier-today', title: 'Morning session', start_time: isoAt(0, 7) }),
        ]}
      />,
    );
    const rows = screen.getAllByText(/session$/);
    expect(rows[0]).toHaveTextContent('Morning session');
    expect(rows[1]).toHaveTextContent('Afternoon session');
  });
});

describe('DaySchedule — row content', () => {
  it('renders a type badge and location alongside the title', () => {
    render(
      <DaySchedule
        events={[
          event({
            id: 'e1',
            title: 'Away match',
            start_time: isoAt(0, 13),
            event_type: 'tournament',
            location: 'Pinehurst No. 2',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Away match')).toBeInTheDocument();
    expect(screen.getByText('Tournament')).toBeInTheDocument();
    expect(screen.getByText('Pinehurst No. 2')).toBeInTheDocument();
  });

  it('falls back to a generic "Event" badge for an unrecognized event_type, never a blank badge', () => {
    render(
      <DaySchedule
        events={[event({ id: 'e1', title: 'TBD session', start_time: isoAt(0, 12), event_type: 'mystery_type' })]}
      />,
    );
    expect(screen.getByText('Event')).toBeInTheDocument();
  });
});

describe('DaySchedule — load error is distinct from a clear schedule', () => {
  it('shows a degraded notice, never the cheerful empty state, when loadError is set', () => {
    render(<DaySchedule events={[]} loadError />);
    expect(screen.getByText(/couldn.t load the schedule/i)).toBeInTheDocument();
    expect(screen.queryByText('Nothing scheduled')).not.toBeInTheDocument();
  });
});

describe('DaySchedule — header', () => {
  it('renders a "Calendar" link when viewAllHref is provided', () => {
    render(
      <DaySchedule
        events={[event({ id: 'e1', title: 'Practice', start_time: isoAt(0, 9) })]}
        viewAllHref="/golf/dashboard/calendar"
      />,
    );
    const link = screen.getByRole('link', { name: /calendar/i });
    expect(link).toHaveAttribute('href', '/golf/dashboard/calendar');
  });

  it('renders no header link when viewAllHref is omitted', () => {
    render(<DaySchedule events={[event({ id: 'e1', title: 'Practice', start_time: isoAt(0, 9) })]} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('accepts a custom title/subtitle (player vs coach copy)', () => {
    render(
      <DaySchedule
        events={[]}
        title="Your schedule"
        subtitle="Today & upcoming"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Your schedule' })).toBeInTheDocument();
  });
});

describe('DaySchedule — containment (never a floating/overflowing agenda)', () => {
  it('wraps the scrollable list in an overflow-y-auto, height-capped container', () => {
    const { container } = render(
      <DaySchedule events={[event({ id: 'e1', title: 'Practice', start_time: isoAt(0, 9) })]} />,
    );
    const list = within(container).getByRole('list', { name: /day groups/i });
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/max-h-\[/);
  });
});
