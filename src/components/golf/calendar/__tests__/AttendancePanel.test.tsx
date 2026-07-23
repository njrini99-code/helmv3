// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (declared before the component import)
// ---------------------------------------------------------------------------

const getAttendanceReport = vi.fn();
const markAttendance = vi.fn();
const bulkCheckIn = vi.fn();

vi.mock('@/app/golf/actions/attendance', () => ({
  getAttendanceReport: (...args: unknown[]) => getAttendanceReport(...args),
  markAttendance: (...args: unknown[]) => markAttendance(...args),
  bulkCheckIn: (...args: unknown[]) => bulkCheckIn(...args),
}));

const toastError = vi.fn();
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

import { AttendancePanel } from '@/components/golf/calendar/AttendancePanel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface RecordOverrides {
  id?: string;
  player_id?: string;
  status?: string | null;
  attendance_status?: 'present' | 'late' | 'no_show' | null;
  checked_in?: boolean | null;
  checked_in_at?: string | null;
  first_name?: string;
  last_name?: string;
}

function record(overrides: RecordOverrides = {}) {
  return {
    id: overrides.id ?? 'att-1',
    event_id: 'event-1',
    player_id: overrides.player_id ?? 'p1',
    status: overrides.status ?? 'pending',
    rsvp_at: null,
    // getAttendanceReport normalizes this server-side (legacy rows included),
    // so panel fixtures always carry an explicit value; null = not yet marked.
    attendance_status: overrides.attendance_status ?? null,
    checked_in: overrides.checked_in ?? false,
    checked_in_at: overrides.checked_in_at ?? null,
    notes: null,
    player: {
      first_name: overrides.first_name ?? 'Nick',
      last_name: overrides.last_name ?? 'Rini',
      jersey_number: null,
    },
  };
}

function twoPlayerRoster() {
  return [
    record({ id: 'att-1', player_id: 'p1', first_name: 'Nick', last_name: 'Rini', status: 'accepted' }),
    record({ id: 'att-2', player_id: 'p2', first_name: 'Ava', last_name: 'Smith', status: 'declined' }),
  ];
}

