import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ScheduleSnapshot } from '@/lib/calendar/scheduling-contracts';
import { SchedulingWorkspace } from '../SchedulingWorkspace';

const SNAPSHOT: ScheduleSnapshot = {
  teamId: 'team-1',
  timeZone: 'UTC',
  window: {
    start: '2026-09-08T12:00:00.000Z',
    end: '2026-09-08T20:00:00.000Z',
  },
  checkedAt: '2026-09-08T11:00:00.000Z',
  participants: [
    {
      id: 'viewer',
      kind: 'coach',
      name: 'Coach',
      avatarUrl: null,
      isViewer: true,
      required: true,
      verification: 'complete',
      intervals: [
        {
          id: 'busy-1',
          start: '2026-09-08T12:00:00.000Z',
          end: '2026-09-08T13:00:00.000Z',
          type: 'blocked',
          title: 'Busy',
        },
      ],
    },
    {
      id: 'player-1',
      kind: 'player',
      name: 'Alex Player',
      avatarUrl: null,
      isViewer: false,
      required: true,
      verification: 'complete',
      intervals: [],
    },
  ],
};

/** jsdom has no `setPointerCapture`; the workspace calls it on drag start
 * (SchedulingWorkspace.tsx:296) so the handle keeps receiving pointer moves
 * off its own bounds. Stub it rather than skip the drag path entirely. */
function stubPointerCapture() {
  const proto = Element.prototype as unknown as { setPointerCapture?: (id: number) => void };
  const original = proto.setPointerCapture;
  proto.setPointerCapture = () => {};
  return () => {
    proto.setPointerCapture = original;
  };
}

describe('SchedulingWorkspace', () => {
  it('keeps the selected time, timeline, and accessible start controls in one workspace', () => {
    render(
      <SchedulingWorkspace
        snapshot={SNAPSHOT}
        initialProposal={{ start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:00:00.000Z' }}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Find a time' })).toBeVisible();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-09-08');
    expect(screen.getByLabelText('Start time')).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Move selected time window' })).toHaveAttribute('aria-valuetext', '1:00 PM–2:00 PM');
    expect(screen.getByText('60-min windows')).toBeVisible();
    expect(screen.getByText('Everyone is available')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Alex Player schedule' })).toBeVisible();
    expect(screen.getByTestId('scheduling-workspace')).toHaveAttribute('data-testid', 'scheduling-workspace');
  });

  it('keeps unverified people in the denominator and blocks an unverified choice', () => {
    const snapshot: ScheduleSnapshot = {
      ...SNAPSHOT,
      participants: [
        ...SNAPSHOT.participants,
        {
          id: 'player-2',
          kind: 'player',
          name: 'Unverified Player',
          avatarUrl: null,
          isViewer: false,
          required: true,
          verification: 'partial',
          intervals: [],
        },
      ],
    };
    const onChoose = vi.fn();
    render(
      <SchedulingWorkspace
        snapshot={snapshot}
        initialProposal={{ start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:00:00.000Z' }}
        onChoose={onChoose}
        onClose={() => {}}
        onDateChange={() => {}}
      />,
    );

    expect(screen.getByText('2 of 3 required free · 1 unverified')).toBeVisible();
    expect(screen.getAllByText('Not verified').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Use this time' })).toBeDisabled();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('exposes date changes and person drill-in without writing schedule data', () => {
    const onDateChange = vi.fn();
    const onPersonClick = vi.fn();
    render(
      <SchedulingWorkspace
        snapshot={SNAPSHOT}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={onDateChange}
        onPersonClick={onPersonClick}
      />,
    );

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-09' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open Alex Player schedule' }));

    expect(onDateChange).toHaveBeenCalledWith('2026-09-09');
    expect(onPersonClick).toHaveBeenCalledWith('player-1');
  });

  it('reaches the last valid start when the drag handle goes to the end of the timeline', () => {
    // Window is 12:00-20:00 UTC in 15-minute slots (32 slots); a 60-minute
    // selection's last valid start is 19:00 (19:00-20:00 still fits before
    // the window ends), one full hour short of the timeline's own end.
    // selectFromPointer (SchedulingWorkspace.tsx:278-292) maps the drag
    // fraction across all 32 slots, then clamps into the 29 valid starts —
    // dragging past the visible edge must still land on 19:00, not slide
    // short of it or throw past the array bound.
    const restorePointerCapture = stubPointerCapture();
    render(
      <SchedulingWorkspace
        snapshot={SNAPSHOT}
        initialProposal={{ start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:00:00.000Z' }}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
      />,
    );

    const timeline = screen.getByTestId('scheduling-timeline');
    timeline.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1056, bottom: 0, width: 1056, height: 0, x: 0, y: 0, toJSON() {},
    });
    Object.defineProperty(timeline, 'scrollWidth', { value: 1056, configurable: true });
    Object.defineProperty(timeline, 'scrollLeft', { value: 0, configurable: true, writable: true });

    const handle = screen.getByRole('slider', { name: 'Move selected time window' });
    fireEvent.pointerDown(handle, { clientX: 3000, pointerId: 1 });

    expect(handle).toHaveAttribute('aria-valuetext', '7:00 PM–8:00 PM');
    expect(handle).toHaveAttribute('aria-valuenow', '28');
    restorePointerCapture();
  });
});
