/**
 * Which Bridge page (plan §2, docs/clubhouse/generated/bridge-graph.json `pages`) a Clubhouse address is. A signal names
 * its page so the route can resolve its code under the right one; an address no page claims counts under the shell
 * (P001). Kept in step with the graph's route lists by its test.
 */
const SECTIONS: readonly (readonly [string, string])[] = [
  ['roster', 'P003'],
  ['calendar', 'P006'],
  ['messages', 'P007'],
  ['settings', 'P008'],
  ['qualifiers', 'P009'],
  ['team-hub', 'P010'],
  ['rounds', 'P011'],
  ['live', 'P011'],
  ['classes', 'P012'],
  ['coachhelm', 'P013'],
  ['recruiting', 'P014'],
  ['tournaments', 'P016'],
  ['practice', 'P017'],
];

/**
 * The front door (P015): signing in, onboarding, and the team and staff invitations a code or link opens. The graph
 * lists no page for the invitations (they sit outside the (auth) group), but their screens' controls and codes are
 * P015's (CTL-P015-…, CH-15…): counted anywhere else, every one of their signals would read as wrong-page drift.
 */
const AUTH = new Set(['login', 'welcome', 'signup', 'player', 'reset-password', 'coach', 'demo', 'forgot-password', 'join', 'staff']);

export function pageForPath(pathname: string, search: string, role: string): string {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] !== 'golf') return 'P001';
  if (parts[1] !== 'dashboard') return parts[1] && AUTH.has(parts[1]) ? 'P015' : 'P001';
  const section = parts[2];
  if (!section) return 'P002';
  if (section === 'whats-new') return 'P001';
  if (section === 'stats') {
    const player = search ? new URLSearchParams(search.replace(/^\?/, '')).get('player') : null;
    return role === 'coach' && !player ? 'P004' : 'P005';
  }
  return SECTIONS.find(([s]) => s === section)?.[1] ?? 'P001';
}
