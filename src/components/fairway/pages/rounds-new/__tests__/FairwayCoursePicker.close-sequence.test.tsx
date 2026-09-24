/**
 * The course-picker "flicker" (owner report: "it flickers after you pick the
 * course, the drawer or page transition doesn't act right").
 *
 * vaul keeps the sheet's content mounted for its ~500ms exit slide. The drawer
 * is mocked here to ALWAYS render its children, which is exactly that exit
 * window: whatever the picker renders after `open` goes false is what the
 * player watches slide away.
 *
 *  1. The picker must not reset to "Choose a course" while it is closing. It
 *     resets on the NEXT open instead.
 *  2. A tee pick closes the sheet first and hands the pick to the parent only
 *     after the exit, so the page behind does not restructure under the
 *     sliding sheet.
 *  3. Reopening shows the cached library, not a skeleton.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children }: { children: ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children: ReactNode }) => <div data-testid="drawer-content">{children}</div>,
  DrawerTitle: ({ children, className }: { children: ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
}));
vi.mock('@/lib/coachhelm/v3/motion', () => ({ useReducedMotionGuard: () => false }));
vi.mock('@/components/golf/courses/CourseCard', () => ({
  CourseCard: ({ course, onSelect }: { course: { id: string; name: string }; onSelect?: (id: string) => void }) => (
    // eslint-disable-next-line helm/no-raw-button -- test stub
    <button type="button" data-testid="course-card" onClick={() => onSelect?.(course.id)}>{course.name}</button>
  ),
}));
vi.mock('@/components/fairway/pages/rounds-new/FairwayTeeCard', () => ({
  FairwayTeeCard: ({ tee, onClick, disabled }: { tee: { id: string; name: string }; onClick: () => void; disabled?: boolean }) => (
    // eslint-disable-next-line helm/no-raw-button -- test stub
    <button type="button" disabled={disabled} onClick={onClick}>{`Tee ${tee.name}`}</button>
  ),
}));
vi.mock('@/app/golf/actions/course-library', () => ({
  listCourses: vi.fn(async () => [
    { id: '1', name: 'Pebble Beach', city: 'Pebble Beach', state: 'CA', image_url: 'https://img/pebble.jpg', normalized_name: 'pebble beach' },
  ]),
  getRecentlyPlayedCourses: vi.fn(async () => []),
  getTeamSavedCourses: vi.fn(async () => []),
  getCourseDetail: vi.fn(async () => ({ tees: [{ id: 'tee-blue', name: 'Blue', total_yards: 6800 }] })),
  getTeeRoundDefaults: vi.fn(async () => ({ teeId: 'tee-blue', courseId: '1', courseName: 'Pebble Beach', teeName: 'Blue', holes: [] })),
}));

import { FairwayCoursePicker, PICKER_EXIT_MS } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';
import * as lib from '@/app/golf/actions/course-library';

function ui(open: boolean, onOpenChange: (o: boolean) => void, onPick: (d: unknown) => void) {
  return (
    <LazyMotion features={domAnimation}>
      <FairwayCoursePicker open={open} onOpenChange={onOpenChange} onPick={onPick} />
    </LazyMotion>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('FairwayCoursePicker close sequence', () => {
  it('keeps the tee stage on screen while closing and resets only on the next open', async () => {
    const onOpenChange = vi.fn();
    const onPick = vi.fn();
    const { rerender } = render(ui(true, onOpenChange, onPick));

    fireEvent.click(await screen.findByText('Pebble Beach'));
    expect(await screen.findByText('Tee Blue')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pebble Beach');

    // Parent closes the sheet (X button / tee pick). vaul is still sliding it down.
    rerender(ui(false, onOpenChange, onPick));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pebble Beach');
    expect(screen.getByText('Tee Blue')).toBeInTheDocument();
    expect(screen.queryByText('Choose a course')).not.toBeInTheDocument();

    // Reopen: back to the course list, with the cached library and no skeleton.
    rerender(ui(true, onOpenChange, onPick));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Choose a course');
    expect(screen.getByText('Pebble Beach')).toBeInTheDocument();
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    // (The mocked drawer never unmounts, so framer may still be playing the
    // old stage's exit here; real vaul remounts the content on reopen.)
    await waitFor(() => expect(screen.queryByText('Tee Blue')).not.toBeInTheDocument());
    // The library refreshes in the background on reopen.
    expect(lib.listCourses).toHaveBeenCalledTimes(2);
    await screen.findByText('Pebble Beach');
  });

  it('closes the sheet first and hands the tee to the parent only after the exit', async () => {
    const calls: string[] = [];
    const onOpenChange = vi.fn((o: boolean) => { calls.push(`open:${o}`); });
    const onPick = vi.fn((_d: unknown) => { calls.push('pick'); });
    render(ui(true, onOpenChange, onPick));

    fireEvent.click(await screen.findByText('Pebble Beach'));
    const tee = await screen.findByText('Tee Blue');

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(tee);
      // Let getTeeRoundDefaults resolve.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onPick).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(PICKER_EXIT_MS); });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toMatchObject({ teeId: 'tee-blue', courseImageUrl: 'https://img/pebble.jpg' });
    expect(calls).toEqual(['open:false', 'pick']);
  });

  it('drops a pending tee hand-off if the picker unmounts first', async () => {
    const onPick = vi.fn();
    const { unmount } = render(ui(true, () => {}, onPick));
    fireEvent.click(await screen.findByText('Pebble Beach'));
    const tee = await screen.findByText('Tee Blue');

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(tee);
      await Promise.resolve();
      await Promise.resolve();
    });
    unmount();
    vi.advanceTimersByTime(PICKER_EXIT_MS * 2);
    expect(onPick).not.toHaveBeenCalled();
  });
});
