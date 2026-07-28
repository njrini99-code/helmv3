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
 * 4) The course-library MANAGEMENT gate (prod incident 700c9a87,
 *    "[createCourse] Only coaches can manage the course library"): createCourse
 *    and createTee both sit behind requireCoachActor, but this picker rendered
 *    its create affordances unconditionally — including on the PLAYER-ONLY
 *    new-round route, where they could never succeed. `canManageLibrary`
 *    defaults closed; the coach-only qualifier call sites opt in.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '@/components/ui/button';

vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
// Stub CourseCard as a real tap target wired to onSelect, so the click→tee-stage
// transition is exercised by the test (that's the user-reported bug).
vi.mock('@/components/golf/courses/CourseCard', () => ({
  CourseCard: ({ course, onSelect }: { course: { id: string; name: string }; onSelect?: (id: string) => void }) => (
    <Button type="button" data-testid="course-card" onClick={() => onSelect?.(course.id)}>{course.name}</Button>
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
        <FairwayCoursePicker canManageLibrary open onOpenChange={() => {}} onPick={() => {}} />
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
        <FairwayCoursePicker canManageLibrary open onOpenChange={() => {}} onPick={() => {}} />
      </LazyMotion>,
    );
    expect(await screen.findByText(/No courses yet/i)).toBeInTheDocument();
  });

  /**
   * Incident 700c9a87. The action-side gate (requireCoachActor) was always
   * correct — every one of these affordances was a button whose ONLY outcome
   * for a player was the rejection toast. The new-round route admits players
   * exclusively, so on its single highest-traffic surface the failure rate was
   * 100%. Default-closed is what makes the omission safe: a new call site has
   * to opt in deliberately.
   */
  describe('course-library management gate (default: player)', () => {
    it('hides the create tile from a viewer who cannot manage the library', async () => {
      render(
        <LazyMotion features={domAnimation}>
          <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
        </LazyMotion>,
      );

      // The shelf itself still loads — only the create affordance is withheld.
      expect(await screen.findByText('Pebble Beach')).toBeInTheDocument();
      expect(screen.getByText('Course library')).toBeInTheDocument();
      expect(screen.queryByText('Add a course')).not.toBeInTheDocument();
    });

    it('offers the contribute-on-save path instead of a dead button when the library is empty', async () => {
      const mod = await import('@/app/golf/actions/course-library');
      (mod.listCourses as unknown as Fn).mockResolvedValueOnce([]);
      render(
        <LazyMotion features={domAnimation}>
          <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
        </LazyMotion>,
      );

      expect(await screen.findByText(/No courses yet/i)).toBeInTheDocument();
      // Players keep the capability via contributeCourseFromRound — the copy
      // must point there rather than dead-ending.
      expect(await screen.findByText(/type the course name on the setup screen/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add a course/i })).not.toBeInTheDocument();
    });

    it('hides the add-tee affordance too — createTee shares the same gate', async () => {
      render(
        <LazyMotion features={domAnimation}>
          <FairwayCoursePicker open onOpenChange={() => {}} onPick={() => {}} />
        </LazyMotion>,
      );

      fireEvent.click(await screen.findByText('Pebble Beach'));

      expect(await screen.findByText(/No tee sets yet/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add a tee set/i })).not.toBeInTheDocument();
    });

    it('shows the add-tee affordance to a coach', async () => {
      render(
        <LazyMotion features={domAnimation}>
          <FairwayCoursePicker canManageLibrary open onOpenChange={() => {}} onPick={() => {}} />
        </LazyMotion>,
      );

      fireEvent.click(await screen.findByText('Pebble Beach'));

      expect(await screen.findByText(/No tee sets yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add a tee set/i })).toBeInTheDocument();
    });
  });
});
