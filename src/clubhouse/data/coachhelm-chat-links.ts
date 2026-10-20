import { rebuiltHref } from '../shell/nav';

/**
 * Where a link the CoachHelm chat engine writes opens in Clubhouse (P013 Ask). The engine is production's
 * (`lib/coachhelm/v3/chat`), so its receipts and pulse items name Fairway's addresses: `/golf/dashboard/tasks`,
 * `/announcements`, `/intelligence?view=…`. Clubhouse moved those screens (their routes redirect, routes/alias.ts), so
 * `rebuiltHref` alone answers null for them and the chip or the finding's link was drawn as plain text, where
 * production links it. This gives the Clubhouse screen the moved route opens for a coach, the same target the route's
 * own alias redirect picks, so the link goes there in one step:
 *
 *   /golf/dashboard/tasks           -> Team Hub, Tasks (tasks/layout.tsx; `?task=` carried)
 *   /golf/dashboard/announcements   -> Team Hub, Announcements (announcements/layout.tsx)
 *   /golf/dashboard/intelligence    -> the CoachHelm board, `?player=` carried, `?view=chat` to Ask (intelligence/layout.tsx)
 *
 * Anything else is kept only when its screen is rebuilt for a coach, as before. Ask is the coach's alone.
 */
const HUB = '/golf/dashboard/team-hub';
const ID = /^[\w-]{1,64}$/;

function moved(path: string, q: URLSearchParams): string | null {
  if (path === '/golf/dashboard/tasks') {
    const task = q.get('task');
    return `${HUB}?${new URLSearchParams(task && ID.test(task) ? { tab: 'tasks', task } : { tab: 'tasks' })}`;
  }
  if (path === '/golf/dashboard/announcements') return `${HUB}?tab=ann`;
  if (path === '/golf/dashboard/intelligence') {
    const next = new URLSearchParams();
    const player = q.get('player');
    if (player && ID.test(player)) next.set('player', player);
    if (q.get('view') === 'chat') next.set('view', 'ask');
    const query = next.toString();
    return query ? `/golf/dashboard/coachhelm?${query}` : '/golf/dashboard/coachhelm';
  }
  return null;
}

export function askLinkHref(href: string): string | null {
  const [rawPath = href, search = ''] = href.split('?');
  const path = rawPath.replace(/\/$/, '') || '/';
  const to = moved(path, new URLSearchParams(search));
  return rebuiltHref(to ?? href, 'coach');
}
