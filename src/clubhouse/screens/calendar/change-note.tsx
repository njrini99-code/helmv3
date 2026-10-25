'use client';

import { ChevronRight, CircleX, History, MapPin, PenLine, RotateCcw, type LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { WasValue } from '../../ui/WasValue';
import { haptic } from '../../lib/haptics';
import { restyleClock } from '../../lib/clock-format';
import type { ChClock } from '../../lib/clock-cookie';
import { CH_DUR, CH_EASE } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useMark, useMarkReader } from '../../lib/use-change-marks';
import { useChClock } from '../../lib/use-clock';
import type { ChCalChange, ChMovedAway } from './change-view';
import type { ChCalEvent } from './model';

/**
 * Change marks on the Calendar (P-14): the small badge beside a row, the struck old value under its title, and the panel at
 * the top of the event's detail. The words come from `composeChangeCopy` (already in `ChCalChange`); a device on the 24-hour
 * clock restyles them here, as it does every server-written time. Got it hides a change on this device and survives a
 * reload (the `ch_marks` cookie); a cancellation never hides.
 */

/** One glyph per kind, as the badge and the panel share it. */
export function markGlyph(change: Pick<ChCalChange, 'kind' | 'badge' | 'was'>): LucideIcon {
  switch (change.kind) {
    case 'place':
      return MapPin;
    case 'rename':
      return PenLine;
    case 'restore':
      return RotateCcw;
    case 'cancel':
      return CircleX;
    default:
      return History;
  }
}

/** Neutral with a glyph: a change is not a loss, so it is not amber. A cancellation keeps the existing warning badge, no glyph. */
export function MarkBadge({ change }: { change: Pick<ChCalChange, 'kind' | 'badge' | 'was'> }) {
  if (change.kind === 'cancel') return <Badge tone="warning">Cancelled</Badge>;
  return (
    <Badge tone="neutral">
      <Icon icon={markGlyph(change)} size={11} />
      {change.badge}
    </Badge>
  );
}

/** The mark this device still shows on a row: live, near enough for a row, and not cleared with Got it (a cancellation is never cleared). */
export function useRowMark(): (e: Pick<ChCalEvent, 'change' | 'location' | 'date' | 'span'>) => RowMark | null {
  const read = useMarkReader();
  const clock = useChClock();
  return (e) => {
    const change = e.change;
    if (!change || !change.rowMark) return null;
    if (change.kind !== 'cancel' && read(change.id).got) return null;
    // A multi-day event wears the struck value on its first day only; its other days keep the badge.
    const first = !e.span || e.date === e.span.from;
    return { change, sub: first && !change.partial ? markSub(e.location, change, clock) : null, aria: markAria(e.location, change, clock) };
  };
}

export interface RowMark {
  change: ChCalChange;
  /** The sub line with the old value struck beside the new, or null when the row keeps its plain line. */
  sub: ReactNode | null;
  /** Appended to the row's accessible name. */
  aria: string;
}

const rs = (text: string, clock: ChClock): string => restyleClock(text, clock);

/**
 * The sub line of a changed row: the old time struck before the place ("~~3:00 PM~~ · Finley range"); a changed place reads
 * new first and the old struck after ("Finley range ~~Lonnie Poole~~"); a rename puts the old name first.
 */
export function markSub(location: string | null, change: ChCalChange, clock: ChClock): ReactNode | null {
  const { was, kind } = change;
  if (change.kind === 'cancel') return location ? `Cancelled · ${location}` : 'Cancelled';
  const parts: ReactNode[] = [];
  const old = (text: string, key: string) => (
    <WasValue key={key} changeId={change.id}>
      {rs(text, clock)}
    </WasValue>
  );
  const rename = was.title ? old(was.title, 'title') : null;
  if (rename && kind === 'rename') parts.push(rename);
  if (was.time) parts.push(old(was.time, 'time'));
  if (was.place) {
    parts.push(
      <span key="place" className="ch-was-pair">
        {location ?? 'No place'} {old(was.place, 'place')}
      </span>,
    );
  } else if (location) {
    parts.push(location);
  }
  if (rename && kind !== 'rename') parts.push(rename);
  if (!parts.length) return null;
  return parts.flatMap((p, i) => (i ? [' · ', p] : [p]));
}

/** What a screen reader hears after the row's own label: the kind in words and what it was. */
export function markAria(location: string | null, change: ChCalChange, clock: ChClock): string {
  const was = (text: string | undefined) => (text ? `, was ${rs(text, clock)}` : '');
  if (change.partial) return ', changed';
  switch (change.kind) {
    case 'time':
    case 'day':
    case 'allday':
      return `, moved${was(change.was.time)}`;
    case 'retime':
      return `, new time${was(change.was.time)}`;
    case 'place':
      return location ? `, moved to ${location}${was(change.was.place)}` : `, no place set${was(change.was.place)}`;
    case 'rename':
      return `, renamed${was(change.was.title)}`;
    case 'restore':
      return ', back on';
    case 'cancel':
      return '';
    default:
      return `, changed${was(change.was.time)}`;
  }
}

/** The siblings after an element, in the order they sit. */
function after(el: Element): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let n = el.nextElementSibling; n; n = n.nextElementSibling) if (n instanceof HTMLElement) out.push(n);
  return out;
}

/**
 * The panel at the top of an event's detail: what changed, who and when. Got it removes it and leaves one quiet line with
 * Show it again; what sits below glides up by a transform (FLIP), never by animating a height. A cancelled event with no live
 * mark still says when it was cancelled and why.
 */
