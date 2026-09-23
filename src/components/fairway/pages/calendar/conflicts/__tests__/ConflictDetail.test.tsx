/**
 * ConflictDetail — SCREEN-BUILD-PLAN.md §2.8.
 *
 * The load-bearing test here is the redacted-class overlap: `getConflictInbox`
 * withholds a class occurrence's title when the viewer lacks detail access
 * (conflict-inbox.ts's own rule 2), and this component must never fabricate
 * one to fill the gap — it renders a plain "Busy" fallback instead. Every
 * other test guards the zero-overlap fallback path (no data to compare, so
 * no `SchedulingWorkspace` at all) and the offline/disabled-CTA states.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ConflictDetail } from '../ConflictDetail';
import { conflictInboxFixtures } from '@/test/fixtures/calendar-screens';
import type { ConflictGroup, ConflictInboxSnapshot } from '@/app/golf/actions/conflict-inbox';

const TIME_ZONE = 'America/New_York';

const withOverlapsGroups = (conflictInboxFixtures.withOverlaps as { success: true; data: ConflictInboxSnapshot }).data.groups;
const unverifiedOnlyGroups = (conflictInboxFixtures.unverifiedOnly as { success: true; data: ConflictInboxSnapshot }).data.groups;

// [0]: coach detail access — a real class title is visible.
const cleanGroup = withOverlapsGroups[0]!;
// [1]: viewer lacks class-detail access — `access: 'free_busy'`, no title.
const redactedGroup = withOverlapsGroups[1]!;
// Zero overlaps, one attendee whose schedule could not be checked.
const partialGroup = unverifiedOnlyGroups[0]!;

const CHECKED_AT = '2026-09-08T12:00:00.000Z';

describe('ConflictDetail — redacted class overlap (privacy)', () => {
  it('renders the withheld overlap as time-only, never fabricating the class name it does not have', () => {
    render(
      <ConflictDetail group={redactedGroup} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} onReviewNewTime={() => {}} />,
    );
    // The affected-person row: name is real (the server sends names), but
    // the conflicting event has no title, only a time range prefixed "Busy".
    // (The name legitimately repeats inside the embedded scheduling
    // workspace's own participant row below — scope to the affected-people
    // list to check this specific row's text.)
    const affectedList = screen.getByRole('list');
    expect(within(affectedList).getByText('Sam Rivera')).toBeInTheDocument();
    expect(within(affectedList).getByText(/^Busy · /)).toBeInTheDocument();
    // No class name ever appears anywhere in the tree for this group — there
    // is nothing to leak, and nothing here may render as if there were.
    expect(screen.queryByText(/CS 201/)).not.toBeInTheDocument();
    expect(screen.queryByText('Introduction to Computer Science')).not.toBeInTheDocument();
  });
});

describe('ConflictDetail — a confirmed overlap embeds the scheduling workspace', () => {
  it('shows the reference band and the "Review new time" CTA, keyed to the event\'s own original time', () => {
    render(
      <ConflictDetail group={cleanGroup} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} onReviewNewTime={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Team Practice' })).toBeInTheDocument();
    expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Review new time' })).toBeInTheDocument();
    // The affected person named in this group's own overlap is present (in
    // both the affected-people list and the embedded workspace's own row —
    // both are real surfaces, so at least one match is what matters here).
    expect(screen.getAllByText('Braeden Grant').length).toBeGreaterThan(0);
  });

  it('fires onReviewNewTime with a proposal from the embedded workspace CTA', () => {
    const onReviewNewTime = vi.fn();
    render(
      <ConflictDetail group={cleanGroup} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} onReviewNewTime={onReviewNewTime} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review new time' }));
    expect(onReviewNewTime).toHaveBeenCalledTimes(1);
    const [proposal] = onReviewNewTime.mock.calls[0]!;
    expect(proposal).toEqual(expect.objectContaining({ start: expect.any(String), end: expect.any(String) }));
  });

  it('disables the CTA while offline, never letting an unconfirmed offline read propose a time', () => {
    render(
      <ConflictDetail group={cleanGroup} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} isOffline onReviewNewTime={() => {}} />,
    );
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review new time' })).toBeDisabled();
  });
});

describe('ConflictDetail — nothing confirmed to compare (zero overlaps)', () => {
  it('shows the unverified notice and "Open Find a time", never an embedded workspace with no one in it', () => {
    render(
      <ConflictDetail group={partialGroup} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} onReviewNewTime={() => {}} />,
    );
    expect(screen.getByText(/could not be checked this pass/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Find a time' })).toBeInTheDocument();
    expect(screen.queryByTestId('scheduling-workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Affected people')).not.toBeInTheDocument();
  });

  it('proposes the event\'s own unchanged time when "Open Find a time" is used, and disables it offline', () => {
    const onReviewNewTime = vi.fn();
    const { rerender } = render(
      <ConflictDetail group={partialGroup} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} onReviewNewTime={onReviewNewTime} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Find a time' }));
    expect(onReviewNewTime).toHaveBeenCalledWith({ start: partialGroup.event.start, end: partialGroup.event.end });

    rerender(
      <ConflictDetail group={partialGroup} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} isOffline onReviewNewTime={onReviewNewTime} />,
    );
    expect(screen.getByRole('button', { name: 'Open Find a time' })).toBeDisabled();
  });
});

describe('ConflictDetail — affected people, expandable list', () => {
  it('collapses beyond 3 named overlaps and expands on "Show N more"', () => {
    const group: ConflictGroup = {
      event: { id: 'e1', title: 'Big Meeting', start: '2026-09-08T14:00:00.000Z', end: '2026-09-08T15:00:00.000Z', type: 'meeting' },
      overlaps: [
        { playerId: 'p1', name: 'Player One', avatarUrl: null, conflictingEvent: { start: '2026-09-08T14:00:00.000Z', end: '2026-09-08T14:30:00.000Z', type: 'event', title: 'Tutoring' } },
        { playerId: 'p2', name: 'Player Two', avatarUrl: null, conflictingEvent: { start: '2026-09-08T14:00:00.000Z', end: '2026-09-08T14:30:00.000Z', type: 'event', title: 'Tutoring' } },
        { playerId: 'p3', name: 'Player Three', avatarUrl: null, conflictingEvent: { start: '2026-09-08T14:00:00.000Z', end: '2026-09-08T14:30:00.000Z', type: 'event', title: 'Tutoring' } },
        { playerId: 'p4', name: 'Player Four', avatarUrl: null, conflictingEvent: { start: '2026-09-08T14:00:00.000Z', end: '2026-09-08T14:30:00.000Z', type: 'event', title: 'Tutoring' } },
      ],
      unverifiedAttendeeIds: [],
      verification: 'complete',
    };
    render(<ConflictDetail group={group} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} onReviewNewTime={() => {}} />);
    // Scope to the affected-people list: the embedded scheduling workspace
    // legitimately repeats every one of these names in its own rows below.
    const affectedList = screen.getByRole('list');
    expect(within(affectedList).getByText('Player One')).toBeInTheDocument();
    expect(within(affectedList).getByText('Player Three')).toBeInTheDocument();
    expect(within(affectedList).queryByText('Player Four')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));
    expect(within(affectedList).getByText('Player Four')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });
});

describe('ConflictDetail — 320px mobile', () => {
  it('renders the header, affected people, and CTA at a 320px viewport', () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true, writable: true });
    render(
      <ConflictDetail group={cleanGroup} timeZone={TIME_ZONE} checkedAt={CHECKED_AT} onReviewNewTime={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Team Practice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close conflict detail' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review new time' })).toBeInTheDocument();
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true });
  });
});
