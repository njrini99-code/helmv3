/**
 * #94 — the course detail modal's outer chrome was a plain vaul mobile
 * bottom-sheet at every width: a drag handle rendered above the content even
 * at desktop, on a flat matte `surface-stone` panel, breaking the ModalShell
 * cream-glass modal language used everywhere else. This pins the desktop
 * (`sm:`) override on CourseDetailDrawer's own DrawerContent instance:
 *   - the drag-handle bar is hidden at `sm:` and up
 *   - the panel picks up the ModalShell `--fw-glass-*` cream-glass recipe at
 *     `sm:` and up instead of staying on the mobile-sheet's matte surface
 *   - (round 2) the panel is REPOSITIONED off the bottom edge — `inset-0
 *     m-auto h-fit` — so it reads as a centered floating modal, not a
 *     recolored bottom-pinned sheet
 *
 * Also re-confirms (#175) that the read-only "Holes" scorecard renders all 18
 * holes (not just 8) for a tee with a full set of hole rows — TeeHolesSummary
 * is a horizontally-scrollable table, not a fixed-height clipped list, so
 * every hole column exists in the DOM regardless of viewport width.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GolfCourse, GolfCourseTee, GolfCourseTeeHole } from '@/lib/types/golf-course';

vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/golf/upload-course-image', () => ({ uploadCourseImage: vi.fn() }));

const course: GolfCourse = {
  id: 'course-1',
  name: 'Test Course',
  city: 'Chapel Hill',
  state: 'NC',
  country: 'USA',
  course_rating: 72.1,
  slope_rating: 130,
  default_tee_name: null,
  default_tee_color: null,
  total_yardage: 6800,
  total_par: 72,
  created_by: 'user-1',
  is_public: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  normalized_name: 'test course',
  slug: 'test-course',
  address: '1 Fairway Dr',
  website: null,
  image_url: null,
  source: 'manual',
  created_by_user_id: 'user-1',
  created_by_team_id: null,
  last_edited_by_user_id: null,
  last_edited_by_team_id: null,
  last_edited_at: null,
  deleted_at: null,
};

const tee: GolfCourseTee = {
  id: 'tee-1',
  course_id: 'course-1',
  tee_name: 'Championship',
  normalized_tee_name: 'championship',
  tee_color: 'Blue',
  category: 'mens',
  total_yards: 6800,
  total_par: 72,
  course_rating: 72.1,
  slope_rating: 130,
  holes_count: 18,
  source: 'manual',
  is_draft: false,
  created_by_user_id: 'user-1',
  created_by_team_id: null,
  last_edited_by_user_id: null,
  last_edited_by_team_id: null,
  last_edited_at: null,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const holes: GolfCourseTeeHole[] = Array.from({ length: 18 }, (_, i) => ({
  id: `hole-${i + 1}`,
  tee_id: 'tee-1',
  hole_number: i + 1,
  par: 4,
  yardage: 380 + i,
  handicap: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})) as unknown as GolfCourseTeeHole[];

vi.mock('@/app/golf/actions/course-library', () => ({
  getCourseDetail: vi.fn(async () => ({ course, tees: [tee] })),
  getCourseTeeHoles: vi.fn(async () => ({ 'tee-1': holes })),
  getTeeWithHoles: vi.fn(async () => null),
  saveTeamCourse: vi.fn(async () => ({ success: true })),
  unsaveTeamCourse: vi.fn(async () => ({ success: true })),
  setCourseImageUrl: vi.fn(async () => ({ success: true })),
  removeCourseImage: vi.fn(async () => ({ success: true })),
  setTeamCoursePinned: vi.fn(async () => ({ success: true })),
  setTeamCourseDefaultTee: vi.fn(async () => ({ success: true })),
  softDeleteCourse: vi.fn(async () => ({ success: true })),
  softDeleteTee: vi.fn(async () => ({ success: true })),
}));

import { CourseDetailDrawer } from '@/components/golf/courses/CourseDetailDrawer';

describe('CourseDetailDrawer — desktop chrome + holes', () => {
  it('hides the mobile-sheet drag handle and applies cream-glass chrome at sm and up', async () => {
    render(
      <CourseDetailDrawer
        courseId="course-1"
        open
        onOpenChange={() => {}}
        canManageTeam={false}
        isSuperAdmin={false}
        savedCourseIds={new Set()}
      />,
    );

    expect((await screen.findAllByText('Championship')).length).toBeGreaterThan(0);

    const panel = document.querySelector('[data-vaul-drawer]') ?? document.querySelector('[role="dialog"]');
    expect(panel).toBeTruthy();
    const className = panel!.className;
    // The desktop-only overrides added to retire the mobile-sheet look.
    expect(className).toContain('sm:[&>div:first-child]:hidden');
    expect(className).toContain('sm:[background:var(--fw-glass-bg-strong)]');
    expect(className).toContain('sm:[box-shadow:var(--fw-shadow-modal)]');
  });

  it('repositions the panel off the bottom edge into a centered floating modal at sm and up', async () => {
    render(
      <CourseDetailDrawer
        courseId="course-1"
        open
        onOpenChange={() => {}}
        canManageTeam={false}
        isSuperAdmin={false}
        savedCourseIds={new Set()}
      />,
    );

    const panel = document.querySelector('[data-vaul-drawer]') ?? document.querySelector('[role="dialog"]');
    expect(panel).toBeTruthy();
    const className = panel!.className;
    // Round 2 (#94 mustFix) — the base DrawerContent primitive is
    // `fixed inset-x-0 bottom-0 mt-24`, which pins the panel to the bottom
    // edge of the viewport even with the cream-glass recolor. These
    // overrides free it from the bottom edge and center it, matching the
    // ModalShell `inset-0 m-auto h-fit` recipe.
    expect(className).toContain('sm:inset-0');
    expect(className).toContain('sm:m-auto');
    expect(className).toContain('sm:bottom-auto');
    expect(className).toContain('sm:mt-0');
    expect(className).toContain('sm:h-fit');
  });

  it('renders all 18 holes in the read-only scorecard, not just 8', async () => {
    render(
      <CourseDetailDrawer
        courseId="course-1"
        open
        onOpenChange={() => {}}
        canManageTeam={false}
        isSuperAdmin={false}
        savedCourseIds={new Set()}
      />,
    );

    expect(await screen.findByText('Holes')).toBeInTheDocument();
    // The "Hole" row prints every hole number 1..18 as its own cell.
    for (const n of [1, 8, 9, 10, 17, 18]) {
      expect(screen.getByText(String(n))).toBeInTheDocument();
    }
    expect(screen.queryByText('19')).not.toBeInTheDocument();
  });
});
