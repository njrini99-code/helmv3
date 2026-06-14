/**
 * Regression guard for the new-round course picker.
 *
 * 1) The production React #310 crash (PR #290): the picker opens immediately as
 *    the New Round landing screen, so a render-time hooks/framer crash takes the
 *    whole page down. We render it OPEN, let the three feeds resolve (the
 *    loading -> loaded re-render that crashed prod), and assert the shelves mount
 *    with no throw.
 * 2) The sectioned layout (one shelf per feed).
 * 3) Tapping a course advances to the tee stage (the "it didn't ask me to start
 *    the round" report) — a clean, reliable tap target.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// Stub CourseCard as a real tap target wired to onSelect, so the click→tee-stage
// transition is exercised by the test (that's the user-reported bug).
vi.mock('@/components/golf/courses/CourseCard', () => ({
  CourseCard: ({ course, onSelect }: { course: { id: string; name: string }; onSelect?: (id: string) => void }) => (
    <button type="button" data-testid="course-card" onClick={() => onSelect?.(course.id)}>{course.name}</button>
  ),
}));
vi.mock('@/app/golf/actions/course-library', () => ({
  listCourses: vi.fn(async () => [
    { id: '1', name: 'Pebble Beach', city: 'Pebble Beach', state: 'CA', image_url: null, normalized_name: 'pebble beach' },
    { id: '2', name: 'Augusta National', city: 'Augusta', state: 'GA', image_url: null, normalized_name: 'augusta national' },
    { id: '3', name: 'Pinehurst No. 2', city: 'Pinehurst', state: 'NC', image_url: null, normalized_name: 'pinehurst 2' },
  ]),
  getRecentlyPlayedCourses: vi.fn(async () => []),
  getTeamSavedCourses: vi.fn(async () => []),
  getCourseDetail: vi.fn(async () => ({ tees: [] })),
  getTeeRoundDefaults: vi.fn(async () => null),
}));

import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';

type Fn = ReturnType<typeof vi.fn>;

describe('FairwayCoursePicker', () => {
  it('opens and renders the loaded library shelf without a render crash', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
      </LazyMotion>,
    );

    expect(await screen.findByText('Pebble Beach')).toBeInTheDocument();
    expect(await screen.findByText('Augusta National')).toBeInTheDocument();
    expect(screen.getByText('Add a course')).toBeInTheDocument();
    expect(screen.getByText('Course library')).toBeInTheDocument();
  });

  it('renders Recently played and Team courses shelves when those feeds have data', async () => {
    const mod = await import('@/app/golf/actions/course-library');
    (mod.getRecentlyPlayedCourses as unknown as Fn).mockResolvedValueOnce([
      { id: 'r1', name: 'Riverbend', city: 'Asheville', state: 'NC', image_url: null, normalized_name: 'riverbend' },
    ]);
    (mod.getTeamSavedCourses as unknown as Fn).mockResolvedValueOnce([
      { course: { id: 't1', name: 'Home Track', city: 'Clemson', state: 'SC', image_url: null, normalized_name: 'home track' } },
    ]);

    render(
      <LazyMotion features={domAnimation}>
        <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
      </LazyMotion>,
    );

    expect(await screen.findByText('Recently played')).toBeInTheDocument();
    expect(await screen.findByText('Team courses')).toBeInTheDocument();
    expect(screen.getByText('Course library')).toBeInTheDocument();
    expect(screen.getByText('Riverbend')).toBeInTheDocument();
    expect(screen.getByText('Home Track')).toBeInTheDocument();
  });

  it('tapping a course advances to the tee stage', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
      </LazyMotion>,
    );

    fireEvent.click(await screen.findByText('Pebble Beach'));

    // The tee stage's header copy + its empty state (mocked getCourseDetail
    // returns no tees) must appear — proof the tap started the flow.
    expect(await screen.findByText(/Pick the tee set you played/i)).toBeInTheDocument();
    expect(await screen.findByText(/No tee sets yet/i)).toBeInTheDocument();
  });

  it('renders the empty state when every feed is empty', async () => {
    const mod = await import('@/app/golf/actions/course-library');
    (mod.listCourses as unknown as Fn).mockResolvedValueOnce([]);
    render(
      <LazyMotion features={domAnimation}>
        <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
      </LazyMotion>,
    );
    expect(await screen.findByText(/No courses yet/i)).toBeInTheDocument();
  });
});
