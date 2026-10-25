'use client';

import { plural } from '../../../lib/plural';
import { formatWhole } from '../../../lib/format';
import { AnimatePresence, m } from 'motion/react';
import { ChevronDown, Clock, Flag, Plus } from 'lucide-react';
import { useState } from 'react';
import { DateField } from '../../../ui/DateField';
import { Icon } from '../../../ui/Icon';
import { Segmented } from '../../../ui/Segmented';
import { Select } from '../../../ui/Select';
import { haptic } from '../../../lib/haptics';
import { chSpring, chTween } from '../../../lib/motion';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useChClock } from '../../../lib/use-clock';
import { CoursePicker, type ChQPickedCourse, type ChQPickedLoose } from '../../qualifiers/CoursePicker';
import type { ChQWrites } from '../../qualifiers/writes';
import { addDays } from '../../calendar/model';
import { RoundRow } from './RoundRow';
import {
  COUNTING_OPTIONS,
  EVENT_KIND_OPTIONS,
  FORMAT_OPTIONS,
  MAX_ROUNDS,
  addRound,
  daysBetween,
  inRoundOrder,
  lockLine,
  removeLastRound,
  roundsFromRange,
  sortRounds,
  spokenDay,
  teeText,
  thirtySixHoleStarts,
  type ChRoundDraft,
  type ChTourErrors,
  type ChTourState,
} from './rounds-model';

type Picking = { kind: 'main' } | { kind: 'round'; id: string } | null;

const teeLineOf = (p: { teeName: string | null; yards?: number | null; courseId: string | null }) =>
  !p.courseId ? 'Not in the course library' : p.teeName ? [p.teeName.toLowerCase().endsWith('tees') ? p.teeName : `${p.teeName} tees`, p.yards ? `${formatWhole(p.yards)} yds` : null].filter(Boolean).join(' · ') : 'Tees later';

/**
 * The tournament fields (P-5 4.1.4 to 4.1.7): first and last day, course, same course every round, the rounds, the lock
 * line, counting, format and more details. Shared by the calendar editor's section and, when it adopts them, 4.33's
 * own new-tournament form, so the two never drift (plan 14 (j)). Pure state in, next state out; `announce` gets the
 * polite line a change deserves (CH-6841).
 */
