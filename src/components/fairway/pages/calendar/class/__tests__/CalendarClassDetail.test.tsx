// @vitest-environment jsdom

/**
 * CalendarClassDetail — SCREEN-BUILD-PLAN.md §2.4 (S4).
 *
 * Built against the real, shared fixtures at
 * `src/test/fixtures/calendar-screens.ts` (W-Services), typed straight off
 * `getClassOccurrenceDetail`'s own return type — so a contract drift fails
 * `tsc`, not just this test file.
 *
 * The global test-setup `matchMedia` mock reports `matches: false` for every
 * query, so every test here renders at the mobile (`side="bottom"`) shell by
 * default — the required 320px case — unless a test opts into the desktop
 * mock below. The honesty test is the load-bearing one: a `free_busy` result
 * must never let the class name or instructor reach the DOM, even though
 * every other fixture here carries both.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarClassDetail } from '../CalendarClassDetail';
import type { ClassOccurrenceView } from '../types';
import { FIXTURE_CLASS_ID, classDetailFixtures } from '@/test/fixtures/calendar-screens';

const TIME_ZONE = 'America/New_York';
const LOADING: ClassOccurrenceView = { kind: 'loading' };

const realMatchMedia = window.matchMedia;
function mockDesktop() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: realMatchMedia });
});

describe('CalendarClassDetail — loading', () => {
  it('renders a header-shaped skeleton, no class data', () => {
    render(<CalendarClassDetail open result={LOADING} viewer="owner" timeZone={TIME_ZONE} onOpenChange={() => {}} />);
    expect(screen.getByRole('status', { name: 'Loading class' })).toBeInTheDocument();
    expect(screen.queryByText('Introduction to Computer Science')).not.toBeInTheDocument();
  });
});

describe('CalendarClassDetail — detail (320px / mobile shell)', () => {
  it('renders the class name, meeting status, location, and instructor', () => {
    render(
      <CalendarClassDetail open result={classDetailFixtures.scheduled!} viewer="owner" timeZone={TIME_ZONE} onOpenChange={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Introduction to Computer Science' })).toBeInTheDocument();
    expect(screen.getAllByText(/CS 201/).length).toBeGreaterThan(0);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Wells Hall 101')).toBeInTheDocument();
    expect(screen.getByText('Dr. Priya Lee')).toBeInTheDocument();
  });

  it('gives the owner Edit class as the one primary action', () => {
    const onEditClass = vi.fn();
    render(
      <CalendarClassDetail
        open
        result={classDetailFixtures.scheduled!}
        viewer="owner"
        timeZone={TIME_ZONE}
        onOpenChange={() => {}}
        onEditClass={onEditClass}
        onCompareSchedules={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: 'Edit class' });
    expect(screen.queryByRole('button', { name: 'Compare schedules' })).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onEditClass).toHaveBeenCalledWith(FIXTURE_CLASS_ID);
  });

  it('gives a coach Compare schedules instead, never Edit class', () => {
    const onCompareSchedules = vi.fn();
    render(
      <CalendarClassDetail
        open
        result={classDetailFixtures.scheduled!}
        viewer="coach"
        timeZone={TIME_ZONE}
        onOpenChange={() => {}}
        onEditClass={() => {}}
        onCompareSchedules={onCompareSchedules}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Edit class' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare schedules' }));
    expect(onCompareSchedules).toHaveBeenCalledTimes(1);
  });

  it('gives an unauthorized-for-action viewer no primary action at all', () => {
    render(
      <CalendarClassDetail
        open
        result={classDetailFixtures.scheduled!}
        viewer="other"
        timeZone={TIME_ZONE}
        onOpenChange={() => {}}
        onEditClass={() => {}}
        onCompareSchedules={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Edit class' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare schedules' })).not.toBeInTheDocument();
  });

  it('renders the desktop 360px inspector shell without changing the data shown', () => {
    mockDesktop();
    render(
      <CalendarClassDetail open result={classDetailFixtures.scheduled!} viewer="owner" timeZone={TIME_ZONE} onOpenChange={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Introduction to Computer Science' })).toBeInTheDocument();
  });
});

describe('CalendarClassDetail — free_busy (honesty)', () => {
  it('never renders a title, instructor, or location — only "Busy · Class" and the time', () => {
    render(
      <CalendarClassDetail open result={classDetailFixtures.freeBusy!} viewer="other" timeZone={TIME_ZONE} onOpenChange={() => {}} />,
    );
    expect(screen.getByText('Busy · Class')).toBeInTheDocument();
    expect(screen.queryByText('Introduction to Computer Science')).not.toBeInTheDocument();
    expect(screen.queryByText(/CS 201/)).not.toBeInTheDocument();
    expect(screen.queryByText('Dr. Priya Lee')).not.toBeInTheDocument();
    expect(screen.queryByText('Wells Hall 101')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit class' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare schedules' })).not.toBeInTheDocument();
  });
});

describe('CalendarClassDetail — not found', () => {
  it('says the class is gone and offers only Close', () => {
    const onOpenChange = vi.fn();
    render(
      <CalendarClassDetail open result={classDetailFixtures.notFound!} viewer="other" timeZone={TIME_ZONE} onOpenChange={onOpenChange} />,
    );
    expect(screen.getByText('This class is no longer in Helm')).toBeInTheDocument();
    // Two "Close" controls exist (the Sheet's own icon-only header close plus
    // this state's own text button) — target the visible text one.
    fireEvent.click(screen.getByText('Close').closest('button')!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('CalendarClassDetail — excluded occurrence', () => {
  it('still shows the full detail plus the exclusion reason and date range', () => {
    render(
      <CalendarClassDetail open result={classDetailFixtures.excluded!} viewer="owner" timeZone={TIME_ZONE} onOpenChange={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Introduction to Computer Science' })).toBeInTheDocument();
    expect(screen.getByText('Excluded from this meeting')).toBeInTheDocument();
    expect(screen.getByText(/Midterm exam/)).toBeInTheDocument();
  });
});

describe('CalendarClassDetail — exclusion status unknown (honesty: never defaults to Scheduled)', () => {
  it('reports the exclusion check could not be confirmed, never "Scheduled"', () => {
    render(
      <CalendarClassDetail open result={classDetailFixtures.exclusionUnknown!} viewer="owner" timeZone={TIME_ZONE} onOpenChange={() => {}} />,
    );
    expect(screen.getByText("Today's status could not be confirmed")).toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
  });
});

describe('CalendarClassDetail — unsynced', () => {
  it('shows the class detail with a "not synced" status instead of Scheduled', () => {
    render(
      <CalendarClassDetail open result={classDetailFixtures.unsynced!} viewer="owner" timeZone={TIME_ZONE} onOpenChange={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Introduction to Computer Science' })).toBeInTheDocument();
    expect(screen.getByText('Not synced to the team calendar')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
    // No `start`/`end` instants back an unsynced occurrence — the header
    // falls back to the class's own wall-clock start/end instead of crashing
    // or showing nothing.
    expect(screen.getByText('10:00 AM – 10:50 AM')).toBeInTheDocument();
  });
});

describe('CalendarClassDetail — failed', () => {
  it('shows the error and retries', () => {
    const onRetry = vi.fn();
    render(
      <CalendarClassDetail open result={classDetailFixtures.failedRead!} viewer="owner" timeZone={TIME_ZONE} onOpenChange={() => {}} onRetry={onRetry} />,
    );
    expect(screen.getByText(/This class could not be checked right now/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('CalendarClassDetail — offline (eighth state, SCREEN-BUILD-PLAN.md §2.4)', () => {
  // The fixtures module (`src/test/fixtures/calendar-screens.ts`) states this
  // is a CLIENT-side composition over a `detail` result, not a separate
  // server shape (there is no `access: 'offline'`) — so this test builds the
  // `{ kind: 'offline' }` view locally, over the same `detail`-access
  // snapshot the "detail" describe block above already exercises, per the
  // task's fallback instruction when a state has no fixture of its own.
  const scheduledResult = classDetailFixtures.scheduled!;
  if (!scheduledResult.success || scheduledResult.access !== 'detail') {
    throw new Error('fixture drift: classDetailFixtures.scheduled is expected to be detail access');
  }
  const OFFLINE: ClassOccurrenceView = {
    kind: 'offline',
    data: scheduledResult.data,
    checkedAt: '2026-09-08T13:45:00.000Z',
  };

  it('keeps showing the last snapshot — title, status, location, instructor — with a "checked at" label', () => {
    render(
      <CalendarClassDetail open result={OFFLINE} viewer="owner" timeZone={TIME_ZONE} onOpenChange={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Introduction to Computer Science' })).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Wells Hall 101')).toBeInTheDocument();
    expect(screen.getByText('Dr. Priya Lee')).toBeInTheDocument();
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.getByText(/Checked at 9:45 AM/)).toBeInTheDocument();
  });

  it('still deep-links Edit class for the owner from an offline snapshot', () => {
    const onEditClass = vi.fn();
    render(
      <CalendarClassDetail
        open
        result={OFFLINE}
        viewer="owner"
        timeZone={TIME_ZONE}
        onOpenChange={() => {}}
        onEditClass={onEditClass}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit class' }));
    expect(onEditClass).toHaveBeenCalledWith(FIXTURE_CLASS_ID);
  });
});
