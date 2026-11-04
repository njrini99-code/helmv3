'use client';

import { AlertTriangle, Bus, ChevronRight } from 'lucide-react';
import { formatWith } from '../../lib/dates';
import { useChClock } from '../../lib/use-clock';
import {
  addDays,
  timeLabel,
  dateOf,
  dayToken,
  eventLabel,
  eventWhen,
  eventWindowOn,
  hasNoDays,
  inTerm,
  longDay,
  shortDay,
  tabParts,
  toMinutes,
  DAY_LONG,
  DAY_SHORT,
  type ChClass,
  type ChConflictGroup,
  type ChTeamEvent,
  type ChTerm,
  type ChWeek,
} from '../../data/classes-shape';
import { Icon } from '../../ui/Icon';
import { GroupList, GroupRow } from '../../ui/GroupList';
import { InlineNotice } from '../../ui/Notices';
import { Surface } from '../../ui/Surface';
import { plural } from '../../lib/plural';
import { termFigures } from './parts';

const RIBBON_FROM = 7 * 60;
const RIBBON_SPAN = 10 * 60;

/**
 * The week's classes for one day, once each. Today's rule by id and start, and also by code or name and start, because a duplicated
 * import is separate rows with separate ids (classes-roster-home 02 §3.2).
 */
export function meetingsOn(classes: readonly ChClass[], term: ChTerm, iso: string): ChClass[] {
  const day = dayToken(iso);
  const seen = new Set<string>();
  const out: ChClass[] = [];
  const sorted = classes.filter((c) => inTerm(c, term) && !hasNoDays(c) && c.days.includes(day)).sort((a, b) => (a.start ?? '99').localeCompare(b.start ?? '99'));
  for (const c of sorted) {
    const byId = `${c.id}|${c.start}`;
    const byName = `${(c.code || c.name).toLowerCase()}|${c.start}`;
    if (seen.has(byId) || seen.has(byName)) continue;
    seen.add(byId);
    seen.add(byName);
    out.push(c);
  }
  return out;
}

/** "Soon": the term end and this week's team events, nothing without a source (owner, 31 Oct), at most four. */
export function soonItems(term: ChTerm, week: ChWeek, todayIso: string): Array<{ when: string; what: string }> {
  const events = week.error ? [] : week.events.filter((e) => e.startDate >= todayIso).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startMin - b.startMin);
  return [...events.slice(0, 3).map((e) => ({ when: shortDay(e.startDate), what: eventLabel(e) })), { when: shortDay(term.end), what: 'Term ends' }];
}

