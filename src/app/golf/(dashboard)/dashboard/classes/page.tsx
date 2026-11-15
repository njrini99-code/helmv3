import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { ClubhouseClassesRoute } from '@/clubhouse/routes/classes';

// The classes are the player's own and follow the session, so this page is never cached.
export const dynamic = 'force-dynamic';

export default async function GolfClassesPage() {
  // Clubhouse Classes: the player's classes. A coach has no Classes page; the Clubhouse frame shows them its
  // not-rebuilt state and never draws this segment.
  const session = await getGolfSessionProfile();
  if (session?.player && (await getGolfDashboardRole()) === 'player') return <ClubhouseClassesRoute />;
  return null;
}
