import {
  BarChart3,
  Binoculars,
  CalendarDays,
  Flag,
  House,
  ListOrdered,
  MessageSquare,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface ChNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section?: 'Team' | 'Program';
  /** The phone tab's label when it differs from the sidebar's (CoachHelm is "Helm"). */
  tabLabel?: string;
  badge?: 'messages' | 'joinRequests';
}

/**
 * Coach navigation, in the handoff's order. Practice and Events are in the
 * design but have no route yet, so they are left out rather than pointing at
 * nothing (tracker: open questions).
 */
export const CH_NAV_COACH: readonly ChNavItem[] = [
  { id: 'home', label: 'Home', href: '/golf/dashboard', icon: House },
  { id: 'coachhelm', label: 'CoachHelm', tabLabel: 'Helm', href: '/golf/dashboard/coachhelm', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', href: '/golf/dashboard/calendar', icon: CalendarDays },
  { id: 'messages', label: 'Messages', href: '/golf/dashboard/messages', icon: MessageSquare, badge: 'messages' },
  { id: 'roster', label: 'Roster', href: '/golf/dashboard/roster', icon: Users, section: 'Team', badge: 'joinRequests' },
  { id: 'stats', label: 'Stats', href: '/golf/dashboard/stats', icon: BarChart3, section: 'Team' },
  { id: 'rounds', label: 'Rounds', href: '/golf/dashboard/rounds', icon: Flag, section: 'Team' },
  { id: 'lineups', label: 'Lineups', href: '/golf/dashboard/qualifiers', icon: ListOrdered, section: 'Team' },
  { id: 'scouting', label: 'Scouting', href: '/golf/dashboard/recruiting', icon: Binoculars, section: 'Program' },
];

/** Player navigation: the shared screens first, with a player's own permissions. */
export const CH_NAV_PLAYER: readonly ChNavItem[] = [
  { id: 'home', label: 'Home', href: '/golf/dashboard', icon: House },
  { id: 'calendar', label: 'Calendar', href: '/golf/dashboard/calendar', icon: CalendarDays },
  { id: 'messages', label: 'Messages', href: '/golf/dashboard/messages', icon: MessageSquare, badge: 'messages' },
  { id: 'stats', label: 'My stats', href: '/golf/dashboard/stats', icon: BarChart3 },
  { id: 'rounds', label: 'Rounds', href: '/golf/dashboard/rounds', icon: Flag },
];

export type ChRole = 'coach' | 'player';

/**
 * Phone tabs, in order (D-40). Coaches get the owner's phone design: Home,
 * Helm, Rounds and Stats, with Calendar, Messages and Roster under More;
 * Helm and Rounds show the not-rebuilt notice until those screens exist.
 * Players keep their set until a player tab design exists. Everything not
 * listed opens from the More sheet.
 */
export const CH_PHONE_TABS: Record<ChRole, readonly string[]> = {
  coach: ['home', 'coachhelm', 'rounds', 'stats'],
  player: ['home', 'calendar', 'messages', 'stats'],
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
  coach: ['/golf/dashboard', '/golf/dashboard/calendar', '/golf/dashboard/messages', '/golf/dashboard/roster', '/golf/dashboard/stats', '/golf/dashboard/stats/team', ...SETTINGS_ROUTES],
  player: ['/golf/dashboard/calendar', '/golf/dashboard/messages', '/golf/dashboard/stats', ...SETTINGS_ROUTES],
};

export function isRebuilt(pathname: string, role: ChRole = 'coach'): boolean {
  return CH_REBUILT_ROUTES[role].includes(pathname.replace(/\/$/, '') || '/');
}

/** A link target only once its screen is rebuilt; until then the control isn't rendered. */
export function rebuiltHref(href: string, role: ChRole = 'coach'): string | null {
  return isRebuilt(href.split('?')[0] ?? href, role) ? href : null;
}
