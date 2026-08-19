// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { FairwayTeamHub, FairwayTeamHubWrapper, tripCountdownLabel } from './FairwayTeamHub';
import { TEAM_HUB_CARD_ROUTES, LEGACY_TAB_ROUTES } from './team-hub-routes';
import type { TripData } from '../hub/hub-parts';

const fixture = {
  tasks: [],
  announcements: [],
  classes: [],
  teammates: [],
  todayInTeamZone: '2026-08-18',
  teamName: 'Wildcats Golf',
  onCompleteTask: async () => {},
};

function makeTrip(overrides: Partial<TripData>): TripData {
  return {
    id: 'trip-1',
    event_name: 'Firestone Invitational',
    destination: 'Akron, OH',
    transportation_type: 'van',
    departure_date: '2026-08-21',
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
    ...overrides,
  };
}

describe('Team Hub bento overview', () => {
  it('renders every team domain as a card with no tab layer', () => {
    render(createElement(FairwayTeamHub, fixture));

    expect(screen.getByRole('heading', { name: /team hub/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^tasks$/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^announcements$/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^travel$/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /class schedule/i })).toBeVisible();
    expect(screen.getByRole('heading', { name: /^teammates$/i })).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('routes each card to its canonical detail page', () => {
    render(createElement(FairwayTeamHub, fixture));

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(TEAM_HUB_CARD_ROUTES.tasks);
    expect(hrefs).toContain(TEAM_HUB_CARD_ROUTES.announcements);
    expect(hrefs).toContain(TEAM_HUB_CARD_ROUTES.travel);
    expect(hrefs).toContain(TEAM_HUB_CARD_ROUTES.classes);
    expect(hrefs).toContain(TEAM_HUB_CARD_ROUTES.teammates);
  });

  it('deep-links the Travel card to the next trip so it auto-selects on the travel page', () => {
    render(
      createElement(FairwayTeamHub, {
        ...fixture,
        nextUpcomingTrip: makeTrip({ id: 'trip-42' }),
      }),
    );

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(`${TEAM_HUB_CARD_ROUTES.travel}?trip=trip-42`);
    expect(screen.getByText('In 3 days')).toBeVisible();
    expect(screen.getByText('Firestone Invitational')).toBeVisible();
  });

  it('never calls a failed read an empty team state, and every failed card offers a retry (#1514)', () => {
    render(
      createElement(FairwayTeamHub, {
        ...fixture,
        tasksLoadError: true,
        announcementsLoadError: true,
        tripsLoadError: true,
        classesLoadError: true,
        teammatesLoadError: true,
      }),
    );

    // EmptyState is a framer-motion reveal (initial opacity 0); jsdom never
    // runs the animation, so presence — not toBeVisible — is the assertable
    // truth for its text.
    expect(screen.getByText("Couldn't load tasks")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load announcements")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load travel plans")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load your class schedule")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load your roster")).toBeInTheDocument();

    // The announcements card gets the SAME retry affordance as its siblings
    // (#1514 finding 2) — five failed domains, five retry buttons.
    expect(screen.getAllByRole('button', { name: /try again/i })).toHaveLength(5);

    expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument();
    expect(screen.queryByText('No recent announcements')).not.toBeInTheDocument();
    expect(screen.queryByText('No upcoming travel')).not.toBeInTheDocument();
    expect(screen.queryByText('No classes added yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/no teammates yet/i)).not.toBeInTheDocument();
  });

  it('adopts refreshed tasks after a previously failed task read recovers', () => {
    const { rerender } = render(
      createElement(FairwayTeamHubWrapper, {
        ...fixture,
        tasksLoadError: true,
      }),
    );

    expect(screen.getByText("Couldn't load tasks")).toBeInTheDocument();

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
 * tripCountdownLabel — pure team-clock date-string arithmetic (no viewer
 * clock, no hydration drift). The server only nominates a trip whose STAY has
 * not ended (return_date participates, #1514 finding 1), so a departure in
 * the past reads "In progress".
 * ------------------------------------------------------------------------- */
describe('tripCountdownLabel', () => {
  it('counts down future departures on the team clock', () => {
    expect(tripCountdownLabel('2026-08-21', '2026-08-18')).toBe('In 3 days');
  });

  it('says Tomorrow and Today at the boundaries', () => {
    expect(tripCountdownLabel('2026-08-19', '2026-08-18')).toBe('Tomorrow');
    expect(tripCountdownLabel('2026-08-18', '2026-08-18')).toBe('Today');
  });

  it('calls a departed-but-not-returned trip In progress', () => {
    expect(tripCountdownLabel('2026-08-16', '2026-08-18')).toBe('In progress');
  });

  it('returns null rather than a fabricated label for missing or malformed dates', () => {
    expect(tripCountdownLabel(null, '2026-08-18')).toBeNull();
    expect(tripCountdownLabel('', '2026-08-18')).toBeNull();
    expect(tripCountdownLabel('not-a-date', '2026-08-18')).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Legacy `?tab=` deep links — every tab the old hub ever had must resolve to
 * the canonical page its card now routes to; `overview` was the hub itself
 * and deliberately has no redirect entry.
 * ------------------------------------------------------------------------- */
describe('LEGACY_TAB_ROUTES', () => {
  it('maps every retired tab to its canonical detail page', () => {
    expect(LEGACY_TAB_ROUTES).toEqual({
      tasks: '/golf/dashboard/tasks',
      announcements: '/golf/dashboard/announcements',
      travel: '/golf/dashboard/travel',
      classes: '/golf/dashboard/classes',
      teammates: '/golf/dashboard/roster',
    });
  });

  it('leaves overview (and unknown values) rendering the hub itself', () => {
    expect(LEGACY_TAB_ROUTES.overview).toBeUndefined();
  });
});

/* ---------------------------------------------------------------------------
 * W1 count-coherence audit, restated for the bento: a failure and a genuine
 * empty list both arrive as `[]`, so the card branches on the error flag
 * FIRST — a load error must never render the quiet-team "No recent
 * announcements" state. (The old showAnnouncementsList() helper encoded this;
 * the bento enforces it structurally, so the proof is a render, not a unit.)
 * ------------------------------------------------------------------------- */
describe('announcements count coherence (W1)', () => {
  it('renders the quiet-team state only for a genuinely empty, successful fetch', () => {
    render(createElement(FairwayTeamHub, fixture));
    expect(screen.getByText('No recent announcements')).toBeVisible();
    expect(screen.getByText(/last 30 days/i)).toBeVisible();
  });

  it('renders the failure state — never the quiet-team state — on a load error', () => {
    render(createElement(FairwayTeamHub, { ...fixture, announcementsLoadError: true }));
    // Presence, not toBeVisible: EmptyState's framer-motion reveal keeps
    // opacity 0 in jsdom (no animation runs).
    expect(screen.getByText("Couldn't load announcements")).toBeInTheDocument();
    expect(screen.queryByText('No recent announcements')).not.toBeInTheDocument();
  });
});
