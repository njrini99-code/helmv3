'use client';

import { Pencil, RotateCw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  shortDay,
  timeRange,
  upcomingMeetings,
  type ChClass,
  type ChTerm,
  type ChWeek,
} from '../../data/classes-shape';
import { useChClock } from '../../lib/use-clock';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { useClassAwareness } from '../../shell/context';
import { refetchMyClassDay, useMyClassDay } from '../../lib/use-class-day';
import { useAction } from '../../lib/use-action';
import { ClassStatusDetail } from './ClassStatusDetail';
import { ExamSheet } from './ExamSheet';
import { examsOfClass } from './exam-form';
import type { ChClassStatusWrites, ChExam } from './class-status-writes';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { plural } from '../../lib/plural';

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
  statusWrites,
  onStatusEnabled,
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
  /** P-10: the player's class status writes. Present only with `class_awareness_v1` on; absent draws nothing new. */
  statusWrites?: ChClassStatusWrites;
  onStatusEnabled?: (classId: string, enabled: boolean) => void;
}) {
  const hours = useChClock();
  // P-10: the class's status switch and its exams, with the flag on and the writes given.
  const aware = useClassAwareness() && !!statusWrites;
  const { day: myDay } = useMyClassDay({ enabled: aware });
  const [exams, setExams] = useState<ChExam[]>([]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChExam | null>(null);
  const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
  const classId = c?.id ?? null;
  const reloadExams = useCallback(async () => {
    if (!statusWrites || !aware) return;
    const next = await statusWrites.loadExams(todayIso);
    if (next) setExams(next);
  }, [statusWrites, aware, todayIso]);
  useEffect(() => {
    setEnabledOverride(null);
    if (classId) void reloadExams();
    else setExams([]);
  }, [classId, reloadExams]);
  const setEnabled = useAction(
    'classes.statusEnabled',
    (id: string, on: boolean) => statusWrites!.setClassStatusEnabled(id, on),
    { done: '', failed: 'Couldn’t change class status for this class', hint: 'Nothing was changed. Try again.', code: 'CH-12074' },
  );
  const addExam = useAction('classes.addExam', (v: { on: string; start: string; end: string; label: string }) => statusWrites!.addExam(v), {
    done: '',
    failed: 'Couldn’t add the exam',
    hint: 'Nothing was changed. Try again.',
    code: 'CH-12075',
  });
  const removeExam = useAction('classes.removeExam', (id: string) => statusWrites!.removeExam(id), { done: '', failed: 'Couldn’t remove the exam', hint: 'It is still on your list. Try again.', code: 'CH-12076' });
  const mine2 = c ? examsOfClass(exams, c) : [];
  const flexible = c ? isFlexible(c) : true;
  const mine = c && !week.error ? conflictsOf([c], week.events, week.dates) : [];
  // From the later of today and the first day of the class's own term: a class in next term meets from then, not from today.
  const own = c ? parseSemesterDates(c.semester || term.label) : null;
  // A class that isn't on the calendar (no days, or no full time) has no meetings to list.
  const gap = c ? calendarGap(c) : null;
  const meetings = c && !gap ? upcomingMeetings(c, own && own.start > todayIso ? own.start : todayIso, own?.end ?? term.end, 4) : [];
  const facts: Array<[string, string]> = c
    ? [
        ['When', flexible ? (hasNoTime(c) ? `${daysLabel(c.days)} · No time set` : 'No fixed meeting') : `${daysLabel(c.days)} · ${timeRange(c.start, c.end, hours)}`],
        ...(gap ? ([['Calendar', `Not on your calendar: ${gapReason(gap)}`]] as Array<[string, string]>) : []),
        ['Where', c.location ?? 'Not set'],
        ['Instructor', c.instructor ?? 'Not listed'],
        ['Term', c.semester ?? 'Not set'],
        ...(c.notes ? ([['Notes', c.notes]] as Array<[string, string]>) : []),
      ]
    : [];
  return (
    <>
    <Modal
      open={!!c && !adding && !removing}
      onClose={onClose}
      title={c?.name ?? ''}
      description={c ? [c.code, c.credits != null ? `${plural(c.credits, 'credit')}` : null, c.semester].filter(Boolean).join(' · ') : undefined}
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
                The last sync failed, so your coach won’t see this class on the team calendar yet.
              </span>
              <Button size="sm" leftIcon={RotateCw} busy={syncing} onClick={() => onRetrySync(c)}>
                {syncing ? 'Syncing…' : 'Retry sync'}
              </Button>
            </div>
          )}
          {aware && c && (
            <ClassStatusDetail
              enabled={enabledOverride ?? c.statusEnabled !== false}
              busy={setEnabled.pending}
              exams={mine2}
              onToggle={(next) => {
                setEnabledOverride(next);
                void setEnabled.run(c.id, next).then(async (r) => {
                  if (r.success) {
                    onStatusEnabled?.(c.id, next);
                    await refetchMyClassDay();
                  }
                  setEnabledOverride(null);
                });
              }}
              onAddExam={() => setAdding(true)}
              onRemoveExam={setRemoving}
            />
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
    {aware && (
      <>
        <ExamSheet
          open={adding}
          onClose={() => setAdding(false)}
          c={c}
          term={myDay?.term ?? null}
          today={todayIso}
          pending={addExam.pending}
          onAdd={(v) => {
            void addExam.run(v).then(async (r) => {
              if (!r.success) return;
              haptic('success');
              setAdding(false);
              await reloadExams();
              await refetchMyClassDay();
            });
          }}
        />
        <Modal
          open={!!removing}
          onClose={removeExam.pending ? () => {} : () => setRemoving(null)}
          code="CH-12570"
          width={420}
          title="Remove this exam?"
          description={removing ? `Remove ${removing.label || 'exam'} on ${shortDay(removing.on)}?` : undefined}
          footer={
            <>
              <Button variant="ghost" disabled={removeExam.pending} onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                busy={removeExam.pending}
                onClick={() => {
                  if (!removing) return;
                  void removeExam.run(removing.id).then(async (r) => {
                    if (!r.success) return;
                    setRemoving(null);
                    await reloadExams();
                    await refetchMyClassDay();
                  });
                }}
              >
                {removeExam.pending ? 'Removing…' : 'Remove'}
              </Button>
            </>
          }
        />
      </>
    )}
    </>
  );
}
