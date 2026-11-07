import { redirect } from 'next/navigation';
import { PracticeGroupsRoute } from '@/clubhouse/routes/practice';
import { practiceAvailable } from '@/clubhouse/gate';

/** Flag off: Calendar, never a 404 (N-00 §0.2). */
export default async function Page() {
  if (!(await practiceAvailable())) redirect('/golf/dashboard/calendar');
  return <PracticeGroupsRoute />;
}
