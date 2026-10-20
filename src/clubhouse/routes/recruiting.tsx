import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadRecruiting } from '../data/recruiting';
import { Recruiting } from '../screens/recruiting/Recruiting';
import { RecruitingNoTeam } from '../screens/recruiting/RecruitingNoTeam';
import '../styles/recruiting.css';

/**
 * /golf/dashboard/recruiting in Clubhouse, for coaches only. The page has already sent anyone who is not a coach back
 * to Home, as the current page does; this checks again, so a player's session never reaches the loader. Recruiting
 * is a team record: RLS limits both tables to the team's coach staff, so the role check here is the second lock, not
 * the first (CH-14902).
 */
export async function ClubhouseRecruitingRoute() {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return null;
  const load = await loadRecruiting();
  if (load.kind === 'noTeam') return <RecruitingNoTeam />;
  return <Recruiting data={load.data} />;
}
