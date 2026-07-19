/**
 * Course-scoping player gate (owner decision: keep the course library OPEN
 * for browsing — players can view courses and pick one for a round — but
 * hide every create/edit/delete control from PLAYER-role sessions; coaches
 * keep full access).
 *
 * Root cause: `canEditCourse` in CourseDetailDrawer only checked
 * library-ownership / super-admin status, never the viewer's role, and the
 * "Add tee" button plus the per-tee "Edit" button had NO gate at all. So a
 * player viewing any non-library (team/user-contributed) course saw "Edit
 * course", the photo upload/replace/remove controls, "Add tee", and the
 * per-tee "Edit" button — this test pins the fix by rendering the drawer
 * with a non-library course (created_by_user_id set) under both roles.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GolfCourse, GolfCourseTee } from '@/lib/types/golf-course';

vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/golf/upload-course-image', () => ({ uploadCourseImage: vi.fn() }));

const baseCourse: GolfCourse = {
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
  // Non-library (team/user-contributed) course: created_by_user_id is set, so
  // the pre-fix `canEditCourse = !isLibraryOwned || isSuperAdmin` was TRUE
  // for every viewer, coach or player. Has a photo so "Replace"/"Remove
  // photo" are both reachable in the coach assertions below.
  image_url: 'https://example.com/course.jpg',
  source: 'manual',
  created_by_user_id: 'user-1',
  created_by_team_id: null,
  last_edited_by_user_id: null,
  last_edited_by_team_id: null,
  last_edited_at: null,
  deleted_at: null,
};

const baseTee: GolfCourseTee = {
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

vi.mock('@/app/golf/actions/course-library', () => ({
  getCourseDetail: vi.fn(async () => ({ course: baseCourse, tees: [baseTee] })),
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
}));

import { CourseDetailDrawer } from '@/components/golf/courses/CourseDetailDrawer';

describe('CourseDetailDrawer — course-scoping player gate', () => {
  it('a player session renders none of the create/edit/delete controls', async () => {
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

    // Wait for the course + tee to load (unique text — the drawer title and
    // the hero heading both render "Test Course", so anchor on the tee name).
    expect(await screen.findByText('Championship')).toBeInTheDocument();

    // Course-level mutation controls
    expect(screen.queryByRole('button', { name: /Edit course/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove course/i })).not.toBeInTheDocument();
    // Photo controls (upload/replace/remove)
    expect(screen.queryByRole('button', { name: /Replace|Add photo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument();
    // Tee-set controls
    expect(screen.queryByRole('button', { name: /Add tee/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: `Edit ${baseTee.tee_name}` }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: `Delete ${baseTee.tee_name} tee set` }),
    ).not.toBeInTheDocument();
    // Team-scoped actions stay coach-only too
    expect(screen.queryByRole('button', { name: /Save to team/i })).not.toBeInTheDocument();
  });

  it('a coach session renders every create/edit/delete control', async () => {
    render(
      <CourseDetailDrawer
        courseId="course-1"
        open
        onOpenChange={() => {}}
        canManageTeam
        isSuperAdmin={false}
        savedCourseIds={new Set()}
      />,
    );

    expect(await screen.findByText('Championship')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Edit course/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove course/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Replace/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add tee/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Edit ${baseTee.tee_name}` })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Delete ${baseTee.tee_name} tee set` }),
    ).toBeInTheDocument();
  });
});
