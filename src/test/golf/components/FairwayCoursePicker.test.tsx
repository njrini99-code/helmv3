/**
 * Regression guard for the production React #310 crash on the new-round screen
 * (PR #290). The picker opens immediately as the New Round landing screen, so a
 * render-time hooks/framer crash takes down the whole page. The original
 * coverflow drove transforms with framer-motion useScroll/useTransform, which
 * require the scroll-container ref to be hydrated at hook-call time and threw
 * ("Container ref is defined but not hydrated") under concurrent React.
 *
 * This test renders the picker OPEN and lets the three feeds (library / recently
 * played / team courses) resolve — the loading -> loaded re-render that crashed
 * prod. It must mount the carousels with the loaded courses and throw nothing.
 * Any unhandled framer error or a hooks violation fails the run. It also locks
 * the sectioned layout (one carousel per feed).
 */
import { render, screen } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/components/golf/courses/CourseCard', () => ({
  CourseCard: ({ course }: { course: { name: string } }) => <div data-testid="course-card">{course.name}</div>,
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
  it('opens and renders the loaded library carousel without a render crash', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
      </LazyMotion>,
    );

    // After the feeds resolve the carousel mounts the cards (the exact re-render
    // that crashed prod). findBy* waits for the async state update.
    expect(await screen.findByText('Pebble Beach')).toBeInTheDocument();
    expect(await screen.findByText('Augusta National')).toBeInTheDocument();
    // The "Add a course" create tile is always the final slide of the library.
    expect(screen.getByText('Add a course')).toBeInTheDocument();
    // The library section is always labelled.
    expect(screen.getByText('Course library')).toBeInTheDocument();
  });

  it('renders Recently played and Team courses sections when those feeds have data', async () => {
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
