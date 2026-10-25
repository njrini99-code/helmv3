/** The confirm screen's words: today's `golf-join-team-client.tsx`, shaped for the panel. */

/** "Class of 2027" for a four-digit graduation year; the older tokens ("freshman") as they were written. */
export function classLabel(value: string): string {
  if (/^\d{4}$/.test(value)) return `Class of ${value}`;
  const v = value.replace('_', ' ');
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** The program, where it is and the season: "Varsity Golf · Raleigh, NC · 2026-27", whatever of it is known. */
export function teamPlace(team: { season?: string | null; organization?: { name: string; city?: string | null; state?: string | null } }): string {
  const o = team.organization;
  const where = o?.city && o?.state ? `${o.city}, ${o.state}` : null;
  return [o?.name, where, team.season].filter(Boolean).join(' · ') || 'A GolfHelm team';
}

/**
 * A refused join, in the server's own words (the validator writes them for people). Being on another team is a warning,
 * not a failure: nothing is wrong with the code, and the way forward is to leave that team first. CH-15939 / CH-15032.
 */
export function joinFailure(error?: string | null, network = false): { message: string; tone: 'danger' | 'warning'; code: string } {
  if (network) return { message: 'Couldn’t join the team. Try again.', tone: 'danger', code: 'CH-15033' };
  const message = error || 'Failed to join team. Please try again.';
  if (/already on|one team/i.test(message)) return { message, tone: 'warning', code: 'CH-15939' };
  return { message, tone: 'danger', code: 'CH-15032' };
}
