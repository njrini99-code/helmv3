import type { NotificationCategoryId, UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { resolveAdminPostLoginPath } from '@/lib/golf/admin-redirect';
import { extractFirstName, extractLastName } from '@/lib/utils/names';
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';

/**
 * What the welcome shows, and the rules that decide it. Pure: the loader reads
 * the database, this shapes the answer, and the tests force every branch
 * (docs/clubhouse/catalog/auth.md, CH-153xx).
 */

/** The welcome card lists at most this many things. */
export const WELCOME_ITEM_LIMIT = 3;

export type WelcomeName = { status: 'named'; display: string } | { status: 'anonymous' };

export interface ChWelcomeItem {
  id: string;
  category: NotificationCategoryId;
  title: string;
  body: string | null;
}

export interface ChWelcomeNews {
  items: ChWelcomeItem[];
  /** No previous visit on record: the header becomes "Your first time in". */
  first: boolean;
  /** The notifications read failed. The card says so; it never claims "all caught up" for something it could not check. */
  failed: boolean;
}

export interface ChWelcome {
  name: WelcomeName;
  news: ChWelcomeNews;
  /** When the person was last here (`users.last_seen`, written by the dashboard's heartbeat), or null. */
  lastSeenAt: string | null;
  /** The legacy `users.role = 'admin'` flag: with no `next`, the welcome hands over to the admin console. */
  isAdmin: boolean;
  /** The destination's dashboard is Clubhouse for this person, so the hand-off can fold into its canvas. */
  clubhouseDashboard: boolean;
}

/**
 * Who the welcome greets, by the current page's rules (`welcome/page.tsx`):
 * a coach is `Coach {Last}`; a player is their first name; anyone else, their
 * account name. A coach whose last word is the title itself ("Demo Coach") falls
 * back to their first name, and a name that is only "Coach" (or sanitises to
 * nothing) is anonymous, so the line never reads "Coach Coach" or a bare
 * "Coach" with the name missing.
 */
export function resolveWelcomeName(src: { coachFullName?: string | null; playerFirstName?: string | null; accountName?: string | null }): WelcomeName {
  const isTitle = (s: string | null) => !!s && /^coach$/i.test(s);
  if (src.coachFullName) {
    const last = extractLastName(src.coachFullName);
    const first = extractFirstName(src.coachFullName);
    const picked = !last || isTitle(last) ? first : last;
    const suffix = isTitle(picked) ? null : picked;
    return suffix ? { status: 'named', display: `Coach ${suffix}` } : { status: 'anonymous' };
  }
  if (src.playerFirstName) {
    const first = extractFirstName(src.playerFirstName);
    return first ? { status: 'named', display: first } : { status: 'anonymous' };
  }
  const first = extractFirstName(src.accountName);
  return first ? { status: 'named', display: first } : { status: 'anonymous' };
}

/** The newest unread items, at most three. The feed is newest first already. */
export function pickWelcomeItems(feed: readonly UnifiedNotificationItem[]): ChWelcomeItem[] {
  return feed
    .filter((n) => n.read_at === null && n.title.trim())
    .slice(0, WELCOME_ITEM_LIMIT)
    .map((n) => ({ id: `${n.source}:${n.id}`, category: n.category, title: n.title.trim(), body: n.body?.trim() || null }));
}

export function shapeWelcomeNews(args: { feed: readonly UnifiedNotificationItem[] | null; lastSeenAt: string | null }): ChWelcomeNews {
  return { items: args.feed ? pickWelcomeItems(args.feed) : [], first: args.lastSeenAt === null, failed: args.feed === null };
}

/** Where Continue goes: the sign-in's `next` when it is a safe internal path, else the dashboard (or the admin console for the legacy admin). */
export function welcomeDestination(next: string | null, isAdmin: boolean): string {
  return isSafeInternalPath(next) ? next : resolveAdminPostLoginPath(isAdmin);
}

/** Whether the destination is a dashboard page, which is what the fold lands on. */
export const isDashboardDestination = (path: string): boolean => path === '/golf/dashboard' || path.startsWith('/golf/dashboard/') || path.startsWith('/golf/dashboard?');

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today at 9:12 pm", "Yesterday at …", "Sunday at …" within the week, "Oct 3 at …" after. In the viewer's own timezone. */
export function formatLastHere(iso: string, now: Date): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s*([AP])M\b/i, (_, ap: string) => ` ${ap.toLowerCase()}m`);
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
  if (days <= 0) return `Today at ${time}`;
  if (days === 1) return `Yesterday at ${time}`;
  if (days < 7) return `${at.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`;
  return `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

/** The date line above the greeting, in the viewer's locale ("Tuesday, October 14"). */
export const formatWelcomeDate = (now: Date): string => now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
