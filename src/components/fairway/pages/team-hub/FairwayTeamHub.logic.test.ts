import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FairwayTeamHub, showAnnouncementsList } from './FairwayTeamHub';

const fixture = {
  tasks: [],
  announcements: [],
  trips: [],
  classes: [],
  teammates: [],
  playerName: 'Jamie Player',
  teamName: 'Wildcats Golf',
  onCompleteTask: async () => {},
};

describe('Team Hub operational overview', () => {
  it('opens on an operational overview with direct access to each team workflow', () => {
    render(createElement(FairwayTeamHub, fixture));

    expect(screen.getByRole('heading', { name: /team hub/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^tasks$/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^announcements$/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^travel$/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /class schedule/i })).toBeVisible();
    expect(screen.queryByRole('tab', { name: /teammates/i })).not.toBeInTheDocument();
  });

  it('switches from an overview action to the corresponding detail tab', async () => {
    const user = userEvent.setup();
    render(createElement(FairwayTeamHub, fixture));

    await user.click(screen.getByRole('button', { name: /view all tasks/i }));

    expect(screen.getByRole('tab', { name: /^tasks$/i })).toHaveAttribute('aria-selected', 'true');
  });
});

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
