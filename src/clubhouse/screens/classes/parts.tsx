'use client';

import { Check, Eye, MapPin, Plus, RotateCw, TriangleAlert } from 'lucide-react';
import {
  CH_DAYS,
  CH_WEEKDAYS,
  DAY_LETTER,
  DAY_SHORT,
  clockLabel,
  conflictFlag,
  dateOf,
  dayToken,
  daysLabel,
  eventLabel,
  eventWhen,
  hasNoDays,
  hasNoTime,
  inTerm,
  isFlexible,
  longDay,
  shortDay,
  tabParts,
  timeRange,
  type ChClass,
  type ChConflict,
  type ChConflictGroup,
  type ChTerm,
} from '../../data/classes-shape';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { EmptyState } from '../../ui/States';

/** "3 credits · 5 classes". */
export function termFigures(classes: readonly ChClass[]): { credits: number; count: number; text: string } {
  const credits = classes.reduce((s, c) => s + (c.credits ?? 0), 0);
  const count = classes.length;
  const text = [credits ? `${credits} ${credits === 1 ? 'credit' : 'credits'}` : null, `${count} ${count === 1 ? 'class' : 'classes'}`].filter(Boolean).join(' · ');
  return { credits, count, text };
}

/** The term at a glance (classes.jsx `TermBar`): the week, the credits by class, how far through the term today is, and this week's overlaps with the team. */
export function TermBar({
  term,
  classes,
  todayIso,
  weekDates,
  overlaps,
  overlapsError,
}: {
  term: ChTerm;
  classes: readonly ChClass[];
  todayIso: string;
  weekDates: readonly string[];
  overlaps: number;
  overlapsError: boolean;
}) {
  const mine = classes.filter((c) => inTerm(c, term));
  const fig = termFigures(mine);
  const span = dateOf(term.end).getTime() - dateOf(term.start).getTime();
  const pos = (iso: string) => (span <= 0 ? 0 : Math.max(0, Math.min(100, ((dateOf(iso).getTime() - dateOf(term.start).getTime()) / span) * 100)));
  const now = pos(todayIso);
  const weekFrom = pos(weekDates[0] ?? todayIso);
  const weekTo = pos(weekDates[6] ?? todayIso);
  const where = term.week != null ? `week ${term.week} of ${term.weeks}` : `starts in ${term.startsIn} ${term.startsIn === 1 ? 'day' : 'days'}`;
  return (
    // CH-12803: one labelled group for the whole overview; the bars and the line are drawing, and the label says the same in words.
    <section className="ch-cl-tb" aria-label={`${term.label}, ${where}, ${fig.text}, ends ${shortDay(term.end)}`}>
      <div className="ch-cl-tb__top">
        <div className="ch-cl-tb__wk" aria-hidden="true">
          {term.week != null ? (
            <>
              <span>Week</span>
              <b className="ch-num">{term.week}</b>
              <em>of {term.weeks}</em>
            </>
          ) : (
            <>
              <span>Starts in</span>
              <b className="ch-num">{term.startsIn}</b>
              <em>{term.startsIn === 1 ? 'day' : 'days'}</em>
            </>
          )}
        </div>
        <div className="ch-cl-tb__stack">
          <span className="ch-cl-tb__k ch-num">{mine.length ? fig.text : `No classes in ${term.label}`}</span>
          {mine.length > 0 && (
            <div className="ch-cl-tb__bar" aria-hidden="true">
              {mine.map((c) => (
                <i
                  key={c.id}
                  className={`ch-cl-t-${c.tone}`}
                  style={{ flex: c.credits && c.credits > 0 ? c.credits : 1 }}
                  title={`${c.code || c.name}${c.credits != null ? ` · ${c.credits} cr` : ''}`}
                >
                  <b>{(c.credits ?? 1) > 1 ? tabParts(c).top : tabParts(c).top.slice(0, 1)}</b>
                </i>
              ))}
            </div>
          )}
        </div>
        {!overlapsError && (
          <div className={'ch-cl-tb__over' + (overlaps ? ' has-any' : '')}>
            <Icon icon={TriangleAlert} size={15} />
            <b className="ch-num">{overlaps}</b>
            <span>{overlaps === 1 ? 'overlap with the team this week' : 'overlaps with the team this week'}</span>
          </div>
        )}
      </div>
      <div className="ch-cl-tb__line" aria-hidden="true">
        <span className="ch-cl-tb__fill" style={{ width: `${now}%` }} />
        {Array.from({ length: term.weeks + 1 }, (_, i) => (
          <i key={i} className="ch-cl-tb__tick" style={{ left: `${(i / term.weeks) * 100}%` }} />
        ))}
        <span className="ch-cl-tb__wkb" style={{ left: `${weekFrom}%`, width: `${Math.max(weekTo - weekFrom, 1)}%` }}>
          <em>This week</em>
        </span>
        <span className="ch-cl-tb__today" style={{ left: `${now}%` }}>
          <em>Today</em>
        </span>
        <span className="ch-cl-tb__lab is-s">{shortDay(term.start)}</span>
        <span className="ch-cl-tb__lab is-e">{shortDay(term.end)}</span>
      </div>
    </section>
  );
}

