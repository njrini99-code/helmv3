import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import { Icon } from '../../ui/Icon';
import type { ChCoachQueue } from '../../data/home';
import { rebuiltHref } from '../../shell/nav';
import { CALENDAR } from './event-links';

/** One part of the row: its words, where it opens, and (replies across events) what the link's title says. */
export interface ChQueuePart {
  key: 'joins' | 'replies' | 'tasks' | 'posts';
  text: string;
  href: string;
  title?: string;
  /** The count alone, and the words after it, for the desk's count cards (premium plan §3.1). */
  count: number;
  label: string;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const words = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * "1 join request · 3 replies missing · 2 tasks overdue · 1 post awaiting acknowledgement" (spec B §2): only the parts
 * above zero, in that order, each opening the screen that holds it. A part that didn't load (null) is left out and
 * `failed` says so; it is never counted as 0. A screen not rebuilt for coaches drops its part.
 */
export function queueParts(queue: ChCoachQueue | null | undefined): { parts: ChQueuePart[]; failed: boolean } {
  if (!queue) return { parts: [], failed: false };
  const parts: ChQueuePart[] = [];
  const add = (part: Omit<ChQueuePart, 'href' | 'label'> & { href: string | null; one: string; many: string }) => {
    const { one, many, ...rest } = part;
    if (rest.href) parts.push({ ...rest, href: rest.href, label: words(rest.count, one, many) });
  };
  if (queue.joinRequests) add({ key: 'joins', count: queue.joinRequests, one: 'join request', many: 'join requests', text: n(queue.joinRequests, 'join request', 'join requests'), href: rebuiltHref('/golf/dashboard/roster?tab=requests', 'coach') });
  if (queue.replies?.missing) {
    const events = queue.replies.events;
    const one = events.length === 1 ? events[0]! : null;
    add({
      key: 'replies',
      count: queue.replies.missing,
      one: 'reply missing',
      many: 'replies missing',
      text: n(queue.replies.missing, 'reply missing', 'replies missing'),
      // One event holds them: that event; more: the calendar, and the link's title says how many.
      href: rebuiltHref(one ? `${CALENDAR}?date=${one.date}&event=${one.id}` : CALENDAR, 'coach'),
      title: one ? undefined : `across ${events.length} events`,
    });
  }
  if (queue.overdueTasks) add({ key: 'tasks', count: queue.overdueTasks, one: 'task overdue', many: 'tasks overdue', text: n(queue.overdueTasks, 'task overdue', 'tasks overdue'), href: rebuiltHref('/golf/dashboard/team-hub?tab=tasks', 'coach') });
  if (queue.unackedPosts) add({ key: 'posts', count: queue.unackedPosts, one: 'post awaiting acknowledgement', many: 'posts awaiting acknowledgement', text: n(queue.unackedPosts, 'post awaiting acknowledgement', 'posts awaiting acknowledgement'), href: rebuiltHref('/golf/dashboard/team-hub?tab=ann', 'coach') });
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
            <Link prefetch={false} href={p.href} className={`${base}__a ch-num`} title={p.title}>
              {p.text}
            </Link>
          </Fragment>
        ))}
        {note && (
          <span className={`${base}__fail`} data-ch-code="CH-2220">
            {/* On the phone the parts are capsules (home.css), so the note needs no dot to set it apart. */}
            {parts.length && !phone ? '· ' : ''}some items didn’t load
          </span>
        )}
      </span>
    </nav>
  );
}

/** The verb each count card links with: the count is the figure, the verb opens where it is (premium plan §3.1). */
const VERB: Record<ChQueuePart['key'], string> = { joins: 'Review', replies: 'See who', tasks: 'Review', posts: 'See who' };

/**
 * "Waiting on you" on the desk dashboard (premium plan §3.1, Stripe's count cards): one card, its title inside it, and a
 * tile per part above zero, the count as the figure, its words under it and a verb that opens the screen holding it.
 * Absent when nothing waits; a part that didn't load is left out and the card says so (CH-2220) unless the page's
 * notice already does (`covered`). The phone keeps its capsules (CoachQueue).
 */
export function CoachQueueCards({ queue, covered = false }: { queue: ChCoachQueue | null | undefined; covered?: boolean }) {
  const { parts, failed } = queueParts(queue);
  const note = failed && !covered;
  if (!parts.length && !note) return null;
  return (
    <nav aria-labelledby="ch-h-qc-t" className="ch-h-qc">
      <h2 id="ch-h-qc-t" className="ch-h-qc__k">
        Waiting on you
      </h2>
      {parts.length > 0 && (
        <ul className="ch-h-qc__list">
          {parts.map((p) => (
            <li key={p.key}>
              <Link prefetch={false} href={p.href} className="ch-h-qc__a" title={p.title} aria-label={p.text} data-ch-press="">
                <span className="ch-h-qc__n ch-num">{p.count}</span>
                <span className="ch-h-qc__l">{p.label}</span>
                <span className="ch-h-qc__v">
                  {VERB[p.key]}
                  <Icon icon={ChevronRight} size={14} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="ch-h-qc__fail" data-ch-code="CH-2220">
          Some items didn’t load
        </p>
      )}
    </nav>
  );
}
