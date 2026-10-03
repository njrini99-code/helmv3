import { getGolfSessionProfile } from '@/lib/auth/session';
import { isClubhouseFor } from '@/clubhouse/gate';
import { ClubhouseClassesRoute } from '@/clubhouse/routes/classes';
import LegacyClassesPage from './LegacyClassesPage';

// The classes are the player's own and follow the session, so this page is never cached.
export const dynamic = 'force-dynamic';

export default async function GolfClassesPage() {
  // Clubhouse Classes (golf_clubhouse_ui): the player's classes. Coaches keep the current page
  // (it tells them Classes is a player feature); v2 has no coach Classes page.
  const session = await getGolfSessionProfile();
  if (session?.role === 'player' && session.player && (await isClubhouseFor('player'))) return <ClubhouseClassesRoute />;
  // The current page is one client component that owns its own reads and writes: LegacyClassesPage.tsx, moved unchanged.
  return <LegacyClassesPage />;
}
