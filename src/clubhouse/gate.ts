import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { isFlagEnabled } from '@/lib/flags/is-enabled';

/**
 * Tag the request's server events `ui=clubhouse`, the tag the browser sets for the whole session (`chTagSession`,
 * lib/track.ts). Clubhouse is the only coach and player UI (Fairway retired, owner 2026-11-14); the tag stays because
 * the monitoring queries in docs/clubhouse/STATUS.md filter on it. The isolation scope is the request's on the server,
 * so the tag covers every event the request sends after it and no other request. Telemetry never decides the screen:
 * a failure here is ignored.
 */
export function tagClubhouseRequest(): void {
  try {
    Sentry.getIsolationScope().setTag('ui', 'clubhouse');
  } catch {
    /* best effort */
  }
}

/**
 * Whether the dashboard role is one Clubhouse draws: a coach or a player. Every dashboard role is one of the two
 * (the dashboard layout sends anyone else to onboarding or the admin dashboard), so this answers no only for a missing
 * or unknown role. A yes also tags the request's server events `ui=clubhouse` (above).
 */
export async function isClubhouseFor(role: 'coach' | 'player' | null | undefined): Promise<boolean> {
  if (!(role === 'coach' || role === 'player')) return false;
  tagClubhouseRequest();
  return true;
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

/**
 * Tournaments (P016) is a Clubhouse page behind its own release flag, `golf_tournaments_v1` (off in production until
 * the owner applies its held migrations and turns it on). Every Tournaments route, loader and server action asks this
 * first, so with the flag off nothing reads a tournament table and the routes answer not found. A `'use server'` export
 * is callable without its route, which is why the actions ask too.
 */
export async function isTournamentsFor(role: 'coach' | 'player' | null | undefined): Promise<boolean> {
  if (!isFlagEnabled('golf_tournaments_v1')) return false;
  return isClubhouseFor(role);
}

/** Whether the Tournaments nav entry may show: the flag only (the shell that draws it is already Clubhouse's). */
export function tournamentsNavEnabled(): boolean {
  return isFlagEnabled('golf_tournaments_v1');
}
