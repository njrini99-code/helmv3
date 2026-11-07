'use client';

import { Bus, Pencil, RotateCw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  calendarGap,
  conflictsOf,
  daysLabel,
  dayToken,
  longDay,
  shortDay,
  tabParts,
  timeRange,
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
import { GroupList, GroupRow } from '../../ui/GroupList';
import { Modal } from '../../ui/Modal';
import { Surface } from '../../ui/Surface';
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
  const mine = c && !week.error ? conflictsOf([c], week.events, week.dates) : [];
  // A class that isn't on the calendar (no days, or no full time) has no meetings to list.
  const gap = c ? calendarGap(c) : null;
  const thisWeek = c && !gap ? week.dates.filter((d) => c.days.includes(dayToken(d))) : [];
  return (
    <>
    <Modal
      open={!!c && !adding && !removing}
      onClose={onClose}
      detent={0.9}
      title={c ? [tabParts(c).top, tabParts(c).bottom].filter(Boolean).join(' ') : ''}
      description={undefined}
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
              Remove
            </Button>
            <Button variant="primary" leftIcon={Pencil} onClick={() => onEdit(c)}>
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
          <div className={`ch-cl-dhero ch-cl-t-${c.tone}`}>
              <span className="ch-cl-card__code">
                <b>{tabParts(c).top}</b>
                {tabParts(c).bottom}
              </span>
              <b className="ch-cl-dhero__n">{c.name}</b>
              {c.instructor && <em>{c.instructor}</em>}
            </div>
          <dl className={'ch-cl-facts' + ' is-grid'}>
            {(([
                  ['Meets', daysLabel(c.days) || '—'],
                  ['Time', timeRange(c.start, c.end, hours) ?? '—'],
                  ['Room', c.location ?? '—'],
                  ['Credits', c.credits != null ? String(c.credits) : '—'],
                ] as Array<[string, string]>)
            ).map(([k, val]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
          <Surface variant="card" padded={false} title="This week" actions={<span className="ch-cl-meta ch-num">{plural(thisWeek.length, 'meeting')}</span>}>
              <GroupList inset="16px">
                {thisWeek.map((d) => (
                  <GroupRow key={d} className="ch-cl-wk">
                    <span>
                      <b className="ch-num">{longDay(d)}</b>
                      <span className="ch-num">{timeRange(c.start, c.end, hours) ?? '—'}</span>
                    </span>
                    {mine.some((x) => x.date === d) && (
                      <span className="ch-cl-chip is-warn">
                        <Icon icon={Bus} size={12} /> Travel
                      </span>
                    )}
                  </GroupRow>
                ))}
              </GroupList>
            </Surface>

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