/**
 * One class (classes.jsx `Binder`): its tab, name and instructor, the days it
 * meets with the start under each, then its room and what needs a look.
 * A class with days but no start and end time says so, and that it isn't on the calendar, as one with times but no days does.
 * CH-12801: the whole card is one button named for the class and when it meets.
 * CH-12802: the week strip is drawing, so it is hidden from screen readers.
 * CH-12701: opening a class is a selection tap. CH-12601: hovering lifts the card (quick).
 */
export function ClassCard({
  c,
  todayIso,
  term,
  overlaps,
  unsynced,
  onOpen,
}: {
  c: ChClass;
  todayIso: string;
  term: ChTerm;
  overlaps: readonly ChConflict[];
  unsynced: boolean;
  onOpen: (c: ChClass) => void;
}) {
  const flexible = isFlexible(c);
  const noDays = hasNoDays(c);
  const noTime = hasNoTime(c);
  const tab = tabParts(c);
  const today = dayToken(todayIso);
  const strip = c.days.some((d) => d === 'Sa' || d === 'Su') ? CH_DAYS : CH_WEEKDAYS;
  const range = timeRange(c.start, c.end);
  const when = flexible ? (noTime ? `${daysLabel(c.days)}, no time set` : 'no fixed meeting') : `${daysLabel(c.days)} ${range}`;
  const overlap = conflictFlag(overlaps);
  return (
    <button
      type="button"
      className={`ch-cl-card ch-cl-t-${c.tone}`}
      aria-label={`${c.code ? `${c.code}, ` : ''}${c.name}, ${when}`}
      onClick={() => {
        haptic('select');
        onOpen(c);
      }}
    >
      <span className="ch-cl-card__top">
        <span className="ch-cl-card__code">
          <b>{tab.top}</b>
          {tab.bottom}
        </span>
        {c.credits != null && <span className="ch-cl-card__cr">{c.credits} cr</span>}
      </span>
      <b className="ch-cl-card__name">{c.name}</b>
      <span className="ch-cl-card__prof">{c.instructor ?? 'Instructor not listed'}</span>
      {flexible ? (
        <span className="ch-cl-card__flex" data-ch-code={noDays || noTime ? undefined : 'CH-12303'}>
          {noDays ? 'Add the days this class meets.' : noTime ? 'Add the time this class meets.' : 'Online or arranged. No fixed meeting.'}
        </span>
      ) : (
        <span className="ch-cl-card__week" aria-hidden="true" style={{ ['--ch-cl-cols' as string]: strip.length }}>
          {strip.map((d) => {
            const on = c.days.includes(d);
            return (
              <span key={d} className={(on ? 'is-on' : '') + (d === today ? ' is-today' : '')}>
                <em>{DAY_LETTER[d]}</em>
                {on && <b className="ch-num">{clockLabel(c.start)}</b>}
              </span>
            );
          })}
        </span>
      )}
      <span className="ch-cl-card__f">
        {c.location && (
          <span className="ch-cl-card__loc">
            <Icon icon={MapPin} size={12} />
            {c.location}
          </span>
        )}
        {noDays && (
          <span className="ch-cl-flag" data-ch-code="CH-12304" title="Times are set but no days, so it isn't on your calendar. Edit the class to add them.">
            <Icon icon={TriangleAlert} size={12} />
            No meeting days, not on your calendar
          </span>
        )}
        {noTime && (
          <span className="ch-cl-flag" title="Days are set but not a start and an end time, so it isn't on your calendar. Edit the class to add them.">
            <Icon icon={TriangleAlert} size={12} />
            No meeting time, not on your calendar
          </span>
        )}
        {unsynced && (
          <span className="ch-cl-flag">
            <Icon icon={TriangleAlert} size={12} />
            Not on your calendar
          </span>
        )}
        {overlap && (
          <span className="ch-cl-flag">
            <Icon icon={TriangleAlert} size={12} />
            {overlap}
          </span>
        )}
        {!inTerm(c, term) && <span className="ch-cl-card__term">{c.semester}</span>}
      </span>
    </button>
  );
}

