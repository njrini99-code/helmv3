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
  it('title-cases the saved-course list row and the selected-course "Course ready" summary', () => {
    render(
      <LazyMotion features={domAnimation}>
        <FairwayNewRoundEntry {...baseProps()} />
      </LazyMotion>,
    );

    expect(screen.queryByText('AUGUSTA NATIONAL GOLF CLUB')).not.toBeInTheDocument();
    // Appears at least in the saved-course list row + the "Course ready" summary.
    expect(screen.getAllByText('Augusta National Golf Club').length).toBeGreaterThanOrEqual(2);
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
