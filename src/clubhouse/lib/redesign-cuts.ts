import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { isMondayBriefEnabled } from '@/lib/coachhelm/v3/monday-brief/flag';

/**
 * Dashboard cuts 1 and 3 (owner, 2026-11-07) belong to the redesign, so they follow `clubhouse_refresh_v1`: on, the
 * CoachHelm Brief tab and the sidebar's Next event card are gone (one home per number); off, Clubhouse keeps the look
 * and behaviour from before Nov 4, Brief and card included.
 */
function redesignOn(): boolean {
  return isFlagEnabled('clubhouse_refresh_v1');
}

/** The coach's Brief (`?view=brief`, its sub-tab, the board's link and the /intelligence landing): its own flag, and the redesign off. */
export function coachBriefEnabled(): boolean {
  return isMondayBriefEnabled() && !redesignOn();
}

/** The sidebar's Next event card, and the shell's read of the team's events that feeds it: the redesign off. */
export function sidebarNextEventEnabled(): boolean {
  return !redesignOn();
}
