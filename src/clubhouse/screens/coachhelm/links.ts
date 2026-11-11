import { rebuiltHref } from '../../shell/nav';

/** Where a player's CoachHelm controls go. A target that isn't rebuilt yet isn't drawn (nav.rebuiltHref), never a dead button. */
export const coachHelmLinks = {
  /** Round entry once it is rebuilt; until then the Rounds library, named for what it is. */
  startRound: (): { href: string; label: string } | null => {
    const entry = rebuiltHref('/golf/dashboard/rounds/new', 'player');
    if (entry) return { href: entry, label: 'New round' };
    const library = rebuiltHref('/golf/dashboard/rounds', 'player');
    return library ? { href: library, label: 'Open Rounds' } : null;
  },
};
