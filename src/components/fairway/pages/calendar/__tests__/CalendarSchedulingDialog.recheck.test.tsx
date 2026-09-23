// @vitest-environment jsdom

/**
 * CalendarSchedulingDialog's final server recheck.
 *
 * The workspace enables "Use this time" from whatever snapshot the page
 * already has, which can be seconds (or longer) stale. Before honoring that
 * tap, `choose()` re-fetches the window and re-runs the SAME acceptance rule
 * (`acceptProposal(evaluateSchedule(...))`) against the fresh data. This file
 * covers what the user sees when that recheck disagrees with the stale view:
 * a specific reason-keyed message, and `onChoose` must not fire — the whole
 * point of rechecking is to stop a stale confirm from double-booking someone.
 *
 * Only the data boundary is mocked (`useScheduleWindow`, `getScheduleWindow`);
 * `acceptProposal`/`evaluateSchedule` run for real so the messages are proven
 * against the actual acceptance rule, not a stand-in for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ScheduleSnapshot, ScheduleWindowRequest } from '@/lib/calendar/scheduling-contracts';

const useScheduleWindow = vi.hoisted(() => vi.fn());
const getScheduleWindow = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/golf/use-schedule-window', () => ({ useScheduleWindow }));
vi.mock('@/app/golf/actions/scheduling', () => ({ getScheduleWindow }));

import { CalendarSchedulingDialog } from '../CalendarSchedulingDialog';

const request: ScheduleWindowRequest = {
  teamId: '11111111-1111-4111-8111-111111111111',
  date: '2026-09-08',
  participantIds: ['22222222-2222-4222-8222-222222222222'],
};

const proposal = { start: '2026-09-08T18:00:00.000Z', end: '2026-09-08T19:00:00.000Z' };

/** The snapshot the workspace opens with: the required participant is free
 * and fully verified across the proposal, so "Use this time" is enabled —
 * exactly the state a recheck needs to override. */
const freshSnapshot: ScheduleSnapshot = {
  teamId: request.teamId,
  timeZone: 'America/New_York',
  window: { start: '2026-09-08T04:00:00.000Z', end: '2026-09-09T04:00:00.000Z' },
  checkedAt: '2026-09-08T12:00:00.000Z',
  participants: [{
    id: request.participantIds[0]!,
    kind: 'player',
    name: 'Ava Stone',
    avatarUrl: null,
    isViewer: false,
    required: true,
    verification: 'complete',
    intervals: [
      { id: 'morning', type: 'event', title: 'Morning lift', start: '2026-09-08T12:00:00.000Z', end: '2026-09-08T13:00:00.000Z' },
    ],
  }],
};

const retry = vi.fn();

function renderDialog(onChoose = vi.fn()) {
  render(
    <CalendarSchedulingDialog
      request={request}
      initialProposal={proposal}
      onChange={() => {}}
      onChoose={onChoose}
      onClose={() => {}}
    />,
  );
  return onChoose;
}

async function confirm() {
  const button = await screen.findByRole('button', { name: 'Use this time' });
  // `choose()` awaits the recheck fetch before touching state again; flushing
  // a couple of microtasks inside `act` lets that continuation run under
  // React's batching instead of leaking an update past the test.
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  useScheduleWindow.mockReset();
  getScheduleWindow.mockReset();
  retry.mockClear();
  useScheduleWindow.mockReturnValue({ snapshot: freshSnapshot, loading: false, error: null, retry });
});

describe('CalendarSchedulingDialog — final recheck before onChoose', () => {
  it('honors an unchanged, still-acceptable proposal by calling onChoose with it', async () => {
    getScheduleWindow.mockResolvedValue({ success: true, data: freshSnapshot });
    const onChoose = renderDialog();

    await confirm();

    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(proposal));
    // The board still reads as accepted — no recheck-failure banner appeared.
    expect(screen.queryByText('Could not verify schedules')).not.toBeInTheDocument();
  });

  it.each([
    {
      reason: 'nobody' as const,
      recheck: { ...freshSnapshot, participants: [] },
      message: 'No one is left to check for this time.',
    },
    {
      reason: 'unverified' as const,
      recheck: {
        ...freshSnapshot,
        participants: [{ ...freshSnapshot.participants[0]!, verification: 'partial' as const }],
      },
      message: 'Some schedules could not be verified. Refresh before choosing this time.',
    },
    {
      reason: 'required_busy' as const,
      recheck: {
        ...freshSnapshot,
        participants: [{
          ...freshSnapshot.participants[0]!,
          intervals: [
            ...freshSnapshot.participants[0]!.intervals,
            { id: 'conflict', type: 'event' as const, title: 'Just booked', start: '2026-09-08T18:30:00.000Z', end: '2026-09-08T19:30:00.000Z' },
          ],
        }],
      },
      message: 'Availability changed. Review the updated overlaps before choosing a time.',
    },
  ])('when the recheck comes back $reason, shows the matching message and never calls onChoose', async ({ recheck, message }) => {
    getScheduleWindow.mockResolvedValue({ success: true, data: recheck });
    const onChoose = renderDialog();

    await confirm();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onChoose).not.toHaveBeenCalled();
    // The dialog asks the hook to refetch rather than silently keeping the
    // stale window (the hook itself is mocked, so this proves the dialog's
    // call to `retry`, not an observed refresh).
    await waitFor(() => expect(retry).toHaveBeenCalled());
  });

  it('surfaces a generic message and never calls onChoose when the recheck fetch itself throws', async () => {
    getScheduleWindow.mockRejectedValue(new Error('network down'));
    const onChoose = renderDialog();

    await confirm();

    expect(await screen.findByText('Unable to verify this time. Please retry.')).toBeInTheDocument();
    expect(onChoose).not.toHaveBeenCalled();
  });
});
