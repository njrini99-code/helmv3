import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { resolveClubhouseTeam } from './routes/team';

/**
 * Teams Clubhouse is limited to while it is rolled out (owner, Q-131): a comma-separated list of golf_teams ids in
 * `HELM_CLUBHOUSE_TEAMS`. Unset or empty means no limit, so the flag alone decides, as before. A server-only env value,
 * so the canary is a configuration change, not a code change.
 */
export function clubhouseTeamAllowlist(): Set<string> | null {
  const ids = (process.env.HELM_CLUBHOUSE_TEAMS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

/**
 * The one switch between Fairway and Clubhouse, for coaches and players.
 * Players get the shared screens (Stats, Calendar, Messages) with their own
 * permissions; their other screens show "not rebuilt yet" until designed.
 * With a team allowlist set, only the signed-in user's active team gets
 * Clubhouse; a user whose team cannot be read gets Fairway (fail closed to the
 * screens every team already uses). The session and team reads are
 * request-cached, so calling this from a layout and its page costs one read.
 */
export async function isClubhouseFor(role: 'coach' | 'player' | null | undefined): Promise<boolean> {
  if (!(role === 'coach' || role === 'player') || !isFlagEnabled('golf_clubhouse_ui')) return false;
  const allow = clubhouseTeamAllowlist();
  if (!allow) return true;
  try {
    const session = await getGolfSessionProfile();
    if (!session) return false;
    const team = await resolveClubhouseTeam(session);
    return team != null && team.role === role && allow.has(team.teamId);
  } catch {
    return false;
  }
}

/**
 * Whether a team, rather than the signed-in user, is on Clubhouse: for a link
 * one user's action sends another (a coach's proposal emailed to a player).
 * The flag, then the allowlist by the recipient's team; no team reads as
 * Fairway only while an allowlist is set.
 */
export function isClubhouseForTeam(teamId: string | null | undefined): boolean {
  if (!isFlagEnabled('golf_clubhouse_ui')) return false;
  const allow = clubhouseTeamAllowlist();
  return !allow || (teamId != null && allow.has(teamId));
}

/**
 * The switch between the current entrance pages (sign in and the welcome) and
 * Clubhouse's. Those pages are drawn for a visitor with no role, so the
 * per-role check above cannot apply; this flag is its own (off in production
 * until the owner says so). It chooses the page that is drawn, never what
 * signing in does: both call the same server actions and follow the same redirects.
 */
export function isClubhouseFrontDoor(): boolean {
  return isFlagEnabled('golf_clubhouse_front_door');
}
