import Link from 'next/link';
import { Fragment } from 'react';
import type { ChCoachQueue } from '../../data/home';
import { rebuiltHref } from '../../shell/nav';
import { CALENDAR } from './event-links';

/** One part of the row: its words, where it opens, and (replies across events) what the link's title says. */
export interface ChQueuePart {
  key: 'joins' | 'replies' | 'tasks' | 'posts';
  text: string;
  href: string;
  title?: string;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * "1 join request · 3 replies missing · 2 tasks overdue · 1 post awaiting acknowledgement" (spec B §2): only the parts
 * above zero, in that order, each opening the screen that holds it. A part that didn't load (null) is left out and
 * `failed` says so; it is never counted as 0. A screen not rebuilt for coaches drops its part.
 */
export function queueParts(queue: ChCoachQueue | null | undefined): { parts: ChQueuePart[]; failed: boolean } {
  if (!queue) return { parts: [], failed: false };
  const parts: ChQueuePart[] = [];
  const add = (part: Omit<ChQueuePart, 'href'> & { href: string | null }) => {
    if (part.href) parts.push({ ...part, href: part.href });
  };
  if (queue.joinRequests) add({ key: 'joins', text: n(queue.joinRequests, 'join request', 'join requests'), href: rebuiltHref('/golf/dashboard/roster', 'coach') });
  if (queue.replies?.missing) {
    const events = queue.replies.events;
    const one = events.length === 1 ? events[0]! : null;
    add({
      key: 'replies',
      text: n(queue.replies.missing, 'reply missing', 'replies missing'),
      // One event holds them: that event; more: the calendar, and the link's title says how many.
      href: rebuiltHref(one ? `${CALENDAR}?date=${one.date}&event=${one.id}` : CALENDAR, 'coach'),
      title: one ? undefined : `across ${events.length} events`,
    });
  }
  if (queue.overdueTasks) add({ key: 'tasks', text: n(queue.overdueTasks, 'task overdue', 'tasks overdue'), href: rebuiltHref('/golf/dashboard/team-hub?tab=tasks', 'coach') });
  if (queue.unackedPosts) add({ key: 'posts', text: n(queue.unackedPosts, 'post awaiting acknowledgement', 'posts awaiting acknowledgement'), href: rebuiltHref('/golf/dashboard/team-hub?tab=ann', 'coach') });
  const failed = queue.joinRequests == null || queue.replies == null || queue.overdueTasks == null || queue.unackedPosts == null;
  return { parts, failed };
}

/**
 * "Waiting on you" (P002, coach desktop under the head and phone in the hero, first run too): one text row of
 * separately linked parts. Absent when nothing waits. A part that didn't load is omitted and the row ends "· some
 * items didn't load" (CH-2220), unless the page's notice already names it (`covered`).
 */
export function CoachQueue({ queue, covered = false, phone = false }: { queue: ChCoachQueue | null | undefined; covered?: boolean; phone?: boolean }) {
  const { parts, failed } = queueParts(queue);
  const note = failed && !covered;
  if (!parts.length && !note) return null;
  const base = phone ? 'ch-hm-queue' : 'ch-h-queue';
  return (
    <nav aria-label="Waiting on you" className={base}>
      <span className={`${base}__k`}>Waiting on you</span>
      <span className={`${base}__v`}>
        {parts.map((p, i) => (
          <Fragment key={p.key}>
            {i > 0 && (
              <span className={`${base}__sep`} aria-hidden="true">
                ·
              </span>
            )}
            <Link href={p.href} className={`${base}__a ch-num`} title={p.title}>
              {p.text}
            </Link>
          </Fragment>
        ))}
        {note && (
          <span className={`${base}__fail`} data-ch-code="CH-2220">
            {parts.length ? '· ' : ''}some items didn’t load
          </span>
        )}
      </span>
    </nav>
  );
}
