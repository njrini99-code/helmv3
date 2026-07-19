/**
 * Course-scoping player gate (owner decision: keep the course library OPEN
 * for browsing — players can view courses and pick one for a round — but
 * hide every create/edit/delete control from PLAYER-role sessions; coaches
 * keep full access).
 *
 * CourseLibraryClient owns the page-level "+ Add course" button and the
 * empty-state "Add your first course" CTA — this pins both to `canManageTeam`
 * (the coach-role signal the server page already resolves and passes down),
 * so a player session never sees a create affordance while the library
 * itself stays fully browsable.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GolfCourse } from '@/lib/types/golf-course';

vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/golf/upload-course-image', () => ({ uploadCourseImage: vi.fn() }));
// Mounted-but-closed children (CourseDetailDrawer, CourseFormDrawer) still
// import the server-action module at module-eval time, so it must be
// mocked even though no mutation runs in this test.
vi.mock('@/app/golf/actions/course-library', () => ({
  getCourseDetail: vi.fn(async () => null),
  getCourseTeeHoles: vi.fn(async () => ({})),
  getTeeWithHoles: vi.fn(async () => null),
  saveTeamCourse: vi.fn(async () => ({ success: true })),
  unsaveTeamCourse: vi.fn(async () => ({ success: true })),
  setCourseImageUrl: vi.fn(async () => ({ success: true })),
  removeCourseImage: vi.fn(async () => ({ success: true })),
  setTeamCoursePinned: vi.fn(async () => ({ success: true })),
  setTeamCourseDefaultTee: vi.fn(async () => ({ success: true })),
  softDeleteCourse: vi.fn(async () => ({ success: true })),
  softDeleteTee: vi.fn(async () => ({ success: true })),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
}));

import { CourseLibraryClient } from '@/components/golf/courses/CourseLibraryClient';

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
};

describe('CourseLibraryClient — course-scoping player gate', () => {
  it('a player session renders no "+ Add course" control, with or without courses', () => {
    const { rerender } = render(
      <CourseLibraryClient
        courses={[course]}
        teeCounts={{}}
        savedCourses={[]}
        canManageTeam={false}
        isSuperAdmin={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /Add course/i })).not.toBeInTheDocument();
    // The library stays browsable.
    expect(screen.getByRole('button', { name: `Open ${course.name}` })).toBeInTheDocument();

    rerender(
      <CourseLibraryClient
        courses={[]}
        teeCounts={{}}
        savedCourses={[]}
        canManageTeam={false}
        isSuperAdmin={false}
      />,
    );
    expect(screen.getByText('No courses yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Add your first course/i }),
    ).not.toBeInTheDocument();
  });

  it('a coach session renders the "+ Add course" control, with or without courses', () => {
    const { rerender } = render(
      <CourseLibraryClient
        courses={[course]}
        teeCounts={{}}
        savedCourses={[]}
        canManageTeam
        isSuperAdmin={false}
      />,
    );
    expect(screen.getByRole('button', { name: /Add course/i })).toBeInTheDocument();

    rerender(
      <CourseLibraryClient
        courses={[]}
        teeCounts={{}}
        savedCourses={[]}
        canManageTeam
        isSuperAdmin={false}
      />,
    );
    expect(screen.getByRole('button', { name: /Add your first course/i })).toBeInTheDocument();
  });
});
