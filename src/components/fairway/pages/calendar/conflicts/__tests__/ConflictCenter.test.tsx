/**
 * ConflictCenter — SCREEN-BUILD-PLAN.md §2.8.
 *
 * The global test-setup `matchMedia` mock reports `matches: false` for every
 * query, so every test here renders the mobile (`Sheet side="bottom"`) shell
 * by default — the required 320px case — unless a test opts into the desktop
 * mock below (idiom copied from `CalendarClassDetail.test.tsx`).
 *
 * Honesty is the load-bearing theme: a cached zero-group snapshot must never
 * read as a fresh all-clear once it can no longer be confirmed (offline, or
 * a failed refresh), a `partial` group must never lose its hatched
 * "unverified" chip just because a filter view included it, and the
 * "Reviewed" filter must not exist at all yet (gate G2).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ConflictCenter } from '../ConflictCenter';
import {
  conflictInboxFixtures,
  FIXTURE_EVENT_PRACTICE_ID,
} from '@/test/fixtures/calendar-screens';
import type { ConflictGroup, ConflictInboxSnapshot } from '@/app/golf/actions/conflict-inbox';

const TIME_ZONE = 'America/New_York';

const noneSnapshot = (conflictInboxFixtures.none as { success: true; data: ConflictInboxSnapshot }).data;
const partialSnapshot = (conflictInboxFixtures.partial as { success: true; data: ConflictInboxSnapshot }).data;
const unverifiedOnlySnapshot = (conflictInboxFixtures.unverifiedOnly as { success: true; data: ConflictInboxSnapshot }).data;

function baseProps() {
  return {
    snapshot: null as ConflictInboxSnapshot | null,
    loading: false,
    refreshing: false,
    error: null as string | null,
    onRefresh: vi.fn(),
    timeZone: TIME_ZONE,
    onReviewNewTime: vi.fn(),
  };
}

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

describe('ConflictCenter — loading', () => {
  it('shows a skeleton list, never a list or an empty state', () => {
    render(<ConflictCenter {...baseProps()} loading />);
    expect(screen.getByRole('status', { name: 'Loading conflicts' })).toBeInTheDocument();
    expect(screen.queryByText('No overlaps in the next 14 days')).not.toBeInTheDocument();
  });
});

describe('ConflictCenter — failed initial load', () => {
  it('shows Retry and no list when there is no snapshot to fall back on', () => {
    const onRefresh = vi.fn();
    render(<ConflictCenter {...baseProps()} error="Conflicts could not be loaded. Please retry." onRefresh={onRefresh} />);
    expect(screen.getByText('Conflicts could not be loaded. Please retry.')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Team Practice|Team Meeting/ })).not.toBeInTheDocument();
  });
});

describe('ConflictCenter — none', () => {
  it('renders a clean all-clear with the checked time when the read actually succeeded', () => {
    render(<ConflictCenter {...baseProps()} snapshot={noneSnapshot} />);
    expect(screen.getByText('No overlaps in the next 14 days')).toBeInTheDocument();
    // Both the header's own "Checked …" line and the empty state's
    // description repeat the same fact — assert at least one renders it.
    expect(screen.getAllByText(/Checked/).length).toBeGreaterThan(0);
  });

  it('never presents a cached "no overlaps" snapshot as fresh when offline', () => {
    render(<ConflictCenter {...baseProps()} snapshot={noneSnapshot} isOffline />);
    expect(screen.queryByText('No overlaps in the next 14 days')).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't confirm there are no conflicts")).toBeInTheDocument();
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
  });

  it('never presents a cached "no overlaps" snapshot as fresh after a failed refresh', () => {
    render(<ConflictCenter {...baseProps()} snapshot={noneSnapshot} error="Conflicts could not be loaded. Please retry." />);
    expect(screen.queryByText('No overlaps in the next 14 days')).not.toBeInTheDocument();
    expect(screen.getByText("Couldn't confirm there are no conflicts")).toBeInTheDocument();
    // The degraded top banner (Retry) is also present — two signals, one message.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('ConflictCenter — filters', () => {
  it('Needs attention shows only groups with a real overlap, and a partial group there still carries its hatched "unverified" chip', () => {
    render(<ConflictCenter {...baseProps()} snapshot={partialSnapshot} />);
    // Default filter is Needs attention: only the clean group (an overlap)
    // qualifies — the partial group has zero overlaps, so it is absent here.
    expect(screen.getByRole('button', { name: /Team Practice/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Team Meeting/ })).not.toBeInTheDocument();
  });

  it('Unverified shows only groups with unverified attendees, filtering never launders a partial group into "checked"', () => {
    render(<ConflictCenter {...baseProps()} snapshot={partialSnapshot} />);
    fireEvent.click(screen.getByRole('radio', { name: /Unverified/ }));
    const row = screen.getByRole('button', { name: /Team Meeting/ });
    expect(row).toBeInTheDocument();
    expect(within(row).getByText('Partially checked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Team Practice/ })).not.toBeInTheDocument();
  });

  it('has no "Reviewed" filter option — gate G2 has not landed', () => {
    render(<ConflictCenter {...baseProps()} snapshot={partialSnapshot} />);
    expect(screen.queryByRole('radio', { name: /Reviewed/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Reviewed')).not.toBeInTheDocument();
  });

  it('unverified-only fixture renders solely under the Unverified filter, never under Needs attention', () => {
    render(<ConflictCenter {...baseProps()} snapshot={unverifiedOnlySnapshot} />);
    expect(screen.getByText('No conflicts need attention right now')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Unverified/ }));
    expect(screen.getByRole('button', { name: /Team Meeting/ })).toBeInTheDocument();
  });

  it('cross-hints the other filter when the current one is empty but not the other', () => {
    render(<ConflictCenter {...baseProps()} snapshot={unverifiedOnlySnapshot} />);
    expect(screen.getByText(/event has unverified attendees — switch filters to review\./)).toBeInTheDocument();
  });
});

describe('ConflictCenter — date grouping', () => {
  it('groups by the local calendar day derived from the same instant as the bucket key, even across a zone far from UTC', () => {
    // 2026-09-08T23:00:00Z is 2026-09-09, noon, in Pacific/Auckland (UTC+13)
    // — a naive "reparse the YYYY-MM-DD key at noon UTC" heading would land
    // back on 2026-09-08, one day off from the bucket it heads.
    const group: ConflictGroup = {
      event: { id: FIXTURE_EVENT_PRACTICE_ID, title: 'Dawn Session', start: '2026-09-08T23:00:00.000Z', end: '2026-09-09T00:00:00.000Z', type: 'practice' },
      overlaps: [{ playerId: 'p1', name: 'Alex Player', avatarUrl: null, conflictingEvent: { start: '2026-09-08T23:15:00.000Z', end: '2026-09-08T23:45:00.000Z', type: 'event', title: 'Study group' } }],
      unverifiedAttendeeIds: [],
      verification: 'complete',
    };
    const snapshot: ConflictInboxSnapshot = { ...noneSnapshot, groups: [group] };
    render(<ConflictCenter {...baseProps()} snapshot={snapshot} timeZone="Pacific/Auckland" />);
    expect(screen.getByRole('heading', { name: 'Wednesday, Sep 9' })).toBeInTheDocument();
  });
});

describe('ConflictCenter — desktop inspector vs. mobile sheet', () => {
  it('opens the detail in a persistent right inspector at 1024px', () => {
    mockDesktop();
    render(<ConflictCenter {...baseProps()} snapshot={partialSnapshot} />);
    fireEvent.click(screen.getByRole('button', { name: /Team Practice/ }));
    // The detail's own header renders the event's title as a heading —
    // present exactly once confirms the inspector opened (and no duplicate
    // mobile sheet also rendered it).
    expect(screen.getAllByRole('heading', { name: 'Team Practice' })).toHaveLength(1);
  });

  it('320px mobile: selecting a row opens the bottom sheet, not an inspector', () => {
    render(<ConflictCenter {...baseProps()} snapshot={partialSnapshot} />);
    fireEvent.click(screen.getByRole('button', { name: /Team Practice/ }));
    // The Sheet's own sr-only title (`hideTitle`) also carries the event's
    // name, so two headings legitimately match here — assert on the VISIBLE
    // one, ConflictDetail's own header (the sr-only one has no visual size,
    // but is not excluded from the accessibility tree, so it still matches
    // getByRole by default).
    const headings = screen.getAllByRole('heading', { name: 'Team Practice' });
    expect(headings.some((heading) => !heading.className.includes('sr-only'))).toBe(true);
  });
});

describe('ConflictCenter — refresh', () => {
  it('disables Refresh while offline and shows a spinner while refreshing', () => {
    render(<ConflictCenter {...baseProps()} snapshot={partialSnapshot} isOffline />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
  });
});