/** The dashed tile at the end of the deck (classes.jsx `AddCard`): it opens the same Add a class sheet as the header's button. */
export function AddTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button type="button" className="ch-cl-add" onClick={onAdd}>
      <span className="ch-cl-add__plus">
        <Icon icon={Plus} size={22} />
      </span>
      <b>Add a class</b>
      <em>Course, days, time and room</em>
    </button>
  );
}

/** This week's team events that meet a class (classes.jsx `Travel`, for any team event, not only a trip). */
export function OverlapsCard({ groups, error, onRetry }: { groups: readonly ChConflictGroup[]; error: boolean; onRetry: () => void }) {
  if (error) {
    return (
      <InlineNotice
        code="CH-12202"
        title="The team's events didn't load"
        body="Overlaps with practice and travel can't be checked right now. Nothing has changed. Try again in a moment."
        onRetry={onRetry}
      />
    );
  }
  if (!groups.length) {
    return (
      <div className="ch-cl-card2">
        <EmptyState compact code="CH-12302" icon={Check} title="Nothing overlaps this week" body="None of your classes meets over practice, travel or another team event." />
      </div>
    );
  }
  return (
    <section className="ch-cl-over" aria-labelledby="ch-cl-over-h">
      <div className="ch-cl-over__h">
        <span className="ch-cl-over__ic">
          <Icon icon={TriangleAlert} size={16} />
        </span>
        <div>
          <h2 id="ch-cl-over-h">{groups.length === 1 ? 'A team event overlaps your classes' : `${groups.length} team events overlap your classes`}</h2>
          <span>This week. Your coach can see your classes.</span>
        </div>
      </div>
      <ul className="ch-cl-over__l">
        {groups.map((g) => (
          <li key={g.key}>
            <span className="ch-cl-over__e">
              <b>{eventLabel(g.event)}</b>
              <em className="ch-num">
                {longDay(g.date)} · {eventWhen(g.event, g.date)}
                {g.event.where ? ` · ${g.event.where}` : ''}
              </em>
            </span>
            <span className="ch-cl-over__c">
              {g.classes.map((c) => (
                <span key={c.id} className="ch-cl-over__r">
                  <i className={`ch-cl-dot ch-cl-t-${c.tone}`} />
                  <span>
                    <b>{c.code || c.name}</b>
                    <em className="ch-num">
                      {DAY_SHORT[dayToken(g.date)]} {timeRange(c.start, c.end)}
                    </em>
                  </span>
                  <span className="ch-cl-flag">Overlap</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the coach can and can't see. The board says "busy time only"; the read policy lets an active coach read the class row itself. */
export function CoachNote() {
  return (
    <section className="ch-cl-card2 ch-cl-note">
      <Icon icon={Eye} size={16} />
      <div>
        <b>What your coach sees</b>
        <span>Your coach can see your classes, when they meet and where, so practice and travel are planned around them. Your teammates don&apos;t see them.</span>
      </div>
    </section>
  );
}

/**
 * The calendar sync's state, only when there is something to say. A failed sync
 * is remembered for this visit only (no column holds it), so there is no
 * "synced 2 minutes ago". CH-12403: while a sync runs the header says so.
 */
export function SyncStatus({ failed, syncing, onRetry }: { failed: number; syncing: boolean; onRetry: () => void }) {
  if (syncing) {
    return (
      <div className="ch-cl-sync" role="status" data-ch-code="CH-12403">
        <span className="ch-cl-sync__st">
          <span className="ch-cl-sync__sp" aria-hidden="true" />
          Adding to your calendar…
        </span>
      </div>
    );
  }
  if (!failed) return null;
  return (
    <div className="ch-cl-sync is-failed">
      <span className="ch-cl-sync__st">
        <Icon icon={TriangleAlert} size={14} />
        {failed === 1 ? '1 class is not on your calendar' : `${failed} classes are not on your calendar`}
      </span>
      <Button size="sm" leftIcon={RotateCw} onClick={onRetry}>
        Retry sync
      </Button>
    </div>
  );
}
