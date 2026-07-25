/**
 * #157 (round 2 mustFix) — FairwayNewRoundEntry renders a saved course's name
 * in at least three read-only spots (the saved-course picker list row, the
 * "Course ready" selected-course summary, and the holes-review eyebrow) that
 * formatCourseName had not reached, even though CourseCard/CourseImage/
 * FairwayCoursePicker/FairwayRecentCourses all normalize casing. The editable
 * "Course name *" manual-entry input must NOT be reformatted — a coach's own
 * typing should never be fought mid-edit.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import type { FairwaySetupForm, FairwayNewRoundEntryProps } from '@/components/fairway/pages/rounds-new/FairwayNewRoundEntry';
import { FairwayNewRoundEntry } from '@/components/fairway/pages/rounds-new/FairwayNewRoundEntry';
import type { SavedCourse } from '@/app/golf/actions/golf';

const shoutyCourse: SavedCourse = {
  id: 'saved-1',
  courseId: 'course-1',
  courseName: 'AUGUSTA NATIONAL GOLF CLUB',
  courseCity: 'Augusta',
  courseState: 'GA',
  courseRating: null,
  courseSlope: null,
  teesPlayed: null,
  holesPerRound: 18,
  holeConfigs: [],
  lastUsedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

const setupData: FairwaySetupForm = {
  courseName: 'AUGUSTA NATIONAL GOLF CLUB',
  courseCity: '',
  courseState: '',
  courseRating: '',
  courseSlope: '',
  teesPlayed: '',
  roundType: 'practice',
  roundDate: '2026-01-01',
};

function baseProps(overrides: Partial<FairwayNewRoundEntryProps> = {}): FairwayNewRoundEntryProps {
  return {
    step: 'setup',
    onBrowseCourseLibrary: vi.fn(),
    recentCourses: [],
    onQuickPickConfirm: vi.fn(),
    isOnline: true,
    loadingSavedCourses: false,
    savedCourses: [shoutyCourse],
    filteredSavedCourses: [shoutyCourse],
    courseMode: 'saved',
    onCourseModeChange: vi.fn(),
    courseSearchQuery: '',
    setCourseSearchQuery: vi.fn(),
    selectedCourseId: shoutyCourse.id,
    onSavedCourseSelect: vi.fn(),
    selectedCourse: shoutyCourse,
    cloudPickActive: false,
    onClearSelectedCourse: vi.fn(),
    setupData,
    setSetupData: vi.fn(),
    saveCourseChecked: false,
    onToggleSaveCourse: vi.fn(),
    holesPerRound: 18,
    setHolesPerRound: vi.fn(),
    preloadedHoleConfigs: null,
    nineSelection: 'front',
    setNineSelection: vi.fn(),
    allActiveQualifiers: [],
    loadingActiveQualifiers: false,
    onPickActiveQualifier: vi.fn(),
    qualifiers: [],
    loadingQualifiers: false,
    qualifierError: null,
    onRetryQualifiers: vi.fn(),
    selectedQualifierId: null,
    setSelectedQualifierId: vi.fn(),
    availableRounds: [],
    selectedRoundNumber: null,
    setSelectedRoundNumber: vi.fn(),
    error: null,
    isStartingRound: false,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onExitToDashboard: vi.fn(),
    onHolesSave: vi.fn(),
    onHolesBack: vi.fn(),
    ...overrides,
  };
}

describe('FairwayNewRoundEntry — casing normalization (#157)', () => {
  it('title-cases the confirmed-course summary', () => {
    render(
      <LazyMotion features={domAnimation}>
        <FairwayNewRoundEntry {...baseProps()} />
      </LazyMotion>,
    );

    expect(screen.queryByText('AUGUSTA NATIONAL GOLF CLUB')).not.toBeInTheDocument();
    // Was ">= 2" (the saved-course LIST row plus the summary). The list no
    // longer renders once a course is confirmed — see the confirm-screen suite
    // below — so the summary is the one remaining place, and it is still
    // title-cased. The assertion moved from "how many" to "it is formatted".
    expect(screen.getAllByText('Augusta National Golf Club').length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT reformat the editable manual "Course name" input value', () => {
    render(
      <LazyMotion features={domAnimation}>
        <FairwayNewRoundEntry
          {...baseProps({
            courseMode: 'new',
            savedCourses: [],
            filteredSavedCourses: [],
            selectedCourse: null,
            selectedCourseId: null,
          })}
        />
      </LazyMotion>,
    );

    const input = screen.getByLabelText('Course name *') as HTMLInputElement;
    expect(input.value).toBe('AUGUSTA NATIONAL GOLF CLUB');
  });

  it('title-cases the eyebrow + baseline label on the holes-review step', () => {
    render(
      <LazyMotion features={domAnimation}>
        <FairwayNewRoundEntry
          {...baseProps({
            step: 'holes',
            preloadedHoleConfigs: [{ holeNumber: 1, par: 4, yardage: 400 }],
          })}
        />
      </LazyMotion>,
    );

    expect(screen.getByText('New round · Augusta National Golf Club')).toBeInTheDocument();
  });
});

/**
 * The confirm-and-go screen (2026-07-25).
 *
 * A new round opens the course picker automatically; the player picks a course
 * and a tee. They then landed on a setup screen whose top half was "Browse
 * course library", a recents row, and a Saved/New list of courses — asked to
 * pick a course they had just picked, with the actual pick acknowledged only by
 * a small "Course ready" line underneath. These pin the fix: once a course is
 * confirmed, the picking machinery is gone and the screen is the course, its
 * holes, and Start.
 */