export function ChangeNote({ e }: { e: Pick<ChCalEvent, 'change' | 'cancelled' | 'cancelNote'> }) {
  const clock = useChClock();
  const reduced = useChReducedMotion();
  const change = e.change ?? null;
  const mark = useMark(change?.id);
  const slot = useRef<HTMLDivElement | null>(null);

  if (!change) {
    if (!e.cancelled || !e.cancelNote) return null;
    return (
      <div className="ch-change-slot">
        <div className="ch-change-note" role="note" aria-label="What changed" data-kind="cancel">
          <Icon icon={CircleX} size={18} className="ch-change-note__g" />
          <div className="ch-change-note__t">
            <b className="ch-change-note__h">{rs(e.cancelNote.line, clock)}</b>
            {e.cancelNote.reason && <q className="ch-change-note__why">{e.cancelNote.reason}</q>}
          </div>
        </div>
      </div>
    );
  }

  const cancel = change.kind === 'cancel';
  const hidden = mark.got && !cancel;

  const hide = () => {
    const el = slot.current;
    const below = el ? after(el) : [];
    const tops = below.map((n) => n.getBoundingClientRect().top);
    haptic('success');
    flushSync(() => mark.gotIt());
    if (reduced) return;
    below.forEach((n, i) => {
      const dy = tops[i]! - n.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5 || typeof n.animate !== 'function') return;
      n.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: CH_DUR.base * 1000, easing: `cubic-bezier(${CH_EASE.join(',')})` });
    });
  };

  return (
    <div className="ch-change-slot" ref={slot}>
      {hidden ? (
        <p className="ch-change-note__hidden">
          <span>Change hidden on this device.</span>
          <Button variant="ghost" size="sm" feel={null} className="ch-change-note__again" aria={{ label: 'Show the change again' }} onClick={() => mark.showAgain()}>
            Show it again
          </Button>
        </p>
      ) : (
        <div className="ch-change-note" role="note" aria-label="What changed" data-kind={change.kind}>
          <Icon icon={markGlyph(change)} size={18} className="ch-change-note__g" />
          <div className="ch-change-note__t">
            <b className="ch-change-note__h">{rs(change.panelLine1, clock)}</b>
            {change.panelRows.length > 0 && (
              <dl className="ch-change-note__rows">
                {change.panelRows.map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>
                      <span>{rs(r.now, clock)}</span> <WasValue changeId={change.id}>{rs(r.was, clock)}</WasValue>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <span className="ch-change-note__by">{rs(change.panelLine2, clock)}</span>
            {cancel && change.reason && <q className="ch-change-note__why">{change.reason}</q>}
          </div>
          {!cancel && (
            <div className="ch-change-note__a">
              <Button variant="ghost" size="sm" feel={null} className="ch-change-note__got" aria={{ label: 'Got it. Hide this change on this device.' }} onClick={hide}>
                Got it
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The agenda row's sub line ("Practice · Finley GC"), with the old values struck in it: the old time and name before the type, the old place after the new. */
export function agendaSub(location: string | null, change: ChCalChange, typeLabel: string, clock: ChClock): ReactNode {
  const { was } = change;
  const old = (text: string, key: string) => (
    <WasValue key={key} changeId={change.id}>
      {rs(text, clock)}
    </WasValue>
  );
  const parts: ReactNode[] = [];
  if (was.time) parts.push(old(was.time, 'time'));
  if (was.title) parts.push(old(was.title, 'title'));
  parts.push(typeLabel);
  if (was.place) {
    parts.push(
      <span key="place" className="ch-was-pair">
        {location ?? 'No place'} {old(was.place, 'place')}
      </span>,
    );
  } else if (location) {
    parts.push(location);
  }
  return parts.flatMap((p, i) => (i ? [' · ', p] : [p]));
}

/** On the week grid, where a hovered, focused or selected changed block started: a hairline across its column and "Was 3:00 PM". */
export function OldSlotLine({ top, label }: { top: number; label: string }) {
  return (
    <span className="ch-oldslot" style={{ top }} aria-hidden="true">
      <em>{label}</em>
    </span>
  );
}

/**
 * The row on the day an event left ("~~3:00~~ Practice · Moved to Thu at 4:00 PM"), so nobody hunts for it. It opens the event
 * on its new day. Not counted in a day's total, never part of an overlap check, never shown for a cancellation.
 */
export function MovedAwayRow({ g, variant, onOpen }: { g: ChMovedAway; variant: 'phone' | 'agenda'; onOpen: () => void }) {
  const clock = useChClock();
  const label = g.fromLabel ? rs(g.fromLabel, clock) : 'All day';
  const struck = (text: string) => <WasValue changeId={g.changeId}>{text}</WasValue>;
  if (variant === 'agenda') {
    return (
      <button type="button" data-print-visible className="ch-ag__row is-away" aria-label={g.aria} onClick={onOpen}>
        <span className="ch-ag__t">{struck(label)}</span>
        <span className="ch-ag__dot is-away" aria-hidden="true" />
        <span style={{ minWidth: 0 }}>
          <span className="ch-ag__a">{g.title}</span>
          <span className="ch-ag__b">{rs(g.sub, clock)}</span>
        </span>
        <Icon icon={ChevronRight} size={15} className="ch-away-go" />
      </button>
    );
  }
  return (
    <button type="button" className="ch-calm-ev ch-calm-ev--away" aria-label={g.aria} onClick={onOpen}>
      <span className="ch-calm-ev__t ch-num">{struck(g.fromLabel ? rs(g.fromLabel, clock).replace(/ [AP]M$/, '') : 'All day')}</span>
      <span className="ch-calm-ev__rail" aria-hidden="true">
        <i className="ch-away-ring" />
      </span>
      <span className="ch-calm-ev__b">
        <b>{g.title}</b>
        <span>{rs(g.sub, clock)}</span>
      </span>
      <Icon icon={ChevronRight} size={15} className="ch-away-go" />
    </button>
  );
}
