'use client';

import { BookOpen, Bus, ChevronDown, ChevronUp, Flag, Lock, Target, TriangleAlert, Trophy, Users, CalendarDays, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { haptic } from '../../lib/haptics';
import {
  CAL_END,
  CAL_HH,
  CAL_START,
  TYPE_LABEL,
  dayNum,
  dowOf,
  fmtHour,
  isMajor,
  layoutLanes,
  monthCells,
  monthName,
  rangeLabel,
  addDays,
  type ChCalEvent,
  type ChCalPerson,
  type ChCalType,
} from './model';

export const TYPE_ICON: Record<ChCalType, LucideIcon> = {
  practice: Flag,
  qualifier: Target,
  tournament: Trophy,
  meeting: Users,
  travel: Bus,
  class: BookOpen,
  other: CalendarDays,
  busy: Lock,
};

export interface ChNow {
  date: string;
  hour: number;
}

/** What a block says. A class shown as Busy never leaks its title or room. */
export function eventTitle(e: ChCalEvent, people: Map<string, ChCalPerson>): string {
  if (e.type === 'busy') return `Busy · ${e.title}`;
  if (e.type !== 'class') return e.title;
  const first = e.owner ? people.get(e.owner)?.name.split(' ')[0] : null;
  if (e.busyOnly) return first ? `${first} · Busy` : 'Busy';
  return first ? `${first} · ${e.title}` : e.title;
}

const byStart = (a: ChCalEvent, b: ChCalEvent) => (a.allDay ? -1 : (a.start ?? 0)) - (b.allDay ? -1 : (b.start ?? 0));

function EventBlock({
  e,
  lane,
  lanes,
  sel,
  flagged,
  people,
  onSelect,
}: {
  e: ChCalEvent;
  lane: number;
  lanes: number;
  sel: boolean;
  flagged: boolean;
  people: Map<string, ChCalPerson>;
  onSelect: (id: string) => void;
}) {
  const start = Math.max(e.start!, CAL_START);
  const end = Math.min(e.end!, CAL_END);
  const top = (start - CAL_START) * CAL_HH;
  const h = Math.max((end - start) * CAL_HH - 2, 20);
  const short = h < 40;
  const w = 100 / lanes;
  const title = eventTitle(e, people);
  const meta = short ? fmtHour(e.start!, false) : rangeLabel(e) + (h > 70 && e.location && !e.busyOnly ? ` · ${e.location}` : '');
  return (
    <button
      type="button"
      data-print-visible
      className={`ch-ev ch-ev--${e.type}${short ? ' ch-ev--short' : ''}${sel ? ' is-sel' : ''}`}
      style={{ top, height: h, left: `calc(${w * lane}% + 3px)`, width: `calc(${w}% - ${lanes > 1 ? 4 : 6}px)` }}
      aria-label={`${title}, ${rangeLabel(e)}${flagged ? ', schedule overlap' : ''}`}
      aria-pressed={sel}
      onClick={() => {
        haptic('select');
        onSelect(e.id);
      }}
    >
      <span className="ch-ev__t">{title}</span>
      <span className="ch-ev__m">{meta}</span>
      {flagged && !short && (
        <span className="ch-ev__warn" aria-hidden="true">
          <Icon icon={TriangleAlert} size={10} />
        </span>
      )}
    </button>
  );
}

export function TimeGrid({
  dates,
  events,
  people,
  now,
  selId,
  flagged,
  onSelect,
  onDay,
}: {
  dates: string[];
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  selId: string | null;
  flagged: Set<string>;
  onSelect: (id: string) => void;
  onDay: (date: string) => void;
}) {
  const hours = Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i);
  const nowLabel = fmtHour(now.hour, false);
  const nowVisible = now.hour >= CAL_START && now.hour <= CAL_END;
  return (
    <div
      className="ch-wk ch-cal-surface"
      style={{ ['--ch-cols' as string]: dates.length, ['--ch-hours' as string]: CAL_END - CAL_START, ['--ch-hh' as string]: `${CAL_HH}px` }}
    >
      <div className="ch-wk__head">
        <div />
        {dates.map((d) => (
          <button
            key={d}
            type="button"
            data-print-visible
            className={'ch-wk__day' + (d === now.date ? ' is-today' : '')}
            onClick={() => {
              haptic('select');
              onDay(d);
            }}
            aria-label={`${dowOf(d)} ${dayNum(d)} ${monthName(d)}${d === now.date ? ', today' : ''}. Open the day`}
          >
            <span className="ch-wk__d">{dowOf(d)}</span>
            <span className="ch-wk__n">{dayNum(d)}</span>
          </button>
        ))}
      </div>
      <div className="ch-wk__allday">
        <span>All day</span>
        {dates.map((d) => (
          <div key={d} className="ch-wk__allcell">
            {events
              .filter((e) => e.allDay && e.date === d)
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  data-print-visible
                  className={`ch-ev-bar ch-ev--${e.type}${selId === e.id ? ' is-sel' : ''}`}
                  aria-pressed={selId === e.id}
                  onClick={() => {
                    haptic('select');
                    onSelect(e.id);
                  }}
                >
                  <Icon icon={TYPE_ICON[e.type]} size={12} />
                  <span>{eventTitle(e, people)}</span>
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className="ch-wk__grid">
        <div className="ch-wk__rail" aria-hidden="true">
          {hours.map(
            (h) =>
              h > CAL_START && (
                <span key={h} style={{ top: (h - CAL_START) * CAL_HH }}>
                  {((h + 11) % 12) + 1} {h < 12 ? 'AM' : 'PM'}
                </span>
              ),
          )}
        </div>
        {dates.map((d) => {
          const laid = layoutLanes(events.filter((e) => !e.allDay && e.date === d && e.end! > CAL_START && e.start! < CAL_END));
          return (
            <div key={d} className={'ch-wk__col' + (d === now.date ? ' is-today' : '')}>
              {laid.map((l) => (
                <EventBlock key={l.e.id} e={l.e} lane={l.lane} lanes={l.lanes} sel={selId === l.e.id} flagged={flagged.has(l.e.id)} people={people} onSelect={onSelect} />
              ))}
              {d === now.date && nowVisible && (
                <div className="ch-wk__now" style={{ top: (now.hour - CAL_START) * CAL_HH }} role="separator" aria-label={`Now, ${fmtHour(now.hour)}`}>
                  <span className="ch-wk__nowlbl">{nowLabel}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthView({
  anchor,
  events,
  now,
  selDate,
  onPick,
}: {
  anchor: string;
  events: ChCalEvent[];
  now: ChNow;
  selDate: string;
  onPick: (date: string) => void;
}) {
  const cells = monthCells(anchor);
  return (
    <div className="ch-mo ch-cal-surface">
      <div className="ch-mo__dow" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="ch-mo__grid">
        {cells.map(({ date, out }) => {
          const evs = events.filter((e) => e.date === date && e.type !== 'class' && e.type !== 'busy').sort(byStart);
          const shown = evs.slice(0, 3);
          return (
            <button
              key={date}
              type="button"
              data-print-visible
              className={'ch-mo__cell' + (out ? ' is-out' : '') + (date === now.date ? ' is-today' : '') + (date === selDate ? ' is-sel' : '')}
              aria-label={`${dowOf(date)} ${dayNum(date)} ${monthName(date)}: ${evs.length ? `${evs.length} ${evs.length === 1 ? 'event' : 'events'}` : 'no events'}`}
              aria-pressed={date === selDate}
              onClick={() => {
                haptic('select');
                onPick(date);
              }}
            >
              <span className="ch-mo__n">{dayNum(date)}</span>
              {shown.map((e) => (
                <span key={e.id} className={'ch-mo__ev' + (isMajor(e.type) ? ' is-major' : '')}>
                  <i className={`ch-dot-${e.type}`} />
                  <span>{e.title}</span>
                </span>
              ))}
              {evs.length > 3 && <span className="ch-mo__more">{evs.length - 3} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaView({
  events,
  people,
  now,
  selId,
  flagged,
  onSelect,
}: {
  events: ChCalEvent[];
  people: Map<string, ChCalPerson>;
  now: ChNow;
  selId: string | null;
  flagged: Set<string>;
  onSelect: (id: string) => void;
}) {
  const [early, setEarly] = useState(false);
  const days = [...new Set(events.map((e) => e.date))].sort();
  const past = days.filter((d) => d < now.date);
  const list = early ? days : days.filter((d) => d >= now.date);
  const tomorrow = addDays(now.date, 1);
  const label = (d: string) => (d === now.date ? 'Today' : d === tomorrow ? 'Tomorrow' : `${dowOf(d)} ${dayNum(d)}`);
  const inDays = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${now.date}T12:00:00Z`)) / 86400000);

  return (
    <div className="ch-ag">
      {past.length > 0 && (
        <div>
          <Button size="sm" variant="ghost" leftIcon={early ? ChevronUp : ChevronDown} onClick={() => setEarly(!early)}>
            {early ? 'Hide earlier days' : `Show ${past.length} earlier ${past.length === 1 ? 'day' : 'days'}`}
          </Button>
        </div>
      )}
      {list.map((d) => {
        const evs = events.filter((e) => e.date === d).sort(byStart);
        const rows: React.ReactNode[] = [];
        evs.forEach((e, i) => {
          const prev = evs[i - 1];
          if (d === now.date && !e.allDay && e.start! > now.hour && (!prev || prev.allDay || prev.start! <= now.hour)) {
            rows.push(
              <div key="now" className="ch-ag__now" role="separator" aria-label={`Now, ${fmtHour(now.hour)}`}>
                <span>Now · {fmtHour(now.hour)}</span>
              </div>,
            );
          }
          rows.push(
            <button
              key={e.id}
              type="button"
              data-print-visible
              className={'ch-ag__row' + (selId === e.id ? ' is-sel' : '') + (e.type === 'class' || e.type === 'busy' ? ' is-class' : '')}
              aria-pressed={selId === e.id}
              onClick={() => {
                haptic('select');
                onSelect(e.id);
              }}
            >
              <span className="ch-ag__t">
                {e.allDay ? 'All day' : fmtHour(e.start!)}
                {!e.allDay && <span>{fmtHour(e.end!)}</span>}
              </span>
              <span className={`ch-ag__dot ch-dot-${e.type}`} aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                <span className="ch-ag__a">{e.type === 'class' && e.owner && people.get(e.owner) ? `${people.get(e.owner)!.name} · ${e.title}` : e.type === 'busy' ? e.title : eventTitle(e, people)}</span>
                <span className="ch-ag__b">
                  {e.type === 'busy' ? 'Your busy time · only you see it' : TYPE_LABEL[e.type]}
                  {e.location && !e.busyOnly ? ` · ${e.location}` : ''}
                </span>
              </span>
              {flagged.has(e.id) ? (
                <Badge tone="warning">
                  <Icon icon={TriangleAlert} size={11} />
                  Overlap
                </Badge>
              ) : (
                <span />
              )}
            </button>,
          );
        });
        const n = inDays(d);
        const sub = d === now.date || d === tomorrow ? `${dowOf(d)}, ${dayNum(d)} ${monthName(d)}` : n > 0 && n < 7 ? `In ${n} days` : `${dayNum(d)} ${monthName(d)}`;
        return (
          <section key={d} className={'ch-ag__day' + (d === now.date ? ' is-today' : '')} aria-label={label(d)}>
            <div className={'ch-ag__when' + (d === now.date ? ' is-today' : '')}>
              <b>{label(d)}</b>
              <span>{sub}</span>
            </div>
            <div className="ch-ag__list ch-cal-surface">{rows}</div>
          </section>
        );
      })}
    </div>
  );
}
