/**
 * Regression guard for the production React #310 crash on the new-round screen
 * (PR #290). The picker opens immediately as the New Round landing screen, so a
 * render-time hooks/framer crash takes down the whole page. The original
 * coverflow drove transforms with framer-motion useScroll/useTransform, which
 * require the scroll-container ref to be hydrated at hook-call time and threw
 * ("Container ref is defined but not hydrated") under concurrent React.
 *
 * This test renders the picker OPEN and lets listCourses resolve (the
 * loading -> loaded re-render that crashed prod). It must mount the carousel
 * with the loaded courses and throw nothing. Any unhandled framer error or a
 * hooks violation fails the run.
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
  getCourseDetail: vi.fn(async () => ({ tees: [] })),
  getTeeRoundDefaults: vi.fn(async () => null),
}));

import { FairwayCoursePicker } from '@/components/fairway/pages/rounds-new/FairwayCoursePicker';

describe('FairwayCoursePicker', () => {
  it('opens and renders the loaded carousel without a render crash', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
      </LazyMotion>,
    );

    // After listCourses resolves the carousel mounts the cards (the exact
    // re-render that crashed prod). findBy* waits for the async state update.
    expect(await screen.findByText('Pebble Beach')).toBeInTheDocument();
    expect(await screen.findByText('Augusta National')).toBeInTheDocument();
    // The "Add a course" create tile is always the final slide.
    expect(screen.getByText('Add a course')).toBeInTheDocument();
  });

  it('renders the empty state when the library is empty', async () => {
    const mod = await import('@/app/golf/actions/course-library');
    (mod.listCourses as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    render(
      <LazyMotion features={domAnimation}>
        <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
      </LazyMotion>,
    );
    expect(await screen.findByText(/No courses yet/i)).toBeInTheDocument();
  });
});
