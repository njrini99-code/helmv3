'use client';

/**
 * NotificationRow — the ONE row renderer shared by NotificationFeedPanel (the
 * bell's full list) and NotificationsLatestModule (the home-page compact
 * digest), so both surfaces read as the same product.
 *
 * A `PressTarget` (the unstyled pressable primitive, not a raw <button> —
 * `helm/no-raw-button` only allowlists raw elements inside fairway/controls
 * itself) with the row's own layout as className.
 *
 * Anatomy (owner 2026-09-27: "personal, premium, not vibe-coded"):
 *
 *   [avatar + category badge]  EYEBROW                         time
 *                              Headline (who / what)              ●
 *                              one-line preview
 *
 * The time lives at the right, top-aligned, with the unread dot beneath it —
 * iOS Mail / Linear style — so the eyebrow carries only the category and the
 * left column reads eyebrow → name → preview without a date interrupting it.
 * `density="compact"` is edge to edge (the Latest module draws the inset
 * hairline between rows itself); `comfortable` keeps its own rounded hover.
 */

import { PressTarget } from '@/components/fairway/controls/press-target';
import { Avatar } from '@/components/fairway/controls/avatar';
import { cn } from '@/lib/utils';
import { categoryIcon } from './category-meta';
import { relativeTimeFrom, fullDateTime } from './time-format';
import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { isUnread } from '@/app/golf/actions/unified-notifications-model';

export interface NotificationRowProps {
  item: UnifiedNotificationItem;
  onClick: (item: UnifiedNotificationItem) => void;
  /** Compact rows for the home "Latest" module (tighter padding, one-line preview). */
  density?: 'comfortable' | 'compact';
  /** Known people (lower-cased full name → avatar URL). A row about a person
   *  shows their avatar; unknown people fall back to initials. */
  people?: Readonly<Record<string, string | null>>;
  /**
   * How many notifications this row stands for. The caller groups
   * consecutive items from the same person and category and passes the
   * newest as `item`; a count above 1 turns the eyebrow into "2 messages".
   */
  count?: number;
  /** Override the unread state (a group is unread when ANY member is). */
  unread?: boolean;
}

/** "Message from Cole Bennett" → "Cole Bennett": the eyebrow already says
 *  Message, so the headline carries the person. */
function headlineFor(item: UnifiedNotificationItem): string {
  if (item.category === 'messages') {
    const m = /^message from\s+(.+)$/i.exec(item.title.trim());
    if (m?.[1]) return m[1];
  }
  return item.title;
}

/** The person a row is about, when there is one: the sender of a message, or
 *  the player in "X has joined Y". */
function personFor(item: UnifiedNotificationItem, headline: string): string | null {
  if (item.category === 'messages' && headline !== item.title) return headline;
  if (item.category === 'pipeline' && item.body) {
    const m = /^(.+?)\s+has joined\b/i.exec(item.body.trim());
    if (m?.[1]) return m[1].replace(/\s+/g, ' ');
  }
  return null;
}

/**
 * The person a notification is about, for callers that group rows. `null`
 * when the row is not about a person (those never group).
 */
export function notificationPersonFor(item: UnifiedNotificationItem): string | null {
  return personFor(item, headlineFor(item));
}

const CATEGORY_EYEBROW: Record<string, string> = {
  messages: 'Message',
  events: 'Event',
  announcements: 'Announcement',
  tasks: 'Task',
  coachhelm: 'CoachHelm',
  pipeline: 'Roster',
  profile_views: 'Profile',
};

/** Eyebrow when a row stands for several notifications ("2 messages"). */
const CATEGORY_EYEBROW_PLURAL: Record<string, string> = {
  messages: 'messages',
  events: 'events',
  announcements: 'announcements',
  tasks: 'tasks',
  coachhelm: 'CoachHelm updates',
  pipeline: 'roster updates',
  profile_views: 'profile views',
};

