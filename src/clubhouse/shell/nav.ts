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
  /** Shown in the phone tab bar; everything else lives under More. */
  tab?: boolean;
  badge?: 'messages' | 'joinRequests';
}

/**
 * Coach navigation, in the handoff's order. Practice and Events are in the
 * design but have no route yet, so they are left out rather than pointing at
 * nothing (tracker: open questions).
 */
export const CH_NAV_COACH: readonly ChNavItem[] = [
  { id: 'home', label: 'Home', href: '/golf/dashboard', icon: House, tab: true },
  { id: 'coachhelm', label: 'CoachHelm', href: '/golf/dashboard/coachhelm', icon: Sparkles },
  { id: 'calendar', label: 'Calendar', href: '/golf/dashboard/calendar', icon: CalendarDays, tab: true },
  { id: 'messages', label: 'Messages', href: '/golf/dashboard/messages', icon: MessageSquare, tab: true, badge: 'messages' },
  { id: 'roster', label: 'Roster', href: '/golf/dashboard/roster', icon: Users, section: 'Team', tab: true, badge: 'joinRequests' },
  { id: 'stats', label: 'Stats', href: '/golf/dashboard/stats', icon: BarChart3, section: 'Team' },
  { id: 'rounds', label: 'Rounds', href: '/golf/dashboard/rounds', icon: Flag, section: 'Team' },
  { id: 'lineups', label: 'Lineups', href: '/golf/dashboard/qualifiers', icon: ListOrdered, section: 'Team' },
  { id: 'scouting', label: 'Scouting', href: '/golf/dashboard/recruiting', icon: Binoculars, section: 'Program' },
];

/** Player navigation: the shared screens first, with a player's own permissions. */
export const CH_NAV_PLAYER: readonly ChNavItem[] = [
  { id: 'home', label: 'Home', href: '/golf/dashboard', icon: House, tab: true },
  { id: 'calendar', label: 'Calendar', href: '/golf/dashboard/calendar', icon: CalendarDays, tab: true },
  { id: 'messages', label: 'Messages', href: '/golf/dashboard/messages', icon: MessageSquare, tab: true, badge: 'messages' },
  { id: 'stats', label: 'My stats', href: '/golf/dashboard/stats', icon: BarChart3, tab: true },
  { id: 'rounds', label: 'Rounds', href: '/golf/dashboard/rounds', icon: Flag },
];

export type ChRole = 'coach' | 'player';

export function navFor(role: ChRole): readonly ChNavItem[] {
  return role === 'player' ? CH_NAV_PLAYER : CH_NAV_COACH;
}

/** @deprecated use navFor(role); kept for coach-only callers. */
export const CH_NAV = CH_NAV_COACH;

/** The item that owns a pathname: the longest matching href wins. */
export function activeNavItem(pathname: string, role: ChRole = 'coach'): ChNavItem | undefined {
  let best: ChNavItem | undefined;
  for (const item of navFor(role)) {
    const hit = pathname === item.href || pathname.startsWith(item.href + '/');
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/**
 * Routes rebuilt in Clubhouse. Anything else renders the "not rebuilt yet"
 * placeholder inside the Clubhouse shell, never a Fairway page in a Clubhouse
 * frame. Add a route here only when its screen reaches the `desktop` gate.
 */
export const CH_REBUILT_ROUTES: Record<ChRole, readonly string[]> = {
  coach: ['/golf/dashboard', '/golf/dashboard/roster', '/golf/dashboard/stats'],
  player: ['/golf/dashboard/stats'],
};

export function isRebuilt(pathname: string, role: ChRole = 'coach'): boolean {
  return CH_REBUILT_ROUTES[role].includes(pathname.replace(/\/$/, '') || '/');
}

/** A link target only once its screen is rebuilt; until then the control isn't rendered. */
export function rebuiltHref(href: string, role: ChRole = 'coach'): string | null {
  return isRebuilt(href.split('?')[0] ?? href, role) ? href : null;
}
