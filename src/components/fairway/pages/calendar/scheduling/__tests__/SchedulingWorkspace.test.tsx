import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

/** The timeline has no layout in jsdom. Give it the same geometry the drag
 * tests use: a 1056px box whose 96px name column leaves a 960px track for 32
 * fifteen-minute slots, i.e. 30px per slot. */
function stubTimelineGeometry() {
  const timeline = screen.getByTestId('scheduling-timeline');
  timeline.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 1056, bottom: 0, width: 1056, height: 0, x: 0, y: 0, toJSON() {},
  });
  Object.defineProperty(timeline, 'scrollWidth', { value: 1056, configurable: true });
  Object.defineProperty(timeline, 'clientWidth', { value: 1056, configurable: true });
  Object.defineProperty(timeline, 'scrollLeft', { value: 0, configurable: true, writable: true });
  const nameHeader = timeline.querySelector('[aria-hidden="true"]') as HTMLElement;
  Object.defineProperty(nameHeader, 'offsetWidth', { value: 96, configurable: true });
  return timeline;
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
    expect(screen.getByText('Everyone is available')).toBeVisible();
    // The timeline card is a direct child of the scrollable body: it must
    // never be a shrinkable flex item, or `overflow-hidden` lets the flex
    // algorithm collapse it to 0px on a phone (the grid rendered but was
    // clipped away — verified live 2026-09-09).
    const timelineCard = screen.getByTestId('scheduling-timeline').parentElement!;
    expect(timelineCard.className).toMatch(/\bshrink-0\b/);
    expect(screen.getByTestId('scheduling-lens')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Alex Player schedule' })).toBeVisible();
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

    // The board names who could not be checked, not just how many.
    expect(screen.getByText('2 of 3 available · 1 unverified · not verified: Unverified Player')).toBeVisible();
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

  it.each([
    ['desktop', 1024],
    ['320px mobile', 320],
  ])('reaches the last valid start when the drag handle goes to the end of the timeline (%s)', (_label, viewportWidth) => {
    // Window is 12:00-20:00 UTC in 15-minute slots (32 slots); a 60-minute
    // selection's last valid start is 19:00 (19:00-20:00 still fits before
    // the window ends), one full hour short of the timeline's own end.
    // selectFromPointer (SchedulingWorkspace.tsx:278-292) maps the drag
    // fraction across all 32 slots, then clamps into the 29 valid starts —
    // dragging past the visible edge must still land on 19:00, not slide
    // short of it or throw past the array bound. Both viewport widths matter:
    // the nameWidth this diff fixed used to differ below 768px (128 vs 96).
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: viewportWidth, configurable: true, writable: true });
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
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true });
  });

  it('opens on the first window where everyone is free when no proposal is given', () => {
    // 12:00 is the first slot at/after 9 AM in the fixture's UTC window, but
    // the viewer is busy 12:00-13:00 — a fresh workspace must not open on a
    // slot the coach cannot choose.
    render(
      <SchedulingWorkspace
        snapshot={SNAPSHOT}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
      />,
    );
    expect(screen.getByRole('slider', { name: 'Move selected time window' })).toHaveAttribute('aria-valuetext', '1:00 PM–2:00 PM');
  });

  it('drags the band from where it was grabbed, follows the finger freely, and settles on the slot at release', async () => {
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
    Object.defineProperty(timeline, 'clientWidth', { value: 1056, configurable: true });
    Object.defineProperty(timeline, 'scrollLeft', { value: 0, configurable: true, writable: true });
    const nameHeader = timeline.querySelector('[aria-hidden="true"]') as HTMLElement;
    Object.defineProperty(nameHeader, 'offsetWidth', { value: 96, configurable: true });

    const handle = screen.getByRole('slider', { name: 'Move selected time window' });
    const band = screen.getByTestId('scheduling-lens');
    // Track is 960px for 32 slots (30px each); 13:00 starts at 120px, so a
    // finger landing 30px inside the band (clientX 96 + 150) must NOT move it.
    fireEvent.pointerDown(band, { clientX: 246, pointerId: 1, pointerType: 'touch' });
    expect(handle).toHaveAttribute('aria-valuetext', '1:00 PM–2:00 PM');
    expect(timeline).toHaveAttribute('data-dragging', 'true');

    // Two slots to the right: the band follows (free offset set) and the
    // snapped selection commits once the frame lands.
    fireEvent.pointerMove(band, { clientX: 306, pointerId: 1, pointerType: 'touch' });
    await waitFor(() => expect(handle).toHaveAttribute('aria-valuetext', '1:30 PM–2:30 PM'));
    expect(band.style.getPropertyValue('--lens-free')).not.toBe('');

    fireEvent.pointerUp(band, { clientX: 306, pointerId: 1, pointerType: 'touch' });
    expect(band.style.getPropertyValue('--lens-free')).toBe('');
    expect(timeline).not.toHaveAttribute('data-dragging');
    expect(handle).toHaveAttribute('aria-valuetext', '1:30 PM–2:30 PM');
    restorePointerCapture();
  });

  it('commits the release position even when the last move\'s frame has not run yet', () => {
    // A move queues a frame; a release before that frame runs used to cancel
    // it and keep the PREVIOUS frame\'s slot. The release position must win.
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
    Object.defineProperty(timeline, 'clientWidth', { value: 1056, configurable: true });
    Object.defineProperty(timeline, 'scrollLeft', { value: 0, configurable: true, writable: true });
    const nameHeader = timeline.querySelector('[aria-hidden="true"]') as HTMLElement;
    Object.defineProperty(nameHeader, 'offsetWidth', { value: 96, configurable: true });

    const handle = screen.getByRole('slider', { name: 'Move selected time window' });
    const band = screen.getByTestId('scheduling-lens');
    fireEvent.pointerDown(band, { clientX: 246, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(band, { clientX: 306, pointerId: 1, pointerType: 'touch' });
    // Release one more slot along, synchronously — before any frame fires.
    fireEvent.pointerUp(band, { clientX: 336, pointerId: 1, pointerType: 'touch' });
    expect(handle).toHaveAttribute('aria-valuetext', '1:45 PM–2:45 PM');
    expect(band.style.getPropertyValue('--lens-free')).toBe('');
    expect(timeline).not.toHaveAttribute('data-dragging');
    restorePointerCapture();
  });

  it('places the window on a lane tap, but not after a pan', () => {
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
    Object.defineProperty(timeline, 'clientWidth', { value: 1056, configurable: true });
    Object.defineProperty(timeline, 'scrollLeft', { value: 0, configurable: true, writable: true });
    const nameHeader = timeline.querySelector('[aria-hidden="true"]') as HTMLElement;
    Object.defineProperty(nameHeader, 'offsetWidth', { value: 96, configurable: true });

    const handle = screen.getByRole('slider', { name: 'Move selected time window' });
    const lane = screen.getAllByTestId('scheduling-lane')[0]!;

    // A finger that stays put: the 60-minute window centres under it.
    // clientX 500 → 404px on the track, minus half the 120px band = 344px →
    // slot 11 of 32 → 2:45 PM.
    fireEvent.pointerDown(lane, { clientX: 500, clientY: 10, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(lane, { clientX: 500, clientY: 10, pointerId: 2, pointerType: 'touch' });
    expect(handle).toHaveAttribute('aria-valuetext', '2:45 PM–3:45 PM');

    // A sideways pan (scrolling the schedule) ends in pointerup too — it must
    // not move the selection.
    fireEvent.pointerDown(lane, { clientX: 300, clientY: 10, pointerId: 3, pointerType: 'touch' });
    fireEvent.pointerUp(lane, { clientX: 360, clientY: 10, pointerId: 3, pointerType: 'touch' });
    expect(handle).toHaveAttribute('aria-valuetext', '2:45 PM–3:45 PM');

    // So must a vertical page scroll that started on a lane.
    fireEvent.pointerDown(lane, { clientX: 300, clientY: 10, pointerId: 4, pointerType: 'touch' });
    fireEvent.pointerUp(lane, { clientX: 302, clientY: 80, pointerId: 4, pointerType: 'touch' });
    expect(handle).toHaveAttribute('aria-valuetext', '2:45 PM–3:45 PM');
  });

  it('lets a coach choose a time where only an OPTIONAL participant is busy, with the board saying so', () => {
    const onChoose = vi.fn();
    const snapshot: ScheduleSnapshot = {
      ...SNAPSHOT,
      participants: [
        ...SNAPSHOT.participants,
        {
          id: 'optional-1',
          kind: 'player',
          name: 'Sam Optional',
          avatarUrl: null,
          isViewer: false,
          required: false,
          verification: 'complete',
          intervals: [{ id: 'busy-o', start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:00:00.000Z', type: 'event', title: 'Class' }],
        },
      ],
    };
    render(
      <SchedulingWorkspace
        snapshot={snapshot}
        initialProposal={{ start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:00:00.000Z' }}
        onChoose={onChoose}
        onClose={() => {}}
        onDateChange={() => {}}
      />,
    );
    // Not "everyone" — but every required person is free and verified.
    expect(screen.queryByText('Everyone is available')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('scheduling-task-board')).getByText('2 of 2 available')).toBeVisible();
    const confirm = screen.getByRole('button', { name: 'Use this time' });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onChoose).toHaveBeenCalledWith({ start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:00:00.000Z' });
  });

  it('names who is busy and offers the next open time when a required person has a conflict', () => {
    render(
      <SchedulingWorkspace
        snapshot={SNAPSHOT}
        initialProposal={{ start: '2026-09-08T12:00:00.000Z', end: '2026-09-08T13:00:00.000Z' }}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
      />,
    );
    expect(screen.getByText('1 of 2 available · busy: You')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Use this time' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^Next open time/ }));
    expect(screen.getByRole('slider', { name: 'Move selected time window' })).toHaveAttribute('aria-valuetext', '1:00 PM–2:00 PM');
    expect(screen.getByRole('button', { name: 'Use this time' })).toBeEnabled();
  });

  it('draws a static "Current" reference band distinct from the movable selected band, and hides the date field when asked', () => {
    render(
      <SchedulingWorkspace
        snapshot={SNAPSHOT}
        initialProposal={{ start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:00:00.000Z' }}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
        referenceInterval={{ start: '2026-09-08T14:00:00.000Z', end: '2026-09-08T15:00:00.000Z' }}
        showDatePicker={false}
        primaryActionLabel="Review new time"
      />,
    );

    // One band per participant row (2 participants here).
    expect(screen.getAllByTitle('Current, 2:00 PM–3:00 PM')).toHaveLength(2);
    // Two per-row band labels plus the legend entry, all reading "Current".
    expect(screen.getAllByText('Current')).toHaveLength(3);
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review new time' })).toBeVisible();
  });

  it('filters the timeline to only the affected people by default, and "Show everyone" reveals the rest in the original order without changing the availability evaluation', () => {
    const snapshot: ScheduleSnapshot = {
      ...SNAPSHOT,
      participants: [
        ...SNAPSHOT.participants,
        {
          id: 'player-2',
          kind: 'player',
          name: 'Jordan Free',
          avatarUrl: null,
          isViewer: false,
          required: true,
          verification: 'complete',
          intervals: [],
        },
      ],
    };
    render(
      <SchedulingWorkspace
        snapshot={snapshot}
        initialProposal={{ start: '2026-09-08T14:00:00.000Z', end: '2026-09-08T15:00:00.000Z' }}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
        affectedParticipantIds={['player-1']}
      />,
    );

    // Everyone here is actually free at 2-3pm, so the evaluation text is
    // identical whether or not a row is hidden from view — filtering rows
    // must never change what "available" means.
    expect(screen.getByText('Everyone is available')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Alex Player schedule' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open You schedule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Jordan Free schedule' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show everyone (3)' });
    fireEvent.click(toggle);

    expect(screen.getByText('Everyone is available')).toBeVisible();
    // All three rows are present, and in the snapshot's own document order
    // (the viewer labeled "You", Alex, Jordan) — never re-sorted "affected
    // first".
    const personRows = screen.getAllByRole('button', { name: /^Open .* schedule$/ });
    expect(personRows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Open You schedule',
      'Open Alex Player schedule',
      'Open Jordan Free schedule',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Show affected only (1)' }));
    expect(screen.queryByRole('button', { name: 'Open You schedule' })).not.toBeInTheDocument();
  });

  it('restores the body scroll position captured before the affected-only toggle', () => {
    render(
      <SchedulingWorkspace
        snapshot={{
          ...SNAPSHOT,
          participants: [...SNAPSHOT.participants, {
            id: 'player-2', kind: 'player', name: 'Jordan Free', avatarUrl: null, isViewer: false,
            required: true, verification: 'complete', intervals: [],
          }],
        }}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
        affectedParticipantIds={['player-1']}
      />,
    );

    // jsdom performs no real layout, so it never actually clamps scrollTop
    // when rows are removed — this only proves the capture-then-restore
    // path runs and does not reset the value (e.g. to 0) across the toggle,
    // which is the part a real browser's clamp would otherwise expose.
    const body = screen.getByTestId('scheduling-body');
    Object.defineProperty(body, 'scrollTop', { value: 140, configurable: true, writable: true });

    fireEvent.click(screen.getByRole('button', { name: 'Show everyone (3)' }));
    expect(body.scrollTop).toBe(140);

    fireEvent.click(screen.getByRole('button', { name: 'Show affected only (1)' }));
    expect(body.scrollTop).toBe(140);
  });

  // A phone is a multi-touch device: a resting thumb, a palm, or a second
  // finger lands on the same band and lanes the gesture is using. One pointer
  // has to own the gesture, or the band jumps between contacts and whichever
  // finger lifts first commits its own position.
  it('ignores a second touch on the band: only the pointer that started the drag can move or end it', async () => {
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
    const timeline = stubTimelineGeometry();
    const handle = screen.getByRole('slider', { name: 'Move selected time window' });
    const band = screen.getByTestId('scheduling-lens');

    // Finger A grabs the band 30px in from its left edge.
    fireEvent.pointerDown(band, { clientX: 246, pointerId: 1, pointerType: 'touch' });
    expect(timeline).toHaveAttribute('data-dragging', 'true');

    // Finger B lands on the band mid-drag and then lifts, far to the right.
    // It owns nothing: it must not re-grab, and its release must not commit
    // its own position or end finger A's drag.
    fireEvent.pointerDown(band, { clientX: 500, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(band, { clientX: 900, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(band, { clientX: 900, pointerId: 2, pointerType: 'touch' });
    expect(handle).toHaveAttribute('aria-valuetext', '1:00 PM–2:00 PM');
    expect(timeline).toHaveAttribute('data-dragging', 'true');

    // Finger A still owns the gesture and still lands where it let go.
    fireEvent.pointerMove(band, { clientX: 306, pointerId: 1, pointerType: 'touch' });
    await waitFor(() => expect(handle).toHaveAttribute('aria-valuetext', '1:30 PM–2:30 PM'));
    fireEvent.pointerUp(band, { clientX: 306, pointerId: 1, pointerType: 'touch' });
    expect(timeline).not.toHaveAttribute('data-dragging');
    expect(handle).toHaveAttribute('aria-valuetext', '1:30 PM–2:30 PM');
    restorePointerCapture();
  });

  it('still places a lane tap when a stray second contact touches another lane first', () => {
    render(
      <SchedulingWorkspace
        snapshot={SNAPSHOT}
        initialProposal={{ start: '2026-09-08T13:00:00.000Z', end: '2026-09-08T14:00:00.000Z' }}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
      />,
    );
    stubTimelineGeometry();
    const handle = screen.getByRole('slider', { name: 'Move selected time window' });
    const [laneA, laneB] = screen.getAllByTestId('scheduling-lane');

    // Finger A taps lane one; a stray contact lands on lane two before A
    // lifts. The lanes share one pending-tap record, so an unscoped second
    // contact used to overwrite it — and A's release then found someone
    // else's id and silently dropped a perfectly good tap.
    fireEvent.pointerDown(laneA!, { clientX: 500, clientY: 10, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerDown(laneB!, { clientX: 300, clientY: 60, pointerId: 3, pointerType: 'touch' });
    fireEvent.pointerUp(laneA!, { clientX: 500, clientY: 10, pointerId: 2, pointerType: 'touch' });
    expect(handle).toHaveAttribute('aria-valuetext', '2:45 PM–3:45 PM');

    // The stray contact's own release places nothing on top of it.
    fireEvent.pointerUp(laneB!, { clientX: 300, clientY: 60, pointerId: 3, pointerType: 'touch' });
    expect(handle).toHaveAttribute('aria-valuetext', '2:45 PM–3:45 PM');
  });

  it('does not render the "Show everyone" toggle when there is nothing more to reveal', () => {
    render(
      <SchedulingWorkspace
        snapshot={SNAPSHOT}
        onChoose={() => {}}
        onClose={() => {}}
        onDateChange={() => {}}
        affectedParticipantIds={['viewer', 'player-1']}
      />,
    );
    expect(screen.queryByRole('button', { name: /Show everyone/ })).not.toBeInTheDocument();
  });
});
