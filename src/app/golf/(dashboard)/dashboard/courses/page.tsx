import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { fairwayScope } from '@/lib/redesign/flag';
import {
  listCourses,
  getCourseTeeCounts,
  getTeamSavedCourses,
} from '@/app/golf/actions/course-library';
import { CourseLibraryClient } from '@/components/golf/courses/CourseLibraryClient';

export const metadata: Metadata = {
  title: 'Courses | Helm Golf',
  description: 'The cloud course library — browse courses, manage tee sets, and save your team’s home courses.',
};

// The library must reflect new courses / tees / photos immediately.
export const dynamic = 'force-dynamic';

export default async function CoursesPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  const { role: userRole } = session;
  if (!userRole) redirect('/golf/login');

  const courses = await listCourses({ limit: 200 });
  const [teeCounts, savedCourses] = await Promise.all([
    getCourseTeeCounts(courses.map((c) => c.id)),
    getTeamSavedCourses(),
  ]);

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <CourseLibraryClient
        courses={courses}
        teeCounts={teeCounts}
        savedCourses={savedCourses}
        canManageTeam={userRole === 'coach'}
      />
    </div>
  );
}
