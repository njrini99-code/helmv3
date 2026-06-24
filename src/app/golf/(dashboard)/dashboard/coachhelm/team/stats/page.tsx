import { redirect } from 'next/navigation';

/**
 * /golf/dashboard/coachhelm/team/stats is matched by the CoachHelm sub-nav
 * for the Stats tab, but the canonical data route lives at /golf/dashboard/stats/team.
 * Redirect so both paths resolve without a 404.
 */
export default function CoachHelmTeamStatsRedirectPage() {
  redirect('/golf/dashboard/stats/team');
}
