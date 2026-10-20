import { cache } from 'react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { pickGolfDashboardRole, type GolfDashboardRole } from '@/lib/auth/golf-dashboard-role';

/**
 * The signed-in user's golf dashboard role, once per request: the same rule
 * the dashboard layout draws its shell with (golf-dashboard-role.ts), so a
 * page, the Clubhouse gate and the layout never disagree about coach or
 * player. Null when signed out or with no golf profile.
 *
 * The layout alone also reads users.role when neither profile is onboarded.
 * That only changes the answer for a user with both profiles, neither
 * finished, whose users.role says player: the layout sends them to player
 * onboarding, so no page under it is drawn for the role computed here.
 */
export const getGolfDashboardRole = cache(async (): Promise<GolfDashboardRole | null> => {
  const session = await getGolfSessionProfile();
  return session ? pickGolfDashboardRole(session) : null;
});
