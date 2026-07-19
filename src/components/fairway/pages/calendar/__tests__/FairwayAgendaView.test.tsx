/**
 * FairwayAgendaView — anchor-to-today scroll (mustFix #3: "the event list
 * skips to an event 6 weeks in the past"). Range mode's window spans months
 * back and forward with no anchor, so the DOM's natural scroll position was
 * simply the top of the list — the oldest bucket in range. This regresses
 * that: opening/navigating the agenda must scroll the first at/after-today
 * bucket into view instead of leaving the viewport on stale history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayAgendaView } from '../FairwayAgendaView';

function makeEvent(id: string, startIso: string, title = `Event ${id}`): CalendarEvent {
  return {
    id,
    team_id: 'team-1',
    title,
    event_type: 'practice',
    start_date: startIso,
    end_date: startIso,
    start_time: startIso,
    end_time: startIso,
    location: null,
    description: null,
  } as CalendarEvent;
}

const NOW = new Date('2026-07-16T12:00:00');

describe('FairwayAgendaView — anchor scroll', () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewMock = vi.fn();
    // jsdom doesn't implement scrollIntoView at all — stub it so the
    // component's real guard (`typeof node.scrollIntoView === 'function'`)
    // takes the "call it" branch, and so we can assert on WHICH section it
    // targeted.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });
  });

  it('scrolls the today-or-later bucket into view, past a six-week-old stale bucket', () => {
    const sixWeeksAgo = new Date('2026-06-04T09:00:00'); // ~6 weeks before NOW
    const events = [
      makeEvent('stale', sixWeeksAgo.toISOString(), 'Old Practice'),
      makeEvent('today', new Date('2026-07-16T15:00:00').toISOString(), 'Today Practice'),
      makeEvent('future', new Date('2026-07-20T09:00:00').toISOString(), 'Upcoming Tournament'),
    ];

    render(
      <FairwayAgendaView
        events={events}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date('2026-04-16T00:00:00')}
        rangeEnd={new Date('2026-10-16T00:00:00')}
        isCoach
        nowRef={NOW}
      />,
    );

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
    // The scrolled-to section is the "Today" bucket, not the stale one.
    const scrolledSection = scrollIntoViewMock.mock.instances[0] as unknown as HTMLElement;
    expect(scrolledSection.getAttribute('aria-label')).toBe('Today');
  });

  it('does not scroll for single-day mode', () => {
    render(
      <FairwayAgendaView
        events={[makeEvent('a', NOW.toISOString())]}
        mode="day"
        focusDate={NOW}
        isCoach
        nowRef={NOW}
      />,
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('does not scroll when every event in range is in the past (honest-empty all-past demo)', () => {
    const events = [makeEvent('old', new Date('2026-06-04T09:00:00').toISOString())];
    render(
      <FairwayAgendaView
        events={events}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date('2026-04-16T00:00:00')}
        rangeEnd={new Date('2026-07-01T00:00:00')}
        isCoach
        nowRef={NOW}
      />,
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('does not re-scroll on a data-only refresh of the same navigation range', () => {
    const events = [
      makeEvent('today', new Date('2026-07-16T15:00:00').toISOString()),
    ];
    const { rerender } = render(
      <FairwayAgendaView
        events={events}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date('2026-04-16T00:00:00')}
        rangeEnd={new Date('2026-10-16T00:00:00')}
        isCoach
        nowRef={NOW}
      />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    // Same nav range (mode/focusDate/rangeStart/rangeEnd unchanged), just a
    // new events array (e.g. a realtime refetch) — must NOT yank the scroll
    // position again mid-read.
    rerender(
      <FairwayAgendaView
        events={[...events, makeEvent('new', new Date('2026-07-17T09:00:00').toISOString())]}
        mode="range"
        focusDate={NOW}
        rangeStart={new Date('2026-04-16T00:00:00')}
        rangeEnd={new Date('2026-10-16T00:00:00')}
        isCoach
        nowRef={NOW}
      />,
    );
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });
});
