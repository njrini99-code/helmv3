/**
 * The Clubhouse UI check's screens (dsx-09): one fixture per screen that is live in production, for the coach and for
 * the player, each opened at a phone size (WebKit, iPhone 17 Pro) and a desk size (Chromium, 1440x900). `route` is the
 * production address the fixture draws; scripts/clubhouse/__tests__/ui-check-screens.test.mjs holds the list to
 * CH_REBUILT_ROUTES (src/clubhouse/shell/nav.ts), so a screen that goes live without a row here fails clubhouse:check.
 * Lab pages (popup lab, card lab, the component playground) and retired screens are left out on purpose.
 */
export type UiCheckScreen = { id: string; role: 'coach' | 'player'; route: string; path: string };

const s = (role: UiCheckScreen['role'], id: string, route: string, fixture: string): UiCheckScreen => ({
  id: `${id}-${role}`,
  role,
  route,
  path: `/clubhouse-preview/${fixture}`,
});

export const UI_CHECK_SCREENS: UiCheckScreen[] = [
  s('coach', 'home', '/golf/dashboard', 'home'),
  s('coach', 'coachhelm', '/golf/dashboard/coachhelm', 'coachhelm-team'),
  s('coach', 'stats', '/golf/dashboard/stats', 'stats'),
  s('coach', 'roster', '/golf/dashboard/roster', 'roster'),
  s('coach', 'calendar', '/golf/dashboard/calendar', 'calendar'),
  // state=design is the live redesign (data-ch-ms-v2); the plain fixture draws the old screen.
  s('coach', 'messages', '/golf/dashboard/messages', 'messages?state=design&view=inbox'),
  s('coach', 'rounds', '/golf/dashboard/rounds', 'team-rounds'),
  s('coach', 'qualifiers', '/golf/dashboard/qualifiers', 'qualifiers'),
  s('coach', 'team-hub', '/golf/dashboard/team-hub', 'hub'),
  s('coach', 'recruiting', '/golf/dashboard/recruiting', 'recruiting'),
  s('coach', 'whats-new', '/golf/dashboard/whats-new', 'whats-new'),
  s('coach', 'live', '/golf/dashboard/live', 'live'),
  s('coach', 'settings', '/golf/dashboard/settings', 'settings'),

  s('player', 'home', '/golf/dashboard', 'home-player'),
  s('player', 'coachhelm', '/golf/dashboard/coachhelm', 'coachhelm-player'),
  s('player', 'stats', '/golf/dashboard/stats', 'player?state=self'),
  s('player', 'roster', '/golf/dashboard/roster', 'roster-player'),
  s('player', 'calendar', '/golf/dashboard/calendar', 'calendar-player'),
  s('player', 'messages', '/golf/dashboard/messages', 'messages-player'),
  s('player', 'rounds', '/golf/dashboard/rounds', 'rounds'),
  s('player', 'log-round', '/golf/dashboard/rounds/new', 'setup'),
  s('player', 'classes', '/golf/dashboard/classes', 'classes'),
  s('player', 'qualifiers', '/golf/dashboard/qualifiers', 'qualifiers-player'),
  s('player', 'team-hub', '/golf/dashboard/team-hub', 'hub-player'),
  s('player', 'settings', '/golf/dashboard/settings', 'settings?state=player'),
];
