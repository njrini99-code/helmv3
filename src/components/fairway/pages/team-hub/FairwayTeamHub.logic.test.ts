import { describe, it, expect } from 'vitest';
import { showAnnouncementsList } from './FairwayTeamHub';

/* ---------------------------------------------------------------------------
 * showAnnouncementsList (W1 count-coherence audit)
 * ----------------------------------------------------------------------------
 * The Team Hub Announcements tab folded a FAILED fetch into a bare `[]`, then
 * gated on `announcements.length > 0` alone — so a load error rendered the
 * exact same "No announcements" EmptyState as a genuinely empty team, even
 * though the dedicated /dashboard/announcements page (a separate query path)
 * could still show real rows for the same team. A load error must always
 * route to AnnouncementsList so ITS OWN honest "Couldn't load" + retry state
 * (hub-parts.tsx) has a chance to render, regardless of the empty array.
 * No time, no I/O — pure function only.
 * ------------------------------------------------------------------------- */

describe('showAnnouncementsList', () => {
  it('routes to AnnouncementsList when there are real announcements', () => {
    expect(showAnnouncementsList(4, false)).toBe(true);
  });

  it('routes to AnnouncementsList on a load failure even with zero announcements (the regression)', () => {
    expect(showAnnouncementsList(0, true)).toBe(true);
  });

  it('shows the plain "No announcements" empty state only for a genuinely empty, successful fetch', () => {
    expect(showAnnouncementsList(0, false)).toBe(false);
  });
});
