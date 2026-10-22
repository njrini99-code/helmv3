import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadWhatsNew } from '../data/whats-new';
import { WhatsNew } from '../screens/whats-new/WhatsNew';

/**
 * /golf/dashboard/whats-new in Clubhouse, for coaches: the team's CoachHelm activity of the past seven days. The team is
 * the coach's own (the action resolves it), never one named in the address. A player's address opens Home
 * (the page's layout redirects them).
 */
export async function ClubhouseWhatsNewRoute() {
  const session = await getGolfSessionProfile();
  if (!session?.coach) return null;
  return <WhatsNew data={await loadWhatsNew()} />;
}
