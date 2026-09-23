/**
 * FairwayAvailabilityList — the "Common free time" callout.
 *
 * `computeCommonFreeTime` (src/lib/golf/common-free-time.ts) derives the
 * windows where every selected player is open; this component just renders
 * them (`commonFreeWindows`, the parent's `allFreeWindows`). These tests pin
 * the presentation contract: the section shows when there are windows to
 * show, names the day + time range, and disappears when there are none —
 * without touching the per-player buckets below it, which the rest of this
 * file already renders unconditionally.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FairwayAvailabilityList } from '../FairwayAvailabilityList';
import type { FreeWindow } from '@/lib/golf/common-free-time';

const RANGE_START = new Date(2026, 6, 20); // Monday, July 20 2026 (local)
const RANGE_END = new Date(2026, 6, 20);
const NOW_REF = new Date(2026, 6, 20);

function freeWindow(overrides: Partial<FreeWindow> = {}): FreeWindow {
  return {
    dayIso: '2026-07-20',
    startIso: '2026-07-20T18:00:00.000Z', // 2:00 PM ET (UTC-4)
    endIso: '2026-07-20T20:00:00.000Z', // 4:00 PM ET
    startMinute: 14 * 60,
    endMinute: 16 * 60,
    durationMinutes: 120,
    freePlayerIds: ['p1', 'p2'],
    busyPlayerIds: [],
    freeCount: 2,
    totalPlayers: 2,
    ...overrides,
  };
}

describe('FairwayAvailabilityList — commonFreeWindows', () => {
  it('renders a "Common free time" callout with the day and time range for each window', () => {
    render(
      <FairwayAvailabilityList
        overlays={[]}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        nowRef={NOW_REF}
        timezone="America/New_York"
        commonFreeWindows={[freeWindow()]}
      />,
    );

    expect(screen.getByText('Common free time')).toBeInTheDocument();
    expect(screen.getByText('2:00 PM – 4:00 PM')).toBeInTheDocument();
  });

  it('renders nothing extra when there are no common free windows', () => {
    render(
      <FairwayAvailabilityList
        overlays={[]}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        nowRef={NOW_REF}
        timezone="America/New_York"
        commonFreeWindows={[]}
      />,
    );

    expect(screen.queryByText('Common free time')).not.toBeInTheDocument();
  });

  it('renders nothing extra when the prop is omitted (existing callers unaffected)', () => {
    render(
      <FairwayAvailabilityList
        overlays={[]}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        nowRef={NOW_REF}
        timezone="America/New_York"
      />,
    );

    expect(screen.queryByText('Common free time')).not.toBeInTheDocument();
  });

  it('shows the callout even when there is nothing else on the books that day', () => {
    render(
      <FairwayAvailabilityList
        overlays={[]}
        rangeStart={RANGE_START}
        rangeEnd={RANGE_END}
        nowRef={NOW_REF}
        timezone="America/New_York"
        commonFreeWindows={[freeWindow()]}
      />,
    );

    // The empty-state copy for "nothing scheduled" still renders alongside it —
    // the callout doesn't replace it, it supplements it.
    expect(screen.getByText('Common free time')).toBeInTheDocument();
    expect(screen.getByText('No scheduled time')).toBeInTheDocument();
  });
});
