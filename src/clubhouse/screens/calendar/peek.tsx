'use client';

import { CalendarDays, MessageSquare, Navigation } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon';
import { PeekTarget, type PeekAction } from '../../ui/Peek';
import { rebuiltHref } from '../../shell/nav';
import { messagesPrefillHref } from '../messages/prefill';
import { dayNum, dowOf, fmtHour, monthName, rangeLabel, TYPE_LABEL, type ChCalEvent, type ChCalPerson } from './model';
import { TYPE_ICON } from './type-icon';

/**
 * P006-C3: an event peeks where it is listed: a hold on the phone's agenda row, a rest of the pointer on a week block.
 * The card says what, when, where and who has answered; the actions open it, and for the coach, Nudge the people who
 * haven't replied (Messages, prefilled; the coach presses Send) and, off site, Directions (a plain maps link).
 */
const OFF_SITE = new Set(['qualifier', 'tournament', 'travel']);

export function eventPeekActions(e: ChCalEvent, coach: boolean, people: Map<string, ChCalPerson>, onOpen: () => void): PeekAction[] {
  const waiting = coach ? e.people.filter((p) => (e.rsvp[p] ?? 'pending') === 'pending') : [];
  const when = e.allDay ? `${dowOf(e.date)} ${dayNum(e.date)} ${monthName(e.date)}` : `${dowOf(e.date)} ${dayNum(e.date)} ${monthName(e.date)} at ${fmtHour(e.start!)}`;
  const href = waiting.length ? messagesPrefillHref({ players: waiting, draft: `Can you let me know if you’re coming to ${e.title} (${when})? You can reply on the event in Calendar.`, title: e.title }) : null;
  const nudge = href ? rebuiltHref(href) : null;
  const first = waiting.length === 1 ? (people.get(waiting[0]!)?.name.split(' ')[0] ?? 'them') : null;
  return [
    { label: 'Open', icon: CalendarDays, onSelect: onOpen },
    ...(nudge ? [{ label: first ? `Nudge ${first}` : `Nudge ${waiting.length}`, icon: MessageSquare, href: nudge }] : []),
    ...(e.location && OFF_SITE.has(e.type) ? [{ label: 'Directions', icon: Navigation, href: `https://maps.apple.com/?q=${encodeURIComponent(e.location)}` }] : []),
  ];
}

export function EventPeekCard({ e, coach, people }: { e: ChCalEvent; coach: boolean; people: Map<string, ChCalPerson> }) {
  const counts = { accepted: 0, maybe: 0, declined: 0, pending: 0 };
  for (const p of e.people) counts[(e.rsvp[p] ?? 'pending') as keyof typeof counts] += 1;
  const waiting = e.people.filter((p) => (e.rsvp[p] ?? 'pending') === 'pending').map((p) => people.get(p)?.name.split(' ')[0]).filter(Boolean);
  return (
    <div className="ch-evpeek">
      <span className="ch-evpeek__k">
        <Icon icon={TYPE_ICON[e.type]} size={13} />
        {TYPE_LABEL[e.type]}
      </span>
      <b className="ch-evpeek__t">{e.title}</b>
      <span className="ch-evpeek__m ch-num">
        {dowOf(e.date)} {dayNum(e.date)} {monthName(e.date)} · {rangeLabel(e)}
      </span>
      {e.location && <span className="ch-evpeek__m">{e.location}</span>}
      {coach && e.people.length > 0 && (
        <span className="ch-evpeek__r ch-num">
          <b>{counts.accepted}</b> of {e.people.length} going
          {counts.declined ? ` · ${counts.declined} can’t` : ''}
          {waiting.length ? ` · no reply: ${waiting.slice(0, 3).join(', ')}${waiting.length > 3 ? ` and ${waiting.length - 3} more` : ''}` : ''}
        </span>
      )}
    </div>
  );
}

/** Wraps an event's row or block so it peeks; the row keeps its own tap. Classes and busy time don't peek. */
export function EventPeek({ e, coach, people, onOpen, disabled = false, children }: { e: ChCalEvent; coach: boolean; people: Map<string, ChCalPerson>; onOpen: () => void; disabled?: boolean; children: ReactNode }) {
  if (e.type === 'class' || e.type === 'busy') return <>{children}</>;
  return (
    <PeekTarget label={e.title} disabled={disabled} card={() => <EventPeekCard e={e} coach={coach} people={people} />} actions={eventPeekActions(e, coach, people, onOpen)}>
      {children}
    </PeekTarget>
  );
}
