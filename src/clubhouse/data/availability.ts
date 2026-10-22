/**
 * Whether a player can play right now (golf_team_members.availability). Display only: it never changes who is on the team
 * or what they can open. Kept apart from data/roster.ts so Home and Calendar can read it without the Roster loader.
 */
export type ChAvailability = 'available' | 'injured' | 'away';

/** The column is CHECKed to these three; anything else reads as available rather than inventing a state. */
export function parseAvailability(value: string | null | undefined): ChAvailability {
  return value === 'injured' || value === 'away' ? value : 'available';
}

/** Out for now: the coach already knows why, so nothing flags this player for a missing round or a reply. */
export function isOut(value: ChAvailability | null | undefined): boolean {
  return value === 'injured' || value === 'away';
}

/** The coach-only note's length, as the table's check allows it (golf_player_availability_coach_notes). */
export const AVAILABILITY_NOTE_MAX = 280;

/** PostgREST / Postgres codes for "that table is not there": the held migration has not been applied yet. */
export const NOTE_TABLE_MISSING_CODES: ReadonlySet<string> = new Set(['42P01', 'PGRST205']);