function reportOk(
  attendance: ReturnType<typeof record>[],
  opts: { viewerIsCoach?: boolean; viewerPlayerId?: string | null } = {},
) {
  return {
    success: true,
    data: {
      attendance,
      eventStartTime: '2026-06-10T14:00:00Z',
      viewerIsCoach: opts.viewerIsCoach ?? true,
      viewerPlayerId: opts.viewerPlayerId ?? null,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderPanel(canManage = true) {
  return render(
    <AttendancePanel eventId="event-1" teamId="team-1" canManage={canManage} />,
  );
}

beforeEach(() => {
  getAttendanceReport.mockReset();
  markAttendance.mockReset();
  bulkCheckIn.mockReset();
  toastError.mockReset();
});

// ---------------------------------------------------------------------------
// Loading / empty / error states
// ---------------------------------------------------------------------------

describe('AttendancePanel states', () => {
  it('shows a skeleton while the report loads', () => {
    getAttendanceReport.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByTestId('attendance-skeleton')).toBeTruthy();
  });

  it('shows an em-dash empty state when no players are on the list', async () => {
    getAttendanceReport.mockResolvedValue(reportOk([]));
    renderPanel();
    expect(await screen.findByText(/— No players on the list/)).toBeTruthy();
  });

  it('shows the load error with a working retry', async () => {
    getAttendanceReport
      .mockResolvedValueOnce({ success: false, error: 'nope' })
      .mockResolvedValueOnce(reportOk(twoPlayerRoster()));
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }));

    expect(await screen.findByText('Nick Rini')).toBeTruthy();
    expect(getAttendanceReport).toHaveBeenCalledTimes(2);
  });

  // Finding #9: the per-player attendance list is a SEPARATE query path from
  // the drawer's aggregate RSVP tally — a THROWN rejection (not a `{ success:
  // false }` result) must surface its own honest error/retry instead of an
  // infinite skeleton (the missing `.catch` previously left `loading` true
  // forever on any thrown exception).
  it('shows its own error and retry when the report query rejects outright', async () => {
    getAttendanceReport
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(reportOk(twoPlayerRoster()));
    renderPanel();

    expect(await screen.findByRole('button', { name: /Try again/ })).toBeTruthy();
    expect(screen.queryByTestId('attendance-skeleton')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Nick Rini')).toBeTruthy();
    expect(getAttendanceReport).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Coach view — roster, tally, marks
// ---------------------------------------------------------------------------

describe('AttendancePanel coach view', () => {
  it('renders the roster with RSVP badges and a running tally', async () => {
    getAttendanceReport.mockResolvedValue(
      reportOk([
        record({ id: 'att-1', player_id: 'p1', status: 'accepted', attendance_status: 'present', checked_in: true, checked_in_at: '2026-06-10T13:50:00Z' }),
        record({ id: 'att-2', player_id: 'p2', first_name: 'Ava', last_name: 'Smith', status: 'declined' }),
      ]),
    );
    renderPanel();

    expect(await screen.findByText('Nick Rini')).toBeTruthy();
    expect(screen.getByText('Ava Smith')).toBeTruthy();
    expect(screen.getByText('Going')).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
    // Nick is checked in → 1/2, and his Present toggle is pressed.
    expect(screen.getByTestId('attendance-tally').textContent).toBe('1/2 present');
    expect(
      screen.getByRole('button', { name: 'Mark Nick Rini present' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('updates the tally optimistically and keeps the mark on success', async () => {
    getAttendanceReport.mockResolvedValue(reportOk(twoPlayerRoster()));
    const save = deferred<{ success: boolean }>();
    markAttendance.mockReturnValue(save.promise);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Mark Nick Rini present' }));

    // Optimistic: tally moves BEFORE the server action resolves.
    expect(screen.getByTestId('attendance-tally').textContent).toBe('1/2 present');
    expect(markAttendance).toHaveBeenCalledWith('event-1', 'p1', 'present');

    save.resolve({ success: true });
    await waitFor(() => {
      expect(screen.getByTestId('attendance-tally').textContent).toBe('1/2 present');
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('rolls the mark back and toasts when the save fails', async () => {
    getAttendanceReport.mockResolvedValue(reportOk(twoPlayerRoster()));
    const save = deferred<{ success: boolean; error?: string }>();
    markAttendance.mockReturnValue(save.promise);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Mark Nick Rini no-show' }));
    expect(
      screen.getByRole('button', { name: 'Mark Nick Rini no-show' }).getAttribute('aria-pressed'),
    ).toBe('true');

    save.resolve({ success: false, error: 'RLS says no' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Mark Nick Rini no-show' }).getAttribute('aria-pressed'),
      ).toBe('false');
    });
    expect(toastError).toHaveBeenCalledWith('Could not save attendance', 'RLS says no');
  });

  it('hydrates a persisted Late mark from attendance_status (survives reload)', async () => {
    getAttendanceReport.mockResolvedValue(
      reportOk([
        record({ id: 'att-1', player_id: 'p1', attendance_status: 'late', checked_in: true, checked_in_at: '2026-06-10T14:05:00Z' }),
        record({ id: 'att-2', player_id: 'p2', first_name: 'Ava', last_name: 'Smith' }),
      ]),
    );
    renderPanel();

    expect(await screen.findByText('Nick Rini')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Mark Nick Rini late' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Mark Nick Rini present' }).getAttribute('aria-pressed'),
    ).toBe('false');
    // Late counts as present in the tally — a late player IS present.
    expect(screen.getByTestId('attendance-tally').textContent).toBe('1/2 present');
  });

  it('tapping the active mark again sends a clear', async () => {
    getAttendanceReport.mockResolvedValue(
      reportOk([
        record({ id: 'att-1', player_id: 'p1', attendance_status: 'present', checked_in: true, checked_in_at: '2026-06-10T13:50:00Z' }),
      ]),
    );
    markAttendance.mockResolvedValue({ success: true });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Mark Nick Rini present' }));

    expect(markAttendance).toHaveBeenCalledWith('event-1', 'p1', 'clear');
    await waitFor(() => {
      expect(screen.getByTestId('attendance-tally').textContent).toBe('0/1 present');
    });
  });

  it('"Mark all present" bulk-checks the roster in and rolls back on failure', async () => {
    getAttendanceReport.mockResolvedValue(reportOk(twoPlayerRoster()));
    const bulk = deferred<{ success: boolean; error?: string }>();
    bulkCheckIn.mockReturnValue(bulk.promise);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /Mark all present/ }));

    expect(bulkCheckIn).toHaveBeenCalledWith('event-1', ['p1', 'p2']);
    // Optimistic: everyone present immediately.
    expect(screen.getByTestId('attendance-tally').textContent).toBe('2/2 present');

    bulk.resolve({ success: false, error: 'down' });
    await waitFor(() => {
      expect(screen.getByTestId('attendance-tally').textContent).toBe('0/2 present');
    });
    expect(toastError).toHaveBeenCalledWith('Could not check everyone in', 'down');
  });

  it('"Mark all present" sticks on success', async () => {
    getAttendanceReport.mockResolvedValue(reportOk(twoPlayerRoster()));
    bulkCheckIn.mockResolvedValue({ success: true, data: { successCount: 2, failureCount: 0 } });
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /Mark all present/ }));

    await waitFor(() => {
      expect(screen.getByTestId('attendance-tally').textContent).toBe('2/2 present');
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  // Regression for the min-w-0/flex-shrink-0 contract: the mark-button group
  // sits beside a truncating name column inside the narrower Fairway drawer
  // (sm:max-w-xl / full-width on phone). Without flex-shrink-0 the button
  // group — not the name column — could be the one to compress under the
  // default flex-shrink:1, the inverse of every other trailing-controls row
  // in the redesigned calendar (FairwayEventCard, FairwayMonthGrid chips).
  it('keeps the mark-button group from shrinking beside a long player name', async () => {
    getAttendanceReport.mockResolvedValue(
      reportOk([
        record({
          id: 'att-1',
          player_id: 'p1',
          first_name: 'Maximilian-Alexander',
          last_name: 'Featherstonehaugh-Worthington',
          status: 'accepted',
        }),
      ]),
    );
    renderPanel();

    const presentButton = await screen.findByRole('button', {
      name: 'Mark Maximilian-Alexander Featherstonehaugh-Worthington present',
    });
    const group = presentButton.closest('[role="group"]');
    expect(group).not.toBeNull();
    expect(group?.className).toMatch(/\bflex-shrink-0\b/);
  });
});

// ---------------------------------------------------------------------------
// Player read-only view
// ---------------------------------------------------------------------------

describe('AttendancePanel player view', () => {
  it('shows the player their own status read-only (no mark buttons)', async () => {
    getAttendanceReport.mockResolvedValue(
      reportOk(
        [
          record({ id: 'att-1', player_id: 'p1', attendance_status: 'present', checked_in: true, checked_in_at: '2026-06-10T13:50:00Z' }),
          record({ id: 'att-2', player_id: 'p2', first_name: 'Ava', last_name: 'Smith' }),
        ],
        { viewerIsCoach: false, viewerPlayerId: 'p1' },
      ),
    );
    renderPanel(false);

    expect((await screen.findByTestId('own-attendance-status')).textContent).toBe('Checked in');
    expect(screen.queryByRole('button', { name: /Mark .* present/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mark all present/ })).toBeNull();
  });

  it('shows a persisted late mark as "Checked in (late)"', async () => {
    getAttendanceReport.mockResolvedValue(
      reportOk(
        [record({ id: 'att-1', player_id: 'p1', attendance_status: 'late', checked_in: true, checked_in_at: '2026-06-10T14:05:00Z' })],
        { viewerIsCoach: false, viewerPlayerId: 'p1' },
      ),
    );
    renderPanel(false);

    expect((await screen.findByTestId('own-attendance-status')).textContent).toBe(
      'Checked in (late)',
    );
  });

  it('shows an em-dash not-recorded state before roll call', async () => {
    getAttendanceReport.mockResolvedValue(
      reportOk([record({ id: 'att-1', player_id: 'p1' })], {
        viewerIsCoach: false,
        viewerPlayerId: 'p1',
      }),
    );
    renderPanel(false);

    expect((await screen.findByTestId('own-attendance-status')).textContent).toBe(
      '— Not recorded yet',
    );
  });

  it('tells a non-rostered viewer they are not on the list', async () => {
    getAttendanceReport.mockResolvedValue(
      reportOk([record({ id: 'att-1', player_id: 'p2', first_name: 'Ava', last_name: 'Smith' })], {
        viewerIsCoach: false,
        viewerPlayerId: 'p1',
      }),
    );
    renderPanel(false);

    expect(await screen.findByText(/not on the list for this event/)).toBeTruthy();
  });
});
