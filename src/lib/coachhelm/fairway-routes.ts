/** Canonical CoachHelm Fairway routes (redesign ON). */

export const coachHelmRoutes = {
  teamBrief: '/golf/dashboard/coachhelm/team',
  teamSignals: '/golf/dashboard/coachhelm/team/signals',
  teamStats: '/golf/dashboard/stats/team',
  playerStats: (playerId: string) => `/golf/dashboard/stats/players/${playerId}`,
  teamReviews: '/golf/dashboard/coachhelm/team/reviews',
  ask: '/golf/dashboard/coachhelm/chat',
  playersRoster: '/golf/dashboard/coachhelm/players',
  playerBrief: (playerId: string) => `/golf/dashboard/coachhelm/players/${playerId}`,
  playerLab: (playerId: string) => `/golf/dashboard/coachhelm/players/${playerId}/lab`,
  playerGenome: (playerId: string) => `/golf/dashboard/coachhelm/genome/${playerId}`,
  compare: '/golf/dashboard/coachhelm/genome/compare',
  effectiveness: '/golf/dashboard/analytics/coachhelm',
} as const;

export function teamSignalsHref(preset?: 'inbox' | 'all' | 'patterns'): string {
  if (!preset || preset === 'inbox') {
    return `${coachHelmRoutes.teamSignals}?preset=inbox`;
  }
  return `${coachHelmRoutes.teamSignals}?preset=${preset}`;
}

/** Category deep-link into Signals (Brief, aspect drill-down). */
export function teamSignalsCategoryHref(categoryId: string): string {
  const token = categoryId === 'driving' ? 'tee' : categoryId;
  return `${coachHelmRoutes.teamSignals}?preset=all&category=${encodeURIComponent(token)}`;
}

/** Deep-link to a single insight row in Signals. */
export function teamSignalsInsightHref(insightId: string): string {
  return `${coachHelmRoutes.teamSignals}?preset=all&id=${encodeURIComponent(insightId)}`;
}

/** Top-bar breadcrumb leaf label for CoachHelm cluster routes. */
export function coachHelmBreadcrumbTab(pathname: string): string {
  const p = pathname.replace(/\/$/, '');
  if (
    p.includes('/coachhelm/team/signals') ||
    p.includes('/alerts') ||
    p.includes('/insights') ||
    p.includes('/patterns')
  ) {
    return 'Signals';
  }
  if (p.includes('/coachhelm/team/reviews')) return 'Reviews';
  if (p.includes('/stats/team') || p.includes('/coachhelm/team/stats')) return 'Stats';
  if (p === '/golf/dashboard/coachhelm/team' || p === '/golf/dashboard/intelligence') {
    return 'Brief';
  }
  if (p.includes('/coachhelm/chat')) return 'Ask';
  if (p.includes('/genome/compare')) return 'Compare';
  if (p.includes('/coachhelm/players') || p.includes('/development')) return 'Roster';
  if (p.includes('/analytics/coachhelm')) return 'Effectiveness';
  if (p.includes('/coachhelm/genome/')) return 'Roster';
  return 'CoachHelm';
}
