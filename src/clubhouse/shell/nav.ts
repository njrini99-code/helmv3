import {
  BarChart3,
  CalendarDays,
  Flag,
  GraduationCap,
  House,
  Medal,
  MessageSquare,
  Sparkles,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

/** Sidebar sections, in order (v2 gh-nav.js). */
export type ChNavSection = 'Team' | 'My game' | 'School';
export const CH_NAV_SECTIONS: readonly (ChNavSection | undefined)[] = [undefined, 'Team', 'My game', 'School'];

export interface ChNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section?: ChNavSection;
  /** `hub`: the player's unread announcements, tasks and trips, as the current app's Team Hub badge counts them. */
  badge?: 'messages' | 'joinRequests' | 'hub';
}

/**
 * Coach navigation, in the v2 design's order (D-66, design/handoff/gh-nav.js).
 * Every entry is a designed screen; one not rebuilt yet (CoachHelm, Team Hub)
 * opens the not-rebuilt notice. Rounds, Practice, Lineups, Events and
 * Scouting are not in v2's sidebar and are left out.
 */
export const CH_NAV_COACH: readonly ChNavItem[] = [
  { id: 'home', label: 'Home', href: '/golf/dashboard', icon: House },
  { id: 'coachhelm', label: 'CoachHelm', href: '/golf/dashboard/coachhelm', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', href: '/golf/dashboard/calendar', icon: CalendarDays },
  { id: 'hub', label: 'Team Hub', href: '/golf/dashboard/team-hub', icon: UsersRound },
  { id: 'messages', label: 'Messages', href: '/golf/dashboard/messages', icon: MessageSquare, badge: 'messages' },
  { id: 'roster', label: 'Roster', href: '/golf/dashboard/roster', icon: Users, section: 'Team', badge: 'joinRequests' },
  { id: 'stats', label: 'Stats', href: '/golf/dashboard/stats', icon: BarChart3, section: 'Team' },
  { id: 'qualifiers', label: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: Medal, section: 'Team' },
];

/**
 * Player navigation (D-66): v2's Home, CoachHelm, Team Hub, Rounds (My game)
 * and Classes (School), plus the player screens already built that v2 hasn't
 * designed yet (Calendar, Messages, My stats, Qualifiers), kept until it does.
 */
export const CH_NAV_PLAYER: readonly ChNavItem[] = [
  { id: 'home', label: 'Home', href: '/golf/dashboard', icon: House },
  { id: 'coachhelm', label: 'CoachHelm', href: '/golf/dashboard/coachhelm', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', href: '/golf/dashboard/calendar', icon: CalendarDays },
  { id: 'hub', label: 'Team Hub', href: '/golf/dashboard/team-hub', icon: UsersRound, badge: 'hub' },
  { id: 'messages', label: 'Messages', href: '/golf/dashboard/messages', icon: MessageSquare, badge: 'messages' },
  { id: 'rounds', label: 'Rounds', href: '/golf/dashboard/rounds', icon: Flag, section: 'My game' },
  { id: 'stats', label: 'My stats', href: '/golf/dashboard/stats', icon: BarChart3, section: 'My game' },
  { id: 'qualifiers', label: 'Qualifiers', href: '/golf/dashboard/qualifiers', icon: Medal, section: 'My game' },
  { id: 'classes', label: 'Classes', href: '/golf/dashboard/classes', icon: GraduationCap, section: 'School' },
];

export type ChRole = 'coach' | 'player';

/**
 * Phone tabs, in order (D-66, v2 GH.tabs). Coach: Home, CoachHelm, Calendar,
 * Stats. Player: Home, CoachHelm, Rounds, Team Hub. Everything else opens
 * from the More sheet.
 */
export const CH_PHONE_TABS: Record<ChRole, readonly string[]> = {
  coach: ['home', 'coachhelm', 'calendar', 'stats'],
  player: ['home', 'coachhelm', 'rounds', 'hub'],
};

/** The role's phone tabs, in order, and everything else (the More sheet), in sidebar order. */
export function phoneTabsFor(role: ChRole): { tabs: ChNavItem[]; more: ChNavItem[] } {
  const nav = navFor(role);
  const ids = CH_PHONE_TABS[role];
  return {
    tabs: ids.map((id) => nav.find((i) => i.id === id)).filter((i): i is ChNavItem => !!i),
    more: nav.filter((i) => !ids.includes(i.id)),
  };
}

export function navFor(role: ChRole): readonly ChNavItem[] {
  return role === 'player' ? CH_NAV_PLAYER : CH_NAV_COACH;
}

/** @deprecated use navFor(role); kept for coach-only callers. */
export const CH_NAV = CH_NAV_COACH;

/** The item that owns a pathname: the longest matching href wins. */
export function activeNavItem(pathname: string, role: ChRole = 'coach'): ChNavItem | undefined {
  let best: ChNavItem | undefined;
  for (const item of navFor(role)) {
    // Home owns only itself: /golf/dashboard/settings isn't "in" Home.
    const hit = pathname === item.href || (item.id !== 'home' && pathname.startsWith(item.href + '/'));
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/**
 * Routes rebuilt in Clubhouse. Anything else renders the "not rebuilt yet"
 * placeholder inside the Clubhouse shell, never a Fairway page in a Clubhouse
 * frame. Add a route here only when its screen reaches the `desktop` gate.
 */
/** Settings and its two legacy deep links, which open a section of the one Settings page. */
const SETTINGS_ROUTES = ['/golf/dashboard/settings', '/golf/dashboard/settings/notifications', '/golf/dashboard/settings/coaching-intelligence'];

export const CH_REBUILT_ROUTES: Record<ChRole, readonly string[]> = {
  coach: [
    '/golf/dashboard',
    '/golf/dashboard/coachhelm',
    '/golf/dashboard/calendar',
    '/golf/dashboard/messages',
    '/golf/dashboard/roster',
    '/golf/dashboard/stats',
    '/golf/dashboard/stats/team',
    '/golf/dashboard/qualifiers',
    '/golf/dashboard/team-hub',
    ...SETTINGS_ROUTES,
  ],
  player: ['/golf/dashboard', '/golf/dashboard/coachhelm', '/golf/dashboard/calendar', '/golf/dashboard/team-hub', '/golf/dashboard/messages', '/golf/dashboard/rounds', '/golf/dashboard/rounds/new', '/golf/dashboard/classes', '/golf/dashboard/stats', '/golf/dashboard/qualifiers', '/golf/dashboard/my-qualifiers', ...SETTINGS_ROUTES],
};

/**
 * Addresses under a rebuilt route that belong to the same screen (SCREENS.md
 * lists them with their parent). Qualifiers: /new, /[id], /[id]/edit and /[id]/selection. A
 * player on /new or /edit gets Clubhouse's coach-only state, not a Fairway page.
 */
const CH_REBUILT_CHILDREN: Record<string, RegExp> = {
  '/golf/dashboard/qualifiers': /^\/golf\/dashboard\/qualifiers\/(new|[0-9a-f-]{36}(\/(edit|selection))?)$/i,
};

/**
 * Rebuilt addresses whose parent isn't rebuilt for that role. A coach has no
 * Rounds library in v2, but opens a player's round review from Stats. A player
 * also continues a round, /rounds/continue/[id] (P011, over the round engine;
 * /rounds/new is a rebuilt route above). /rounds/recover stays Fairway's, so it
 * is not rebuilt.
 */
const CH_REBUILT_PATTERNS: Record<ChRole, readonly RegExp[]> = {
  coach: [/^\/golf\/dashboard\/rounds\/[0-9a-f-]{36}$/i],
  player: [/^\/golf\/dashboard\/rounds\/[0-9a-f-]{36}$/i, /^\/golf\/dashboard\/rounds\/continue\/[0-9a-f-]{36}$/i],
};

export function isRebuilt(pathname: string, role: ChRole = 'coach'): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  if (CH_REBUILT_ROUTES[role].includes(path)) return true;
  if (CH_REBUILT_PATTERNS[role].some((re) => re.test(path))) return true;
  return Object.entries(CH_REBUILT_CHILDREN).some(([parent, child]) => CH_REBUILT_ROUTES[role].includes(parent) && child.test(path));
}

/** A link target only once its screen is rebuilt; until then the control isn't rendered. */
export function rebuiltHref(href: string, role: ChRole = 'coach'): string | null {
  return isRebuilt(href.split('?')[0] ?? href, role) ? href : null;
}
