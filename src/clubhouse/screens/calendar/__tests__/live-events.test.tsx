// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/calendar' }));

import { PREVIEW_LIVE, PREVIEW_LIVE_EMPTY, PREVIEW_LIVE_NOW } from '../../../preview/fixtures-live';
import { CalendarLiveProvider, EventLiveDot, EventLiveRow, liveLanesForEvent } from '../live-events';
import type { ChCalEvent } from '../model';

afterEach(cleanup);

const ev = (over: Partial<ChCalEvent>): ChCalEvent => ({ id: 'e1', type: 'qualifier', title: 'Qualifier', date: '2026-10-14', cancelled: false, courseId: null, ...over }) as ChCalEvent;

describe('liveLanesForEvent', () => {
  it('counts the players on the course who are playing this kind of round that day', () => {
    // Sofia, Mateo and Priya report in the last ten minutes; Ellis (14 min) and Noor have gone quiet; Jonah is practice.
    expect(liveLanesForEvent(ev({}), PREVIEW_LIVE.lanes, PREVIEW_LIVE_NOW)).toHaveLength(3);
    expect(liveLanesForEvent(ev({ type: 'practice' }), PREVIEW_LIVE.lanes, PREVIEW_LIVE_NOW)).toHaveLength(1);
  });

  it('matches the course only when both name one', () => {
    expect(liveLanesForEvent(ev({ courseId: 'c-pine' }), PREVIEW_LIVE.lanes, PREVIEW_LIVE_NOW)).toHaveLength(3);
    expect(liveLanesForEvent(ev({ courseId: 'c-other' }), PREVIEW_LIVE.lanes, PREVIEW_LIVE_NOW)).toHaveLength(0);
  });

  it('is empty for another day, a cancelled event, and a kind nobody scores on', () => {
    expect(liveLanesForEvent(ev({ date: '2026-10-15' }), PREVIEW_LIVE.lanes, PREVIEW_LIVE_NOW)).toHaveLength(0);
    expect(liveLanesForEvent(ev({ cancelled: true }), PREVIEW_LIVE.lanes, PREVIEW_LIVE_NOW)).toHaveLength(0);
    expect(liveLanesForEvent(ev({ type: 'meeting' }), PREVIEW_LIVE.lanes, PREVIEW_LIVE_NOW)).toHaveLength(0);
  });
});

const inside = (snapshot: typeof PREVIEW_LIVE | undefined, node: React.ReactNode) =>
  render(
    <CalendarLiveProvider initial={snapshot} frozen now={PREVIEW_LIVE_NOW}>
      {node}
    </CalendarLiveProvider>,
  );

describe('the calendar marks', () => {
  it('draws the row (CH-16640) linking to the live view for the event, and the dot (CH-16641) with its count', () => {
    inside(
      PREVIEW_LIVE,
      <>
        <EventLiveRow e={ev({})} />
        <EventLiveDot e={ev({})} />
      </>,
    );
    const row = screen.getByRole('link', { name: 'Live · 3 on the course' });
    expect(row.getAttribute('href')).toBe('/golf/dashboard/live?event=e1');
    expect(row.getAttribute('data-ch-code')).toBe('CH-16640');
    expect(screen.getByRole('img', { name: '3 on the course' }).getAttribute('data-ch-code')).toBe('CH-16641');
  });

  it('draws nothing when nobody is out, for a player (no snapshot), or on an event nobody scores on', () => {
    const marks = (e: ChCalEvent) => (
      <>
        <EventLiveRow e={e} />
        <EventLiveDot e={e} />
      </>
    );
    expect(inside(PREVIEW_LIVE_EMPTY, marks(ev({}))).container.firstChild).toBeNull();
    cleanup();
    expect(inside(undefined, marks(ev({}))).container.firstChild).toBeNull();
    cleanup();
    expect(inside(PREVIEW_LIVE, marks(ev({ type: 'meeting' }))).container.firstChild).toBeNull();
  });
});
