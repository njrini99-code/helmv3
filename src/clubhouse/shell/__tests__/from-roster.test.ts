import { describe, expect, it } from 'vitest';
import { activeNavItemFrom } from '../nav';
import { statsBackLink } from '../../screens/stats/links';

/**
 * Coach audit 13 Nov 2026 (§8 #7): a player opened from Roster lit Stats in the sidebar and offered "Team stats" as the way
 * back. Roster's link carries `from=roster`; the sidebar keeps Roster lit and the profile's back link reads "Roster".
 */
describe('activeNavItemFrom', () => {
  it('keeps the section a page was opened from lit', () => {
    expect(activeNavItemFrom('/golf/dashboard/stats', 'player=p1&from=roster', 'coach')?.id).toBe('roster');
  });

  it('is the page’s own section otherwise', () => {
    expect(activeNavItemFrom('/golf/dashboard/stats', 'player=p1', 'coach')?.id).toBe('stats');
    expect(activeNavItemFrom('/golf/dashboard/stats', '', 'coach')?.id).toBe('stats');
  });

  it('ignores a "from" that names no section of the role', () => {
    expect(activeNavItemFrom('/golf/dashboard/stats', 'from=nowhere', 'coach')?.id).toBe('stats');
  });
});

describe('statsBackLink', () => {
  it('goes back to Roster when the player was opened from it', () => {
    expect(statsBackLink('roster')).toEqual({ label: 'Roster', href: '/golf/dashboard/roster' });
  });

  it('is Team stats otherwise (the page’s own)', () => {
    expect(statsBackLink(null)).toBeNull();
    expect(statsBackLink('nowhere')).toBeNull();
  });
});
