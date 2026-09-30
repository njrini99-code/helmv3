'use client';

import { Pencil, RotateCw, TriangleAlert } from 'lucide-react';
import { parseSemesterDates } from '@/lib/golf/semester';
import {
  calendarGap,
  conflictsOf,
  daysLabel,
  eventLabel,
  gapReason,
  hasNoTime,
  isFlexible,
  longDay,
  timeRange,
  upcomingMeetings,
  type ChClass,
  type ChTerm,
  type ChWeek,
} from '../../data/classes-shape';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';

/**
 * One class (classes.jsx `Detail`): when and where it meets, its next
 * meetings, and Edit and Remove. The board's grade, next deadline and "share
 * with coach" switch have no source in `golf_player_classes`, so they aren't
 * drawn (docs/clubhouse/phone/classes.md, gaps).
 */
export function ClassDetail({
  c,
  todayIso,
  term,
  week,
  unsynced,
  syncing,
  onClose,
  onEdit,
  onRemove,
  onRetrySync,
}: {
  c: ChClass | null;
  todayIso: string;
  term: ChTerm;
  week: ChWeek;
  unsynced: boolean;
  syncing: boolean;
  onClose: () => void;
  onEdit: (c: ChClass) => void;
  onRemove: (c: ChClass) => void;
  onRetrySync: (c: ChClass) => void;
}) {
  const flexible = c ? isFlexible(c) : true;
  const mine = c && !week.error ? conflictsOf([c], week.events, week.dates) : [];
  // From the later of today and the first day of the class's own term: a class in next term meets from then, not from today.
  const own = c ? parseSemesterDates(c.semester || term.label) : null;
  // A class that isn't on the calendar (no days, or no full time) has no meetings to list.
  const gap = c ? calendarGap(c) : null;
  const meetings = c && !gap ? upcomingMeetings(c, own && own.start > todayIso ? own.start : todayIso, own?.end ?? term.end, 4) : [];
  const facts: Array<[string, string]> = c
    ? [
        ['When', flexible ? (hasNoTime(c) ? `${daysLabel(c.days)} · No time set` : 'No fixed meeting') : `${daysLabel(c.days)} · ${timeRange(c.start, c.end)}`],
        ...(gap ? ([['Calendar', `Not on your calendar: ${gapReason(gap)}`]] as Array<[string, string]>) : []),
        ['Where', c.location ?? 'Not set'],
        ['Instructor', c.instructor ?? 'Not listed'],
        ['Term', c.semester ?? 'Not set'],
        ...(c.notes ? ([['Notes', c.notes]] as Array<[string, string]>) : []),
      ]
    : [];
  return (
    <Modal
      open={!!c}
      onClose={onClose}
      title={c?.name ?? ''}
      description={c ? [c.code, c.credits != null ? `${c.credits} ${c.credits === 1 ? 'credit' : 'credits'}` : null, c.semester].filter(Boolean).join(' · ') : undefined}
      width={460}
      footer={
        c && (
          <>
            <Button
              variant="ghost"
              className="ch-cl-danger"
              onClick={() => {
                // CH-12702: the warning comes before the question.
                haptic('warning');
                onRemove(c);
              }}
            >
              Remove class
            </Button>
            <Button leftIcon={Pencil} onClick={() => onEdit(c)}>
              Edit class
            </Button>
          </>
        )
      }
    >
      {c && (
        <div className="ch-cl-detail">
          {unsynced && (
            <div className="ch-cl-clash">
              <Icon icon={TriangleAlert} size={15} />
              <span>
                <b>Not on your calendar</b>
                The last sync failed, so your coach won&apos;t see this class on the team calendar yet.
              </span>
              <Button size="sm" leftIcon={RotateCw} disabled={syncing} onClick={() => onRetrySync(c)}>
                {syncing ? 'Syncing' : 'Retry sync'}
              </Button>
            </div>
          )}
          <dl className="ch-cl-facts">
            {facts.map(([k, val]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
          {meetings.length > 0 && (
            <section className="ch-cl-meet" aria-labelledby="ch-cl-meet-h">
              <h3 id="ch-cl-meet-h">Next meetings</h3>
              <ol>
                {meetings.map((d) => {
                  const over = mine.find((x) => x.date === d);
                  return (
                    <li key={d} className={(d === todayIso ? 'is-today ' : '') + (over ? 'is-over' : '')}>
                      <i aria-hidden="true" />
                      <span className="ch-num">{longDay(d)}</span>
                      <em>{d === todayIso ? 'Today' : over ? `Overlaps ${eventLabel(over.event)}` : 'Upcoming'}</em>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