/** The view's one feature card (06 §4.2): week, weeks left, credits by class, how far through the term today is, and Soon. */
export function TermCard({ term, classes, week, todayIso, overlaps, overlapsError, onOverlaps, desk = false }: { desk?: boolean; term: ChTerm; classes: readonly ChClass[]; week: ChWeek; todayIso: string; overlaps: number; overlapsError: boolean; onOverlaps: () => void }) {
  const mine = classes.filter((c) => inTerm(c, term));
  const fig = termFigures(mine);
  const left = term.week != null ? Math.max(0, term.weeks - term.week) : null;
  const week1 = term.week != null ? `Week ${term.week}` : `Starts in ${plural(term.startsIn ?? 0, 'day')}`;
  const heading = desk && left != null ? `${week1} · ${plural(left, 'week')} left` : week1;
  // Desktop folds the counts into the line under the heading (06 §4.9); the phone gives them their own row.
  const sub = desk ? [mine.length > 0 ? fig.text : null, `term ends ${shortDay(term.end)}`].filter(Boolean).join(' · ') : left != null ? `${plural(left, 'week')} left · term ends ${shortDay(term.end)}` : `Term ends ${shortDay(term.end)}`;
  const pct = `${Math.max(0, Math.min(1, term.progress)) * 100}%`;
  return (
    <section className={'ch-cl-term' + (desk ? ' is-desk' : '')} aria-label={`${term.label}. ${heading}. ${sub}. ${fig.text}.`}>
      <div className="ch-cl-term__top">
        {term.week != null && (
          <span className="ch-cl-term__wk" aria-hidden="true">
            <b className="ch-num">{term.week}</b>
            <span className="ch-num">of {term.weeks}</span>
          </span>
        )}
        <span className="ch-cl-term__h">
          <h2>{heading}</h2>
          <span className="ch-num">{sub}</span>
        </span>
        {!overlapsError && overlaps > 0 && (
          <button type="button" className="ch-cl-term__over" onClick={onOverlaps}>
            <Icon icon={AlertTriangle} size={13} />
            <span className="ch-num">{plural(overlaps, 'overlap')}</span>
          </button>
        )}
      </div>
      {mine.length > 0 && (
        <div className="ch-cl-term__credits">
          {!desk && (
            <span className="ch-cl-term__cl">
              <span className="ch-num">{plural(fig.count, 'class', 'classes')}</span>
              <b className="ch-num">{plural(fig.credits, 'credit')}</b>
            </span>
          )}
          <span className="ch-cl-term__bar" aria-hidden="true">
            {mine.map((c) => (
              <i key={c.id} className={`ch-cl-t-${c.tone}`} style={{ flexGrow: c.credits ?? 0 }} />
            ))}
          </span>
        </div>
      )}
      <span className="ch-cl-term__line" aria-hidden="true">
        <i className="ch-cl-term__fill" style={{ width: pct }} />
        <i className="ch-cl-term__now" style={{ left: pct }} />
      </span>
      <dl className="ch-cl-term__soon">
        {soonItems(term, week, todayIso).map((s) => (
          <div key={`${s.when}${s.what}`}>
            <dt className="ch-num">{s.when}</dt>
            <dd>{s.what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function clockParts(label: string | null): [string, string] {
  if (!label) return ['—', ''];
  const m = label.match(/^(\S+)\s*(AM|PM)?$/i);
  return m ? [m[1]!, m[2] ?? ''] : [label, ''];
}

function ClassRow({ c, sub, onOpen }: { c: ChClass; sub: string | null; onOpen?: (c: ChClass) => void }) {
  const hours = useChClock();
  const [time, ampm] = clockParts(timeLabel(c.start, hours));
  const body = (
    <>
      <span className="ch-cl-tr__t">
        <b className="ch-num">{time}</b>
        {ampm && <em>{ampm}</em>}
      </span>
      <i className={`ch-cl-tr__dot ch-cl-t-${c.tone}`} />
      <span className="ch-cl-tr__b">
        <b>{c.name}</b>
        {sub && <span>{sub}</span>}
      </span>
    </>
  );
  return (
    <GroupRow twoLine className="ch-cl-tr">
      {onOpen ? (
        <button type="button" className="ch-cl-tr__btn" data-ch-class-row="" onClick={() => onOpen(c)}>
          {body}
          <Icon icon={ChevronRight} size={15} />
        </button>
      ) : (
        <span className="ch-cl-tr__btn">{body}</span>
      )}
    </GroupRow>
  );
}

function EventRow({ e, date }: { e: ChTeamEvent; date: string }) {
  const hours = useChClock();
  const w = eventWindowOn(e, date);
  const [time, ampm] = clockParts(w ? timeLabel(`${String(Math.floor(w[0] / 60)).padStart(2, '0')}:${String(w[0] % 60).padStart(2, '0')}`, hours) : null);
  return (
    <GroupRow twoLine className="ch-cl-tr">
      <span className="ch-cl-tr__btn">
        <span className="ch-cl-tr__t">
          <b className="ch-num">{time}</b>
          {ampm && <em>{ampm}</em>}
        </span>
        <i className="ch-cl-tr__dot is-team" />
        <span className="ch-cl-tr__b">
          <b>{eventLabel(e)}</b>
          {e.where && <span>{e.where}</span>}
        </span>
      </span>
    </GroupRow>
  );
}

const ribbonBox = (from: number, to: number) => {
  const a = Math.max(0, Math.min(1, (from - RIBBON_FROM) / RIBBON_SPAN));
  const b = Math.max(0, Math.min(1, (to - RIBBON_FROM) / RIBBON_SPAN));
  return { left: `${a * 100}%`, width: `${Math.max(0, b - a) * 100}%` };
};

/** The next class day at a glance, 7 AM to 5 PM (06 §4.3): classes in their tone, team events in green. Outside those hours clamps to the ends. */
function DayRibbon({ iso, classes, events }: { iso: string; classes: readonly ChClass[]; events: readonly ChTeamEvent[] }) {
  const longName = DAY_LONG[dayToken(iso)];
  return (
    <div className="ch-cl-ribbon-wrap">
      <div className="ch-cl-ribbon" role="img" aria-label={`${longName} from 7 AM to 5 PM`}>
        {classes.map((c) => {
          const a = toMinutes(c.start);
          const b = toMinutes(c.end);
          return a != null && b != null ? <i key={c.id} className={`ch-cl-t-${c.tone}`} style={ribbonBox(a, b)} /> : null;
        })}
        {events.map((e) => {
          const w = eventWindowOn(e, iso);
          return w ? <i key={e.id} className="is-team" style={ribbonBox(w[0], w[1])} /> : null;
        })}
      </div>
      <span className="ch-cl-ribbon__axis ch-num" aria-hidden="true">
        <span>7 AM</span>
        <span>10</span>
        <span>1 PM</span>
        <span>5 PM</span>
      </span>
    </div>
  );
}

/** Today (06 §4.3): a class day is rows only; a day off is the ribbon, then the next class day's rows. */
export function TodayCard({ classes, term, todayIso, week, onOpen }: { classes: readonly ChClass[]; term: ChTerm; todayIso: string; week: ChWeek; onOpen: (c: ChClass) => void }) {
  const today = meetingsOn(classes, term, todayIso);
  let next: { iso: string; list: ChClass[] } | null = null;
  if (!today.length) {
    for (let i = 1; i <= 7 && !next; i++) {
      const iso = addDays(todayIso, i);
      const list = meetingsOn(classes, term, iso);
      if (list.length) next = { iso, list };
    }
  }
  const shown = today.length ? todayIso : next?.iso;
  const rows = today.length ? today : (next?.list ?? []);
  const events = !shown || week.error ? [] : week.events.filter((e) => eventWindowOn(e, shown));
  const weekday = formatWith(dateOf(todayIso), { weekday: 'long', timeZone: 'UTC' });
  const nextWords = next ? `Next: ${DAY_LONG[dayToken(next.iso)]}, ${shortDay(next.iso)}` : null;
  return (
    <Surface variant="card" level={2} padded={false} title="Today" actions={<span className="ch-cl-meta">{weekday}</span>}>
      {!today.length && (
        <div className="ch-cl-today2" data-ch-code="CH-12308">
          <div className="ch-cl-today2__h">
            <b>{next ? 'No classes today' : 'No classes this week'}</b>
            {nextWords && <span className="ch-num">{nextWords}</span>}
          </div>
          {next && <DayRibbon iso={next.iso} classes={next.list} events={events} />}
        </div>
      )}
      {(rows.length > 0 || events.length > 0) && (
        <GroupList inset="16px">
          {rows.map((c) => (
            <ClassRow key={c.id} c={c} sub={c.location} onOpen={onOpen} />
          ))}
          {shown && events.map((e) => <EventRow key={e.id} e={e} date={shown} />)}
        </GroupList>
      )}
    </Surface>
  );
}

/** Overlaps (06 §4.4): only when this week has one, or the read failed. A plain card, no tint, no edge. */
export function OverlapsCardCrh({ groups, error, onRetry }: { groups: readonly ChConflictGroup[]; error: boolean; onRetry: () => void }) {
  const hours = useChClock();
  if (error) {
    return <InlineNotice code="CH-12202" title="The team’s events didn’t load" body="Overlaps with practice and travel can’t be checked right now. Nothing has changed. Try again in a moment." onRetry={onRetry} />;
  }
  if (!groups.length) return null;
  return (
    <Surface variant="card" level={2} padded={false} title="Overlaps" actions={<span className="ch-cl-chip is-warn ch-num">{groups.length} this week</span>} footerNote="Your coach sees this overlap too.">
      <GroupList inset="16px">
        {groups.map((g) => (
          <li key={g.key} className="ch-cl-ov">
            <div className="ch-group__row ch-cl-ov__lead">
              <span className="ch-cl-ov__ic">
                <Icon icon={Bus} size={18} />
              </span>
              <span className="ch-cl-tr__b is-wrap">
                <b>
                  {eventLabel(g.event)} on {longDay(g.date)} overlaps {plural(g.classes.length, 'class', 'classes')}
                </b>
                <span className="ch-num">
                  {DAY_SHORT[dayToken(g.date)]} · {eventWhen(g.event, g.date, hours)}
                </span>
              </span>
            </div>
            <ul className="ch-cl-ov__rows">
              {g.classes.map((c) => (
                <ClassRow key={c.id} c={c} sub={[tabParts(c).top && c.code, c.location].filter(Boolean).join(' · ') || null} />
              ))}
            </ul>
          </li>
        ))}
      </GroupList>
    </Surface>
  );
}
