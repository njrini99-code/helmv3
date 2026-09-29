import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadSettings } from '../data/settings';
import { Settings } from '../screens/settings/Settings';
import { parseSection } from '../screens/settings/model';
import { resolveClubhouseTeam } from './team';

/**
 * /golf/dashboard/settings in Clubhouse, for coaches and players. Settings
 * works without a team (a player can join one from here), so a missing team
 * is not an empty state: the team-only cards simply aren't there.
 */
export async function ClubhouseSettingsRoute({ section }: { section?: string }) {
  const session = await getGolfSessionProfile();
  if (!session || (!session.coach && !session.player)) return null;
  const team = await resolveClubhouseTeam(session);
  const data = await loadSettings(session, team?.teamId ?? null);
  return <Settings data={data} section={parseSection(section, data.role)} />;
}
