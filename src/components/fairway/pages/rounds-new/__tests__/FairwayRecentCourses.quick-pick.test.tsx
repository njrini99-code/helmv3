/**
 * Quick-pick "Start round" flicker. The old confirm handler called the parent
 * from INSIDE a setPending updater (a side effect in an updater: StrictMode
 * runs it twice), emptied the sheet body in the same render, and the parent's
 * setStep('tracking') then unmounted the still-open sheet with no exit.
 *
 * The Sheet is mocked to always render its children, i.e. vaul's exit window.
 * The test runs under StrictMode, where React double-invokes updater
 * functions — so "called exactly once" discriminates the old bug.
 */
import { StrictMode, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/capacitor', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/motion', () => ({ useReducedMotionGuard: () => false }));
vi.mock('@/components/fairway/overlays/Sheet', () => {
  const Sheet = ({ open, title, children }: { open: boolean; title: ReactNode; children: ReactNode }) => (
    <div data-testid="sheet" data-open={open ? 'true' : 'false'}>
      <h2>{title}</h2>
      {children}
    </div>
  );
  Sheet.Body = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  Sheet.Footer = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Sheet };
});

import { FairwayRecentCourses, QUICK_PICK_EXIT_MS } from '@/components/fairway/pages/rounds-new/FairwayRecentCourses';
import type { RecentPlayedCourse } from '@/app/golf/actions/golf';

const course = {
  id: 'saved-1',
  courseId: 'c-1',
  courseName: 'Alamance CC',
  courseCity: 'Burlington',
  courseState: 'NC',
  courseRating: 71.2,
  courseSlope: 128,
  teesPlayed: 'Blue',
  holesPerRound: 18,
  roundCount: 3,
  holeConfigs: [],
} as unknown as RecentPlayedCourse;

function renderRail(onConfirm: (c: RecentPlayedCourse) => void) {
  return render(
    <StrictMode>
      <FairwayRecentCourses courses={[course]} onConfirmCourse={onConfirm} />
    </StrictMode>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('FairwayRecentCourses quick-pick', () => {
  it('closes the sheet, keeps its content during the exit, then confirms exactly once', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderRail(onConfirm);

    fireEvent.click(screen.getByRole('button', { name: /Start new round at Alamance CC/i }));
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Start round/i }));

    // The sheet is closing, but still shows the course the player confirmed.
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-open', 'false');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Start a new round at Alamance CC?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
    // The parent (which advances the step and unmounts this screen) waits for the exit.
    expect(onConfirm).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(QUICK_PICK_EXIT_MS); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(course);
  });

  it('ignores a second Start tap during the exit', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderRail(onConfirm);

    fireEvent.click(screen.getByRole('button', { name: /Start new round at Alamance CC/i }));
    const start = screen.getByRole('button', { name: /Start round/i });
    fireEvent.click(start);
    fireEvent.click(start);
    // A rail tap mid-exit must not reopen the sheet.
    fireEvent.click(screen.getByRole('button', { name: /Start new round at Alamance CC/i }));
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-open', 'false');

    act(() => { vi.advanceTimersByTime(QUICK_PICK_EXIT_MS); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('never confirms if the rail unmounts before the exit finishes', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const { unmount } = renderRail(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: /Start new round at Alamance CC/i }));
    fireEvent.click(screen.getByRole('button', { name: /Start round/i }));
    unmount();
    vi.advanceTimersByTime(QUICK_PICK_EXIT_MS * 2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Cancel closes without confirming', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderRail(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: /Start new round at Alamance CC/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    act(() => { vi.advanceTimersByTime(QUICK_PICK_EXIT_MS * 2); });
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-open', 'false');
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
