import { rebuiltHref } from '../../shell/nav';

/** Where a player's "Message coach" goes: the coach's direct thread, or Messages when no coach is known. */
export const messageCoachHref = (coachUserId: string | null) => (coachUserId ? `/golf/dashboard/messages?user=${coachUserId}` : '/golf/dashboard/messages');

/** Post a round, once the player's round entry is rebuilt (until then the button isn't drawn). */
export const postRoundHref = () => rebuiltHref('/golf/dashboard/rounds/new', 'player');

/** A player's own stats (rebuilt for players): where the latest round's link goes when its review isn't rebuilt for the viewer. */
export const MY_STATS = '/golf/dashboard/stats';

/** A round's review (the board's "Open recap"), once it is rebuilt for this role; null keeps the Stats link. */
export const roundHref = (roundId: string, role: 'coach' | 'player') => rebuiltHref(`/golf/dashboard/rounds/${roundId}`, role);
