import { FairwayMessages } from '@/components/fairway/pages/messages';
import { isClubhouseFor } from '@/clubhouse/gate';
import { ClubhouseMessagesRoute } from '@/clubhouse/routes/messages';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';

export default async function GolfMessagesPage() {
  // Clubhouse Messages (golf_clubhouse_ui): coaches and players, on the same
  // realtime hooks and server actions as the Fairway inbox.
  if ((await isClubhouseFor(await getGolfDashboardRole()))) {
    return <ClubhouseMessagesRoute />;
  }
  return <FairwayMessages />;
}
