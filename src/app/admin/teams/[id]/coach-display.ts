import type { TeamDetailCoach } from '@/lib/admin/data/team-detail';

/** Display name the "Coaches:" line renders — pulled out so
 *  buildCoachDisambiguator can share the exact definition of "the name that
 *  might collide". */
export function coachDisplayName(c: Pick<TeamDetailCoach, 'fullName' | 'email'>): string {
  return c.fullName ?? c.email ?? 'Unnamed coach';
}

/**
 * Bridge audit 2026-08-21: two distinct `golf_coaches` rows can legitimately
 * share a display name (verified live — two different accounts, both named
 * "Matt Thomas", both staffed on both Shenandoah teams), and the "Coaches:"
 * line rendered `c.fullName` alone, so both team pages printed "Coaches:
 * Matt Thomas Matt Thomas" — reading as a duplicate-row bug rather than two
 * real, independent people. Returns a disambiguator string for a coach ONLY
 * when its display name collides with another coach's in `allCoaches` —
 * prefers email (always uniquely identifies the account), falls back to
 * title only when email is unavailable or happens to equal the display name
 * already shown. Returns null for a non-colliding name, so the line renders
 * exactly as it did before this fix in the common case.
 */
export function buildCoachDisambiguator(
  coach: Pick<TeamDetailCoach, 'fullName' | 'email' | 'title'>,
  allCoaches: readonly Pick<TeamDetailCoach, 'fullName' | 'email'>[],
): string | null {
  const displayName = coachDisplayName(coach);
  const collisionCount = allCoaches.filter((c) => coachDisplayName(c) === displayName).length;
  if (collisionCount <= 1) return null;
  if (coach.email && coach.email !== displayName) return coach.email;
  if (coach.title) return coach.title;
  return null;
}
