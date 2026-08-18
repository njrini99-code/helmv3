import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FairwayTeamHub, FairwayTeamHubWrapper, showAnnouncementsList } from './FairwayTeamHub';

const fixture = {
  tasks: [],
  announcements: [],
  trips: [],
  classes: [],
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

  it('maps every overview action to its detailed operation tab', async () => {
    const user = userEvent.setup();
    render(createElement(FairwayTeamHub, fixture));

    for (const [action, tab] of [
      ['View all tasks', 'Tasks'],
      ['View all announcements', 'Announcements'],
      ['View all travel', 'Travel'],
      ['View class schedule', 'Class schedule'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: action }));
      expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
      await user.click(screen.getByRole('tab', { name: 'Overview' }));
    }
  });

  it('never calls a failed task, travel, or class read an empty team state', () => {
    render(
      createElement(FairwayTeamHub, {
        ...fixture,
        tasksLoadError: true,
        tripsLoadError: true,
        classesLoadError: true,
      }),
    );

    expect(screen.getByText("Couldn't load tasks")).toBeVisible();
    expect(screen.getByText("Couldn't load travel plans")).toBeVisible();
    expect(screen.getByText("Couldn't load your class schedule")).toBeVisible();
    expect(screen.queryByText('No outstanding tasks')).not.toBeInTheDocument();
    expect(screen.queryByText('No upcoming travel')).not.toBeInTheDocument();
    expect(screen.queryByText('No classes on your schedule')).not.toBeInTheDocument();
  });

  it('only calls a future itinerary the next trip', () => {
    render(
      createElement(FairwayTeamHub, {
        ...fixture,
        trips: [
          {
            id: 'past-trip',
            event_name: 'Spring Invitational',
            destination: 'Augusta',
            transportation_type: 'bus',
            departure_date: '2026-03-01',
            departure_time: null,
            departure_location: null,
            return_date: null,
            return_time: null,
            hotel_name: null,
            hotel_address: null,
            hotel_phone: null,
            hotel_confirmation: null,
            uniform_requirements: null,
            gear_list: null,
            room_assignments: null,
            notes: null,
            flight_info: null,
          },
        ],
      }),
    );

    expect(screen.getByText('No upcoming travel')).toBeVisible();
    expect(screen.queryByText('Next trip')).not.toBeInTheDocument();
  });

  it('adopts refreshed tasks after a previously failed task read recovers', () => {
    const { rerender } = render(
      createElement(FairwayTeamHubWrapper, {
        ...fixture,
        tasksLoadError: true,
      }),
    );

    expect(screen.getByText("Couldn't load tasks")).toBeVisible();

    rerender(
      createElement(FairwayTeamHubWrapper, {
        ...fixture,
        tasks: [
          {
            id: 'fresh-task',
            title: 'Upload tournament yardage book',
            description: null,
            due_date: null,
            category: 'practice',
            requires_upload: false,
            status: 'pending',
            completed_at: null,
          },
        ],
        tasksLoadError: false,
      }),
    );

    expect(screen.getByText('Upload tournament yardage book')).toBeVisible();
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
