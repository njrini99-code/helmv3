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
export const CH_NAV: readonly ChNavItem[] = [
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

/** The item that owns a pathname: the longest matching href wins. */
export function activeNavItem(pathname: string): ChNavItem | undefined {
  let best: ChNavItem | undefined;
  for (const item of CH_NAV) {
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
export const CH_REBUILT_ROUTES: readonly string[] = ['/golf/dashboard', '/golf/dashboard/roster'];

export function isRebuilt(pathname: string): boolean {
  return CH_REBUILT_ROUTES.includes(pathname.replace(/\/$/, '') || '/');
}

/** A link target only once its screen is rebuilt; until then the control isn't rendered. */
export function rebuiltHref(href: string): string | null {
  return isRebuilt(href.split('?')[0] ?? href) ? href : null;
}
