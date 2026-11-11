'use client';

import { Eye, MapPin, RotateCw, TriangleAlert } from 'lucide-react';
import {
  CH_DAYS,
  CH_WEEKDAYS,
  DAY_LETTER,
  clockLabel,
  conflictFlag,
  dayToken,
  daysLabel,
  hasNoDays,
  hasNoTime,
  inTerm,
  isFlexible,
  tabParts,
  timeRange,
  type ChClass,
  type ChConflict,
  type ChTerm,
} from '../../data/classes-shape';
import { useChClock } from '../../lib/use-clock';

/** The days the timetable shows: the weekdays, and the weekend only when a class meets then. */
export function timetableDays(classes: readonly ChClass[]): readonly string[] {
  return classes.some((c) => c.days.some((d) => d === 'Sa' || d === 'Su')) ? CH_DAYS : CH_WEEKDAYS;
}

import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Spinner } from '../../ui/Spinner';
import { plural } from '../../lib/plural';

/** "3 credits · 5 classes". */
export function termFigures(classes: readonly ChClass[]): { credits: number; count: number; text: string } {
  const credits = classes.reduce((s, c) => s + (c.credits ?? 0), 0);
  const count = classes.length;
  const text = [credits ? `${plural(credits, 'credit')}` : null, `${plural(count, 'class', 'classes')}`].filter(Boolean).join(' · ');
  return { credits, count, text };
}

/**
 * One class (classes.jsx `Binder`): its tab, name and instructor, the days it
 * meets with the start under each, then its room and what needs a look.
 * A class with days but no start and end time says so, and that it isn't on the calendar, as one with times but no days does.
 * CH-12801: the whole card is one button named for the class and when it meets.
 * CH-12802: the week strip is drawing, so it is hidden from screen readers.
 * CH-12701: opening a class is a selection tap. CH-12601: on the desktop Ledger it takes the row tint on hover (quick)
 * and a deeper one on press, no lift.
 */
export function ClassCard({
  c,
  todayIso,
  term,
  overlaps,
  unsynced,
  onOpen,
  days = CH_WEEKDAYS,
  teamDays,
}: {
  c: ChClass;
  todayIso: string;
  term: ChTerm;
  overlaps: readonly ChConflict[];
  unsynced: boolean;
  onOpen: (c: ChClass) => void;
  /** The timetable's days (the deck's, so every row lines up under one header). */
  days?: readonly string[];
  /** The days a team event this week meets a class: the green band runs down the whole list on those days. */
  teamDays?: ReadonlySet<string>;
}) {
  const hours = useChClock();
  const flexible = isFlexible(c);
  const noDays = hasNoDays(c);
  const noTime = hasNoTime(c);
  const tab = tabParts(c);
  const today = dayToken(todayIso);
  const strip = days;
  const clash = new Set(overlaps.map((x) => dayToken(x.date)));
  const range = timeRange(c.start, c.end, hours);
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
      <span className="ch-cl-card__n">
        <b className="ch-cl-card__name">{c.name}</b>
        <span className="ch-cl-card__prof">{c.instructor ?? 'Instructor not listed'}</span>
      </span>
      {flexible ? (
        <span className="ch-cl-card__flex" data-ch-code={noDays || noTime ? undefined : 'CH-12303'}>
          {noDays ? 'Add the days this class meets.' : noTime ? 'Add the time this class meets.' : 'Online or arranged. No fixed meeting.'}
        </span>
      ) : (
        <span className="ch-cl-card__week" aria-hidden="true" style={{ ['--ch-cl-cols' as string]: strip.length }}>
          {strip.map((d) => {
            const on = c.days.includes(d);
            // A meeting is a raised paper tile with its start under the day; a day off is an outline. Today is ringed, and a
            // meeting a team event overlaps wears the amber ring (the flag under the week says which event).
            return (
              <span key={d} className={(on ? 'is-on' : '') + (d === today ? ' is-today' : '') + (on && clash.has(d) ? ' is-clash' : '') + (teamDays?.has(d) ? ' is-team' : '')}>
                <em>{DAY_LETTER[d]}</em>
                {on && <b className="ch-num">{clockLabel(c.start, hours)}</b>}
              </span>
            );
          })}
        </span>
      )}
      <span className="ch-cl-card__f">
        {c.location && (
          <span className="ch-cl-card__loc">
            <Icon icon={MapPin} size={14} />
            <span>{c.location}</span>
          </span>
        )}
        {noDays && (
          <span className="ch-cl-flag" data-ch-code="CH-12304" title="Times are set but no days, so it isn’t on your calendar. Edit the class to add them.">
            <Icon icon={TriangleAlert} size={12} />
            No meeting days, not on your calendar
          </span>
        )}
        {noTime && (
          <span className="ch-cl-flag" title="Days are set but not a start and an end time, so it isn’t on your calendar. Edit the class to add them.">
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

/** What the coach can and can't see. The board says "busy time only"; the read policy lets an active coach read the class row itself. */
export function CoachNote({ aware = false }: { aware?: boolean }) {
  return (
    <section className="ch-cl-card2 ch-cl-note">
      <Icon icon={Eye} size={16} />
      <div>
        <b>What your coach sees</b>
        {/* With class status on the panel above says what coaches see; this says where your classes also show. Your classes, with their times
            and rooms, are on the team calendar, which your coaches and teammates can read (calendar-sync.ts, golf_events_select_team). */}
        <span>
          {aware
            ? 'Your coach can see your classes, when they meet and where, so practice and travel are planned around them. They are on the team calendar, which your teammates can see too.'
            : 'Your coach can see your classes, when they meet and where, so practice and travel are planned around them. Your teammates don’t see them.'}
        </span>
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
          <Spinner size="sm" />
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
