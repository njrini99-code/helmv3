/**
 * The one rule for which golf dashboard a signed-in user gets: coach or player.
 *
 * The dashboard layout (`src/app/golf/(dashboard)/layout.tsx`) has always
 * decided this: an onboarded coach profile wins, else an onboarded player
 * profile, and a user with both profiles falls back to the declared role
 * (then coach). Pages, the Clubhouse gate and its team resolver used to ask
 * "is there a coach row?" instead, so a user with a player profile they
 * finished and a coach profile they never did got the player shell from the
 * layout and coach screens from the pages. Every Clubhouse decision (the
 * gate's role, the alias redirects, the team resolver) now asks this module.
 *
 * `getGolfSessionProfile().role` deliberately keeps the older "has a coach
 * row" rule: Fairway pages read it, and Fairway must not change for anyone.
 *
 * Pure (no session, no server-only) so the Clubhouse team resolver, the
 * layout and tests can all share it without import cycles.
 */

export type GolfDashboardRole = 'coach' | 'player';

interface ProfileLike {
  onboarding_completed?: boolean | null;
}

/**
 * The role the onboarding flags declare, or null when neither profile is
 * onboarded (the layout then reads users.role on its slow path).
 */
export function onboardedGolfRole(coach: ProfileLike | null | undefined, player: ProfileLike | null | undefined): GolfDashboardRole | null {
  if (coach?.onboarding_completed) return 'coach';
  if (player?.onboarding_completed) return 'player';
  return null;
}

/**
 * The dashboard role for these profiles. `declaredRole` overrides the
 * onboarding-derived declaration (the layout's slow path passes users.role);
 * without it, the onboarding flags declare it.
 */
export function pickGolfDashboardRole(
  profiles: { coach: ProfileLike | null | undefined; player: ProfileLike | null | undefined },
  declaredRole?: GolfDashboardRole | null,
): GolfDashboardRole | null {
  const { coach, player } = profiles;
  const declared = declaredRole === undefined ? onboardedGolfRole(coach, player) : declaredRole;
  if (coach && player) return declared || 'coach';
  if (coach) return 'coach';
  if (player) return 'player';
  return declared;
}