export function TournamentFields({
  state,
  onChange,
  errors,
  showErrors,
  timezone,
  courseWrites,
  announce,
  idPrefix = 'ch-tfx',
}: {
  state: ChTourState;
  onChange: (next: ChTourState) => void;
  errors: ChTourErrors;
  showErrors: boolean;
  timezone: string;
  courseWrites: Pick<ChQWrites, 'courses' | 'tees'>;
  announce?: (line: string) => void;
  idPrefix?: string;
}) {
  const reduced = useChReducedMotion();
  const clock = useChClock();
  const [picking, setPicking] = useState<Picking>(null);
  const [editingTee, setEditingTee] = useState<Set<string>>(() => new Set());
  const [more, setMore] = useState(false);
  const s = state;
  const custom = s.mode === 'custom';
  const err = (k: keyof ChTourErrors) => (showErrors ? errors[k] : undefined);
  const set = (patch: Partial<ChTourState>) => onChange({ ...s, ...patch });

  /** Rounds in date and time order; a change that reorders them is said once (CH-6841). */
  const setRounds = (next: ChRoundDraft[]) => {
    if (!inRoundOrder(next)) {
      const sorted = sortRounds(next);
      const moved = sorted.findIndex((r, i) => r.id !== next[i]?.id);
      const r = sorted[moved];
      if (r) announce?.(`Rounds reordered. Round ${moved + 1} is now ${spokenDay(r.date)}${r.tee ? ` at ${teeText(r.tee, clock)}` : ''}.`);
      onChange({ ...s, rounds: sorted });
      return;
    }
    onChange({ ...s, rounds: next });
  };
  const patchRound = (id: string, patch: Partial<ChRoundDraft>) => setRounds(s.rounds.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setFirst = (first: string) => {
    // A 3-day range stays 3 days: the last day moves with the first (the calendar's duration-keeping rule, on dates).
    const delta = daysBetween(s.firstDay, first);
    const last = addDays(s.lastDay, delta);
    const rounds = custom ? s.rounds.map((r) => ({ ...r, date: r.date ? addDays(r.date, delta) : r.date })) : roundsFromRange(first, last, s.rounds);
    onChange({ ...s, firstDay: first, lastDay: last, rounds });
  };
  const setLast = (v: string) => {
    const last = v < s.firstDay ? s.firstDay : v;
    if (custom) {
      onChange({ ...s, lastDay: last, rounds: s.rounds.map((r) => (r.date > last ? { ...r, date: last } : r)) });
      return;
    }
    const rounds = roundsFromRange(s.firstDay, last, s.rounds);
    if (rounds.length !== s.rounds.length) announce?.(`${plural(rounds.length, 'round')}, ${spokenDay(s.firstDay)} to ${spokenDay(last)}.`);
    onChange({ ...s, lastDay: last, rounds });
  };

  const pick = (p: ChQPickedLoose) => {
    const target = picking;
    setPicking(null);
    if (!target) return;
    if (target.kind === 'main') {
      onChange({ ...s, course: { id: p.courseId, label: p.courseName, teeId: p.teeId, teeLine: teeLineOf(p) }, rounds: s.sameCourse ? s.rounds.map(({ courseId: _c, courseLabel: _l, ...r }) => r) : s.rounds });
      return;
    }
    patchRound(target.id, p.courseId ? { courseId: p.courseId, courseLabel: p.courseName } : { courseId: null, courseLabel: p.courseName });
  };
  const picked = (_n: number, p: ChQPickedCourse) => pick({ ...p });

  const days = daysBetween(s.firstDay, s.lastDay) + 1;
  const thirtySix = thirtySixHoleStarts(s.rounds);
  const lock = lockLine(s.rounds, s.lockMinutes, timezone, clock);
  const individual = s.format === 'individual';
  const courseErr = err('course');
  const daysErr = err('days');
  const roundsErr = err('rounds');

  return (
    <div className="ch-tfx__body">
      <div className="ch-tfx__row">
        <span className="ch-tfx__lbl" id={`${idPrefix}-days`}>
          Days
        </span>
        <div>
          <div className="ch-tfx__pair" role="group" aria-labelledby={`${idPrefix}-days`}>
            <DateField label="First day" value={s.firstDay} onChange={(v) => v && setFirst(v)} />
            <DateField label="Last day" value={s.lastDay} min={s.firstDay} onChange={(v) => v && setLast(v)} aria-invalid={!!daysErr} aria-describedby={daysErr ? `${idPrefix}-days-err` : undefined} />
          </div>
          {daysErr && (
            <p id={`${idPrefix}-days-err`} className="ch-tfx__help is-error" data-ch-code={daysErr.code}>
              {daysErr.text}
            </p>
          )}
        </div>
      </div>

      <div className="ch-tfx__row">
        <span className="ch-tfx__lbl">Course</span>
        <div>
          <button
            type="button"
            id={`${idPrefix}-course`}
            className={'ch-tfx__course' + (s.course ? '' : ' is-empty')}
            aria-haspopup="dialog"
            aria-label={s.course ? `Course, ${s.course.label}${s.course.teeLine ? `, ${s.course.teeLine}` : ''}` : 'Course, not chosen'}
            data-invalid={courseErr ? 'true' : undefined}
            aria-describedby={courseErr ? `${idPrefix}-course-err` : undefined}
            onClick={() => setPicking({ kind: 'main' })}
          >
            <Icon icon={Flag} size={16} />
            <span>{s.course?.label ?? 'Search courses'}</span>
            <Icon icon={ChevronDown} size={16} />
          </button>
          {s.course?.teeLine && <p className="ch-tfx__help">{s.course.teeLine}</p>}
          {courseErr && (
            <p id={`${idPrefix}-course-err`} className="ch-tfx__help is-error" data-ch-code={courseErr.code}>
              {courseErr.text}
            </p>
          )}
          {s.rounds.length >= 2 && (
            <label className="ch-switch ch-tfx__gap">
              <input
                type="checkbox"
                role="switch"
                checked={s.sameCourse}
                onChange={(e) => {
                  haptic('select');
                  const on = e.target.checked;
                  // Back on: every round takes the main course, and nothing asks.
                  onChange({ ...s, sameCourse: on, rounds: on ? s.rounds.map(({ courseId: _c, courseLabel: _l, ...r }) => r) : s.rounds });
                }}
              />
              <span className="ch-switch__t" aria-hidden="true" />
              Same course every round
            </label>
          )}
        </div>
      </div>

      <div className="ch-tfx__row">
        <span className="ch-tfx__lbl">Rounds</span>
        <div>
          <Segmented<'daily' | 'custom'>
            size="sm"
            label="Rounds"
            value={s.mode}
            onChange={(mode) => onChange({ ...s, mode, rounds: mode === 'daily' ? roundsFromRange(s.firstDay, s.lastDay, s.rounds) : s.rounds })}
            options={[
              { value: 'daily', label: `One round each day (${Math.min(days, MAX_ROUNDS + 1)})` },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          <div className="ch-tfx__rounds ch-tfx__gap" aria-describedby={roundsErr ? `${idPrefix}-rounds-err` : undefined}>
            <AnimatePresence initial={false}>
              {s.rounds.map((r, i) => (
                <m.div
                  key={r.id}
                  layout={reduced ? false : 'position'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ opacity: chTween('quick', reduced), layout: chSpring('smooth', reduced) }}
                >
                  <RoundRow
                    round={r}
                    n={i + 1}
                    custom={custom}
                    firstDay={s.firstDay}
                    lastDay={s.lastDay}
                    canRemove={custom && i === s.rounds.length - 1 && s.rounds.length > 1}
                    courseLine={!s.sameCourse && s.rounds.length > 1 ? (r.courseLabel ?? s.course?.label ?? 'Course not chosen') : null}
                    editingTee={editingTee.has(r.id)}
                    label36={thirtySix.has(i)}
                    onTee={(tee) => patchRound(r.id, { tee })}
                    onEditTee={() => setEditingTee((x) => new Set(x).add(r.id))}
                    onDate={(date) => patchRound(r.id, { date })}
                    onStartType={(startType) => patchRound(r.id, { startType })}
                    onClearTee={() => {
                      setEditingTee((x) => {
                        const n = new Set(x);
                        n.delete(r.id);
                        return n;
                      });
                      patchRound(r.id, { tee: null });
                    }}
                    onRemove={() => setRounds(removeLastRound(s.rounds))}
                    onChangeCourse={!s.sameCourse && s.rounds.length > 1 ? () => setPicking({ kind: 'round', id: r.id }) : undefined}
                  />
                </m.div>
              ))}
            </AnimatePresence>
            {custom && s.rounds.length < MAX_ROUNDS && (
              <button type="button" className="ch-tfx__add" onClick={() => setRounds(addRound(s.rounds))}>
                <Icon icon={Plus} size={16} />
                Add a round
              </button>
            )}
          </div>
          {roundsErr && (
            <p id={`${idPrefix}-rounds-err`} className="ch-tfx__help is-error" data-ch-code={roundsErr.code}>
              {roundsErr.text}
            </p>
          )}
          <p className="ch-tfx__lock">
            <Icon icon={Clock} size={14} />
            <span className="ch-num">{lock}</span>
          </p>
        </div>
      </div>

      {!individual && (
        <div className="ch-tfx__row">
          <label className="ch-tfx__lbl" htmlFor={`${idPrefix}-counting`}>
            Counting
          </label>
          <div>
            <div className="ch-tfx__counts">
              <Select id={`${idPrefix}-counting`} value={s.counting} options={COUNTING_OPTIONS} onChange={(counting) => set({ counting })} />
              {s.counting === 'custom' && (
                <>
                  <Select label="Play" value={String(s.play)} options={NINE} onChange={(v) => set({ play: Number(v) })} />
                  <Select label="Count" value={String(s.count)} options={NINE} onChange={(v) => set({ count: Number(v) })} />
                </>
              )}
            </div>
            {err('counting') && (
              <p className="ch-tfx__help is-error" data-ch-code={err('counting')!.code}>
                {err('counting')!.text}
              </p>
            )}
          </div>
        </div>
      )}
      <div className="ch-tfx__row">
        <label className="ch-tfx__lbl" htmlFor={`${idPrefix}-format`}>
          Format
        </label>
        <div>
          <Select id={`${idPrefix}-format`} value={s.format} options={FORMAT_OPTIONS} onChange={(format) => set({ format })} />
        </div>
      </div>

      <button type="button" className="ch-tfx__disclose" aria-expanded={more} aria-controls={`${idPrefix}-more`} onClick={() => setMore((o) => !o)}>
        More details
        <Icon icon={ChevronDown} size={16} />
      </button>
      {more && (
        <m.div id={`${idPrefix}-more`} className="ch-tfx__body" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={chTween('quick', reduced)}>
          <div className="ch-tfx__row">
            <span className="ch-tfx__lbl">Holes</span>
            <Segmented<'18' | '9'>
              size="sm"
              label="Holes"
              value={String(s.holes) as '18' | '9'}
              onChange={(v) => set({ holes: v === '9' ? 9 : 18 })}
              options={[
                { value: '18', label: '18 holes' },
                { value: '9', label: '9 holes' },
              ]}
            />
          </div>
          <div className="ch-tfx__row">
            <label className="ch-tfx__lbl" htmlFor={`${idPrefix}-kind`}>
              Event type
            </label>
            <div>
              <Select id={`${idPrefix}-kind`} value={s.eventKind} options={EVENT_KIND_OPTIONS} onChange={(eventKind) => set({ eventKind })} />
            </div>
          </div>
          <div className="ch-tfx__row">
            <label className="ch-tfx__lbl" htmlFor={`${idPrefix}-field`}>
              Teams in the field
            </label>
            <input
              id={`${idPrefix}-field`}
              className="ch-input ch-tfx__num"
              inputMode="numeric"
              placeholder="Not set"
              value={s.fieldSize ?? ''}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, '').slice(0, 2));
                set({ fieldSize: e.target.value.trim() === '' || !n ? null : Math.min(40, n) });
              }}
            />
          </div>
          <div className="ch-tfx__row">
            <label className="ch-tfx__lbl" htmlFor={`${idPrefix}-host`}>
              Host
            </label>
            <input id={`${idPrefix}-host`} className="ch-input" maxLength={120} placeholder="Host school or club" value={s.host} onChange={(e) => set({ host: e.target.value })} />
          </div>
          <div className="ch-tfx__row">
            <label className="ch-tfx__lbl" htmlFor={`${idPrefix}-results`}>
              Results link
            </label>
            <div>
              <input
                id={`${idPrefix}-results`}
                className="ch-input"
                inputMode="url"
                placeholder="Paste the results page link"
                value={s.resultsUrl}
                aria-invalid={!!err('resultsUrl')}
                onChange={(e) => set({ resultsUrl: e.target.value })}
              />
              {err('resultsUrl') && (
                <p className="ch-tfx__help is-error" data-ch-code={err('resultsUrl')!.code}>
                  {err('resultsUrl')!.text}
                </p>
              )}
            </div>
          </div>
        </m.div>
      )}

      <CoursePicker
        round={picking ? 1 : null}
        title={picking?.kind === 'round' ? `Course for R${s.rounds.findIndex((r) => r.id === picking.id) + 1}` : 'Course'}
        onClose={() => setPicking(null)}
        onPick={picked}
        onPickLoose={(_n, p) => pick(p)}
        writes={courseWrites}
        allowNoTee
        allowTyped
        recentFirst
      />
    </div>
  );
}

const NINE = Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
