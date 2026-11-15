'use client';

// Player Home's "Up next" card, exactly as it shipped on 2026-10-28 (db2f3766bf).
// The owner reverted player Home to its Oct 28 version permanently (2026-11-07);
// this card was later removed from HomePhone.tsx, so it lives here now.
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ChHomeEvent } from '../../data/home';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { chTrail } from '../../lib/track';
import { useChClock, useChClockText } from '../../lib/use-clock';
import { LinkPending } from '../../shell/LinkPending';
import { TYPE_LABEL } from '../calendar/model';
import { TYPE_ICON } from '../calendar/views';
import { MarkBadge, markSub, useRowMark } from '../calendar/change-note';
import { MineBadge } from './CoachAsks';
import { eventHref, whenLabel } from './event-links';

/** `children`: what closes the card (the player's countdown). `kicker`: the player's "Up next · Qualifier" (the coach's card names the type alone). */
export function UpNext({ e, now, children, kicker }: { e: ChHomeEvent; now: Date | null; children?: ReactNode; kicker?: string }) {
  const t = useChClockText();
  const clock = useChClock();
  // P-14: a changed event wears a badge in the kicker and its old value struck under the range, until Got it.
  const mark = useRowMark()(e);
  const was = mark && !mark.change.partial ? markSub(e.location, mark.change, clock, false) : null;
  const when = whenLabel(e, now);
  const people = e.invitees ?? [];
  return (
    <Link href={eventHref(e)} className="ch-hm-next" onClick={() => chTrail('home open next event')}>
      <span className="ch-hm-next__k">
        <span className="ch-hm-next__type">
          <Icon icon={TYPE_ICON[e.type]} size={13} />
          {kicker ? `${kicker} · ${TYPE_LABEL[e.type]}` : TYPE_LABEL[e.type]}
          {mark && <MarkBadge change={mark.change} />}
        </span>
        <span className={'ch-hm-next__when ch-num' + (when.soon ? ' is-soon' : '')}>{t(when.text)}</span>
      </span>
      <h2>{e.title}</h2>
      <p className="ch-num">{[t(e.rangeLabel), e.location].filter(Boolean).join(' · ')}</p>
      {was && <p className="ch-hm-next__was ch-num">{was}</p>}
      {e.invitees && people.length > 0 && (
        <span className="ch-hm-next__f">
          <span className="ch-hm-stack" aria-hidden="true">
            {people.slice(0, 5).map((n) => (
              <Avatar key={n} name={n} size="xs" />
            ))}
          </span>
          <span className="ch-hm-next__rsvp ch-num">
            {e.going != null ? (
              <>
                <b>{e.going}</b> of {people.length} going
              </>
            ) : (
              // An event that doesn't ask for replies (or whose replies didn't load) says who is on it, as the desk card does.
              `${people.length} invited`
            )}
          </span>
          <Icon icon={ChevronRight} size={17} />
        </span>
      )}
      {/* A player's own reply (their Home only; a coach's card never carries `mine`). */}
      <MineBadge mine={e.mine} />
      {children}
      <LinkPending />
    </Link>
  );
}
