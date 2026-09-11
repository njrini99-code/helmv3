// @vitest-environment jsdom

/**
 * MyAvailabilityScreen — SCREEN-BUILD-PLAN.md §2.7 (S7).
 *
 * The global test-setup `matchMedia` mock reports `matches: false` for every
 * query, so every test here renders the mobile (list/editor swap) shell —
 * the required 320px case — unless a test opts into the desktop mock.
 *
 * `@/app/golf/actions/golf` and `@/app/golf/actions/scheduling` are mocked
 * wholesale: this screen must never touch the real Supabase-backed actions
 * in a unit test, and — the load-bearing honesty check — a `viewerRole="player"`
 * render must NEVER call the coach-only blocked-time actions at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MyAvailabilityScreen } from '../MyAvailabilityScreen';
import type { CoachBlockedTimeRow } from '../useBlockedTime';

vi.mock('@/app/golf/actions/golf', () => ({
  getCoachBlockedTime: vi.fn(),
  addCoachBlockedTime: vi.fn(),
  updateCoachBlockedTime: vi.fn(),
  deleteCoachBlockedTime: vi.fn(),
}));
vi.mock('@/app/golf/actions/scheduling', () => ({
  getScheduleWindow: vi.fn(),
}));

import { getCoachBlockedTime, addCoachBlockedTime } from '@/app/golf/actions/golf';
import { getScheduleWindow } from '@/app/golf/actions/scheduling';

const mockGetCoachBlockedTime = vi.mocked(getCoachBlockedTime);
const mockAddCoachBlockedTime = vi.mocked(addCoachBlockedTime);
const mockGetScheduleWindow = vi.mocked(getScheduleWindow);

const realOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

afterEach(() => {
  cleanup();
  if (realOnLine) Object.defineProperty(navigator, 'onLine', realOnLine);
});

beforeEach(() => {
  setOnline(true);
  // `mockReset` (not `clearAllMocks`) so a previous test's queued
  // `mockResolvedValueOnce` values and default implementation never leak
  // into the next test regardless of how many calls actually consumed them.
  mockGetCoachBlockedTime.mockReset();
  mockAddCoachBlockedTime.mockReset();
  mockGetScheduleWindow.mockReset();
});

function makeRow(overrides: Partial<CoachBlockedTimeRow> = {}): CoachBlockedTimeRow {
  return {
    id: 'row-1',
    coach_id: 'coach-1',
    start_date: '2026-09-10',
    end_date: '2026-09-10',
    start_time: '14:00',
    end_time: '15:00',
    is_recurring: false,
    reason: null,
    recurrence_rule: null,
    created_at: null,
    updated_at: null,
    title: 'Dentist',
    all_day: false,
    description: null,
    ...overrides,
  };
}

describe('MyAvailabilityScreen — player', () => {
  it('renders FeatureUnavailable on Busy time and never calls the coach-only action', () => {
    render(<MyAvailabilityScreen open viewerRole="player" teamId={null} onOpenChange={() => {}} />);
    expect(screen.getByText('Personal busy time')).toBeInTheDocument();
    expect(mockGetCoachBlockedTime).not.toHaveBeenCalled();
  });
});

describe('MyAvailabilityScreen — coach, Busy time', () => {
  it('shows a loading state, then the list grouped by day', async () => {
    mockGetCoachBlockedTime.mockResolvedValue({ success: true, data: [makeRow()] });
    render(<MyAvailabilityScreen open viewerRole="coach" teamId="team-1" onOpenChange={() => {}} />);

    expect(await screen.findByText('Dentist')).toBeInTheDocument();
    expect(screen.getByText(/2:00 PM.*3:00 PM/)).toBeInTheDocument();
  });

  it('shows the empty state with Add busy time when there is nothing yet', async () => {
    mockGetCoachBlockedTime.mockResolvedValue({ success: true, data: [] });
    render(<MyAvailabilityScreen open viewerRole="coach" teamId="team-1" onOpenChange={() => {}} />);
    expect(await screen.findByText('No busy time added')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add busy time' })).toBeInTheDocument();
  });

  it('shows a failed-load state with Retry', async () => {
    mockGetCoachBlockedTime.mockResolvedValue({ success: false, error: 'Network down' });
    render(<MyAvailabilityScreen open viewerRole="coach" teamId="team-1" onOpenChange={() => {}} />);
    expect(await screen.findByText('Network down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('tapping a row opens the editor (mobile swap) with Back replacing the tabs', async () => {
    mockGetCoachBlockedTime.mockResolvedValue({ success: true, data: [makeRow()] });
    render(<MyAvailabilityScreen open viewerRole="coach" teamId="team-1" onOpenChange={() => {}} />);

    fireEvent.click(await screen.findByText('Dentist'));

    expect(screen.getByRole('button', { name: 'Back to my availability' })).toBeInTheDocument();
    expect(screen.getByLabelText('Busy time title')).toHaveValue('Dentist');
    expect(screen.queryByRole('radio', { name: 'Sources' })).not.toBeInTheDocument();
  });

  it('creating a block calls addCoachBlockedTime, then returns to the refreshed list', async () => {
    mockGetCoachBlockedTime
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [makeRow({ id: 'row-new', title: 'Team meeting' })] });
    mockAddCoachBlockedTime.mockResolvedValue({ success: true, data: { id: 'row-new' } });

    render(<MyAvailabilityScreen open viewerRole="coach" teamId="team-1" onOpenChange={() => {}} />);
    // Wait for the list to settle on its loaded-empty state first: while the
    // fetch is still in flight, the header's own "Add busy time" transiently
    // renders too (it only hides once the empty state has its own copy of
    // the button) — grabbing it mid-flight races the fetch resolving and
    // removing that exact node before the click lands.
    await screen.findByText('No busy time added');
    fireEvent.click(screen.getByRole('button', { name: 'Add busy time' }));

    fireEvent.change(screen.getByLabelText('Busy time title'), { target: { value: 'Team meeting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Team meeting')).toBeInTheDocument();
    expect(mockAddCoachBlockedTime).toHaveBeenCalledTimes(1);
    expect(mockAddCoachBlockedTime.mock.calls[0]![0]).toMatchObject({ title: 'Team meeting' });
  });

  it('goes offline: hides Add busy time and shows the offline notice, but keeps the loaded list', async () => {
    mockGetCoachBlockedTime.mockResolvedValue({ success: true, data: [makeRow()] });
    setOnline(false);
    render(<MyAvailabilityScreen open viewerRole="coach" teamId="team-1" onOpenChange={() => {}} />);

    expect(await screen.findByText('Dentist')).toBeInTheDocument();
    expect(screen.getByText(/You.{1,2}re offline/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add busy time' })).not.toBeInTheDocument();
  });
});

describe('MyAvailabilityScreen — Sources (role-agnostic)', () => {
  it('renders an honest "no team" line when there is no team to check', () => {
    render(<MyAvailabilityScreen open viewerRole="player" teamId={null} onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sources' }));
    expect(screen.getByText('No team schedule to check yet.')).toBeInTheDocument();
  });

  it('shows the single checked-at line when the snapshot verification is complete', async () => {
    mockGetScheduleWindow.mockResolvedValue({
      success: true,
      data: {
        teamId: 'team-1',
        timeZone: 'America/New_York',
        window: { start: '2026-09-08T00:00:00.000Z', end: '2026-09-09T00:00:00.000Z' },
        checkedAt: '2026-09-08T14:32:00.000Z',
        participants: [
          { id: 'me', kind: 'coach', name: 'You', avatarUrl: null, isViewer: true, required: true, verification: 'complete', intervals: [] },
        ],
      },
    });

    render(<MyAvailabilityScreen open viewerRole="coach" teamId="team-1" onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sources' }));

    expect(await screen.findByText(/Based on Helm schedules/)).toBeInTheDocument();
  });

  it('never shows a clean checkmark for a partial verification — hatched "Not verified" instead', async () => {
    mockGetScheduleWindow.mockResolvedValue({
      success: true,
      data: {
        teamId: 'team-1',
        timeZone: 'America/New_York',
        window: { start: '2026-09-08T00:00:00.000Z', end: '2026-09-09T00:00:00.000Z' },
        checkedAt: '2026-09-08T14:32:00.000Z',
        participants: [
          { id: 'me', kind: 'coach', name: 'You', avatarUrl: null, isViewer: true, required: true, verification: 'partial', intervals: [] },
        ],
      },
    });

    render(<MyAvailabilityScreen open viewerRole="coach" teamId="team-1" onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sources' }));

    expect(await screen.findByText(/Not verified/)).toBeInTheDocument();
    expect(screen.queryByText(/^Based on Helm schedules/)).not.toBeInTheDocument();
  });
});