export function NotificationRow({
  item,
  onClick,
  density = 'comfortable',
  people,
  count = 1,
  unread: unreadOverride,
}: NotificationRowProps) {
  const Icon = categoryIcon(item.category);
  const unread = unreadOverride ?? isUnread(item);
  const compact = density === 'compact';
  const grouped = count > 1;
  const headline = headlineFor(item);
  const eyebrow = grouped
    ? `${count} ${CATEGORY_EYEBROW_PLURAL[item.category] ?? 'updates'}`
    : (CATEGORY_EYEBROW[item.category] ?? 'Update');
  // Owner 2026-09-27: "use the avatar when referring to a user — personal".
  const person = personFor(item, headline);

  return (
    <PressTarget
      onClick={() => onClick(item)}
      data-unread={unread ? '' : undefined}
      className={cn(
        'group relative flex w-full items-start gap-3 text-left',
        // Unread is carried by the semibold headline and the dot alone; the row
        // itself stays on the card surface (owner: no highlight washes). Only
        // pointer feedback tints it.
        'transition-colors duration-fast hover:bg-surface-sunken/60 active:bg-surface-sunken',
        compact
          ? // Edge to edge inside the Latest card: no radius, inset focus ring so
            // the card's overflow-hidden cannot clip it.
            'min-h-[64px] px-4 py-3 focus-visible:z-10 focus-visible:ring-inset focus-visible:ring-offset-0'
          : 'min-h-[72px] rounded-fw-md px-4 py-3.5',
      )}
    >
      {person ? (
        <span className="relative mt-0.5 flex-shrink-0" aria-hidden>
          <Avatar
            decorative
            name={person}
            src={people?.[person.toLowerCase()] ?? null}
            size={compact ? 'md' : 'lg'}
          />
          {/*
            The badge's ring cuts it out of the avatar in the colour of the
            panel behind the row: the Latest card (compact) and the bell's
            phone Sheet are bg-surface; the bell's md+ popover is bg-elevated
            (NotificationBell switches at 768px, the same as `md:`).
          */}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-accent-fill text-text-on-accent-fill ring-2',
              compact ? 'ring-surface' : 'ring-surface md:ring-elevated',
            )}
          >
            <Icon size={10} strokeWidth={2.25} />
          </span>
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid flex-shrink-0 place-items-center rounded-full',
            compact ? 'h-10 w-10' : 'h-12 w-12',
            unread ? 'bg-accent-fill text-text-on-accent-fill' : 'bg-accent-50 text-accent-700',
          )}
        >
          <Icon size={compact ? 17 : 18} strokeWidth={1.75} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="font-fw-sans text-caption font-semibold uppercase tracking-[0.06em] text-accent-700">
          {eyebrow}
        </p>
        <p
          className={cn(
            'mt-0.5 truncate font-fw-sans text-body text-text-primary',
            unread ? 'font-semibold' : 'font-medium',
          )}
        >
          <span className="sr-only">
            {unread ? 'Unread: ' : ''}
            {grouped ? `${count} notifications from ` : ''}
          </span>
          {headline}
        </p>
        {item.body ? (
          <p
            className={cn(
              'mt-0.5 font-fw-sans text-body-sm',
              unread ? 'text-text-secondary' : 'text-text-tertiary',
              compact ? 'truncate' : 'line-clamp-2',
            )}
          >
            {item.body}
          </p>
        ) : null}
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-2 pt-px">
        <time
          dateTime={item.created_at}
          title={fullDateTime(item.created_at)}
          className="whitespace-nowrap font-fw-sans text-caption tabular-nums text-text-tertiary"
        >
          {relativeTimeFrom(item.created_at)}
        </time>
        {unread ? (
          <span aria-hidden className="mr-0.5 h-2 w-2 rounded-full bg-accent-500" />
        ) : (
          <span aria-hidden className="mr-0.5 h-2 w-2" />
        )}
      </div>
    </PressTarget>
  );
}