describe('FairwayNewRoundEntry — confirmed course', () => {
  const HOLES = Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    yardage: 400,
  }));

  function renderConfirmed(overrides: Partial<FairwayNewRoundEntryProps> = {}) {
    return render(
      <LazyMotion features={domAnimation}>
        <FairwayNewRoundEntry
          {...baseProps({
            cloudPickActive: true,
            selectedCourse: null,
            selectedCourseId: null,
            preloadedHoleConfigs: HOLES,
            ...overrides,
          })}
        />
      </LazyMotion>,
    );
  }

  it('drops every course-PICKING affordance', () => {
    renderConfirmed();
    // The three things that made the screen feel like a second course picker.
    expect(screen.queryByRole('button', { name: /browse course library/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /course source/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it('names the round after the course', () => {
    renderConfirmed();
    expect(screen.getByText(/your round at augusta national golf club/i)).toBeInTheDocument();
  });

  it('shows the course photo', () => {
    const { container } = renderConfirmed();
    // CourseImage always resolves something — a real photo when the picker
    // carried one, otherwise a name-derived scene — so the confirm screen is
    // never a grey box.
    expect(container.querySelector('img')).toBeTruthy();
  });

  it('offers a tee change without sending the player back to a course list', () => {
    const onBrowseCourseLibrary = vi.fn();
    renderConfirmed({ onBrowseCourseLibrary });
    const change = screen.getByRole('button', { name: /change tees/i });
    change.click();
    expect(onBrowseCourseLibrary).toHaveBeenCalledTimes(1);
  });

  it('loads the picked holes into an editable scorecard on this same screen', () => {
    renderConfirmed();
    // The editor is inline, not behind a "Next: review holes" tap.
    expect(screen.queryByRole('button', { name: /next: review holes/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start round/i })).toBeInTheDocument();
    // Par/yardage inputs are present and carry the picked tee's values.
    const spin = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(spin.length).toBeGreaterThan(0);
    expect(spin.some((el) => el.value === '400')).toBe(true);
  });

  it('keeps the full picker when NOTHING has been chosen yet', () => {
    // The "closed the picker without choosing" path — must be untouched.
    render(
      <LazyMotion features={domAnimation}>
        <FairwayNewRoundEntry
          {...baseProps({
            cloudPickActive: false,
            selectedCourse: null,
            selectedCourseId: null,
            courseMode: 'new',
          })}
        />
      </LazyMotion>,
    );
    expect(screen.getByRole('button', { name: /browse course library/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Course name *')).toBeInTheDocument();
  });

  it('keeps the shared round-level sections on the confirmed screen', () => {
    // The fix gates the course-PICKING sections in place rather than branching
    // into a separate return, so everything round-level — offline banner, round
    // details, qualifier blocks, error notice — is still rendered from the same
    // JSX and cannot be forgotten in a parallel branch. Round details standing
    // in for that whole set.
    //
    // (The offline banner itself can't be asserted here: OfflineWarningBanner
    // reads the live connection, and jsdom always reports online, so it
    // self-suppresses regardless of the isOnline prop.)
    renderConfirmed();
    expect(screen.getByText('Round details')).toBeInTheDocument();
  });

  it('still shows the generic dock when a confirmed course has no usable holes', () => {
    // A saved course with no hole configs has nothing to seed the editor with,
    // so the parent's own hole-configuration step is still the way forward.
    renderConfirmed({ preloadedHoleConfigs: null });
    expect(screen.getByRole('button', { name: /configure holes/i })).toBeInTheDocument();
  });
});
