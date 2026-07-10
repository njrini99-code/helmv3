import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth/session';
import { requireRecruitingCoachRoute } from '@/lib/baseball/server-route-guards';
import { resolveCoachTeamIdWithCookie } from '@/lib/baseball/resolve-team-server';
import { createClient } from '@/lib/supabase/server';
import CollegeInterestClient from './CollegeInterestClient';
import { fairwayScope } from '@/lib/redesign/flag';

// Force dynamic rendering - requires Supabase auth at runtime
export const dynamic = 'force-dynamic';

// SECURITY: this page had NO server-side auth check at all — an
// unauthenticated request rendered the full client shell (which then made its
// own Supabase calls). Role-specific messaging (college-player lock /
// not-yet-activated lock / "Coaches only") is intentionally left to
// CollegeInterestClient (via useAuth + usePlayerRecruitingGate) — this only
// closes the "must be signed in" gap.
//
// P0 fix: the client used to resolve its own team by calling `.single()` on
// `baseball_team_coach_staff` filtered only by `coach_id`. That errors for
// any coach with 2+ staff rows (guaranteed for showcase/multi-team coaches —
// see CLAUDE.md's coach-type table), so `teamId` never set and the page sat
// on the skeleton loader forever with no error surfaced. It also ignored the
// team-switcher cookie even in the lucky single-row case. Team resolution now
// happens server-side via the same cookie-aware resolver Command Center uses,
// and `teamId` is passed down as a prop instead of being re-derived
// client-side.
//
// The `requireRecruitingCoachRoute()` gate below only runs for coach
// sessions (never player sessions) so it can't short-circuit the player gate
// states above — those are a documented, intentional design (nav-registry.ts:
// "players either see a gate state or are routed back to their own
// recruiting journey"), not a hole to close. What WAS a real gap: any coach
// role — including non-recruiting coach types like High School — could see
// the full "College Interest" surface. This closes that gap the same way
// every sibling recruiting-hub page (discover, watchlist, pipeline, compare)
// already does.
export default async function CollegeInterestPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/baseball/login');

  let teamId: string | null = null;

  if (session.role === 'coach' && session.coach) {
    // Pass the session already fetched above — requireRecruitingCoachRoute
    // accepts it to skip a second (redundant, if harmless thanks to React's
    // cache()-wrapped getSessionProfile) internal fetch.
    await requireRecruitingCoachRoute('/baseball/dashboard/command-center', session);

    const supabase = await createClient();
    teamId = await resolveCoachTeamIdWithCookie(
      supabase,
      session.coach.organization_id,
      session.coach.id,
    );
  }

  return (
    <div className={fairwayScope('min-h-full')}>
      <CollegeInterestClient teamId={teamId} />
    </div>
  );
}
