import { FairwayMessages } from '@/components/fairway/pages/messages';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isClubhouseFor } from '@/clubhouse/gate';
import { ClubhouseMessagesRoute } from '@/clubhouse/routes/messages';

export default async function GolfMessagesPage() {
  // Clubhouse Messages (golf_clubhouse_ui): coaches and players, on the same
  // realtime hooks and server actions as the Fairway inbox.
  const session = await getGolfSessionProfile();
  if (isClubhouseFor(session?.coach ? 'coach' : session?.player ? 'player' : null)) {
    return <ClubhouseMessagesRoute />;
  }
  return <FairwayMessages />;
}
