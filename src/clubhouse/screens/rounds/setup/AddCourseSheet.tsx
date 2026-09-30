'use client';

import { useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Flag, Info } from 'lucide-react';
import type { ChTeeColor } from '../../../data/rounds-shape';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { Checkbox } from '../../../ui/Checkbox';
import { Modal } from '../../../ui/Modal';
import { HoleConfig } from './HoleConfig';
import { blankHoles, holeIssue, parOf, yardsOf, type ChSetupHole, type ChSetupPick } from './shape';

const STEPS = ['Course', 'Tee', 'Holes', 'Review'] as const;
const COLORS: Array<[ChTeeColor, string]> = [
  ['black', 'Black'],
  ['blue', 'Blue'],
  ['white', 'White'],
  ['gold', 'Gold'],
  ['red', 'Red'],
  ['green', 'Green'],
];

/** The course-name and tee-rating checks, in words (CH-11108), or null. */
export function addCourseIssue(step: number, f: { name: string; rating: string; slope: string; teeName: string }, holes: ChSetupHole[]): string | null {
  if (step === 0) return f.name.trim().length < 3 ? 'Enter the course’s name' : null;
  if (step === 1) {
    if (!f.teeName.trim()) return 'Name the tees you’re playing';
    const r = parseFloat(f.rating);
    if (f.rating.trim() && (!Number.isFinite(r) || r < 55 || r > 80)) return 'A course rating is between 55 and 80';
    const s = parseInt(f.slope, 10);
    if (f.slope.trim() && (!Number.isFinite(s) || s < 55 || s > 155)) return 'A slope is between 55 and 155';
    return null;
  }
  if (step === 2) return holes.map(holeIssue).find(Boolean) ?? null;
  return null;
}

/**
 * CH-11511: a course typed in by hand, for this round (board `AddCourse`, in
 * four steps: course, tee, holes, review). A player can't add library courses
 * (the library's add is coach-only), so this course is the round's own; with
 * "Save this course" (on by default) the round's start saves it and offers it
 * to the library, the legacy screen's opt-in (Q-72h).
 * The board's course photo is left out (Q-72a).
 */
export function AddCourseSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (pick: ChSetupPick, holes: ChSetupHole[], count: 9 | 18, saveCourse: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', city: '', state: '', teeName: '', color: null as ChTeeColor | null, rating: '', slope: '' });
  const [count, setCount] = useState<9 | 18>(18);
  const [save, setSave] = useState(true);
  const [holes, setHoles] = useState<ChSetupHole[]>(() => blankHoles(18));
  const issue = addCourseIssue(step, f, holes);
  const filled = holes.filter((h) => !holeIssue(h)).length;
  const place = [f.city.trim(), f.state.trim().toUpperCase()].filter(Boolean).join(', ') || null;
  const close = () => {
    setStep(0);
    onClose();
  };
  const done = () => {
    haptic('success');
    const r = parseFloat(f.rating);
    const s = parseInt(f.slope, 10);
    onDone(
      {
        courseId: null,
        courseName: f.name.trim(),
        place,
        teeId: null,
        teeName: f.teeName.trim(),
        teeColor: f.color,
        rating: Number.isFinite(r) ? r : null,
        slope: Number.isFinite(s) ? s : null,
        yards: yardsOf(holes),
      },
      holes,
      count,
      save,
    );
    setStep(0);
  };
  const setCountAndCard = (n: 9 | 18) => {
    setCount(n);
    setHoles((hs) => (n === 9 ? hs.slice(0, 9) : [...hs, ...blankHoles(18).slice(hs.length)]));
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={['Where are you playing?', 'Which tees?', 'Par and yardage', 'Check and use'][step]!}
      description={`Add a course · step ${step + 1} of 4`}
      width={640}
      code="CH-11511"
      footer={
        <>
          {step > 0 ? (
            <button type="button" className="ch-btn ch-btn--ghost" onClick={() => setStep(step - 1)}>
              <Icon icon={ChevronLeft} size={15} />
              <span>{STEPS[step - 1]}</span>
            </button>
          ) : (
            <button type="button" className="ch-btn ch-btn--ghost" onClick={close}>
              <span>Cancel</span>
            </button>
          )}
          <span className="ch-rs-grow ch-rs-foot-note" role="status" aria-live="polite" data-ch-code={issue ? 'CH-11108' : undefined}>
            {issue ?? ['Name and place', 'One tee set', `${filled} of ${count} holes`, 'Ready for this round'][step]}
          </span>
          <button type="button" className="ch-btn ch-btn--primary" disabled={!!issue} onClick={() => (step < 3 ? setStep(step + 1) : done())}>
            <span>{step < 3 ? `Next: ${STEPS[step + 1]}` : 'Use this course'}</span>
            <Icon icon={step < 3 ? ArrowRight : Check} size={15} />
          </button>
        </>
      }
    >
      <ol className="ch-rs-spine ch-rs-spine--sm" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''} aria-current={i === step ? 'step' : undefined}>
            <i aria-hidden="true" />
            <em>{s}</em>
          </li>
        ))}
      </ol>
      {step === 0 && (
        <div className="ch-rs-form">
          <label className="ch-rs-field">
            <span>Course name</span>
            <input className="ch-rs-in ch-rs-in--big" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Chapel Ridge Golf Club" autoComplete="off" />
          </label>
          <div className="ch-rs-2">
            <label className="ch-rs-field">
              <span>City</span>
              <input className="ch-rs-in" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} autoComplete="off" />
            </label>
            <label className="ch-rs-field">
              <span>State</span>
              <input className="ch-rs-in" value={f.state} maxLength={2} onChange={(e) => setF({ ...f, state: e.target.value })} autoComplete="off" />
            </label>
          </div>
          <div className="ch-rs-field">
            <span>Holes</span>
            <div className="ch-rs-seg" role="radiogroup" aria-label="Holes">
              {([18, 9] as const).map((n) => (
                <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCountAndCard(n)}>
                  {n} holes
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {step === 1 && (
        <div className="ch-rs-form">
          <div className="ch-rs-field">
            <span>Tee colour</span>
            <div className="ch-rs-sw" role="radiogroup" aria-label="Tee colour">
              {COLORS.map(([c, n]) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={f.color === c}
                  aria-label={n}
                  onClick={() => {
                    haptic('select');
                    setF({ ...f, color: c, teeName: f.teeName || n });
                  }}
                >
                  <i className={`ch-rd-tee ch-rd-tee--${c}`} />
                </button>
              ))}
            </div>
          </div>
          <label className="ch-rs-field">
            <span>Tee name</span>
            <input className="ch-rs-in" value={f.teeName} onChange={(e) => setF({ ...f, teeName: e.target.value })} placeholder="Blue" autoComplete="off" />
          </label>
          <div className="ch-rs-2">
            <label className="ch-rs-field">
              <span>Course rating (optional)</span>
              <input className="ch-rs-in" inputMode="decimal" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} placeholder="72.8" autoComplete="off" />
            </label>
            <label className="ch-rs-field">
              <span>Slope (optional)</span>
              <input className="ch-rs-in" inputMode="numeric" value={f.slope} onChange={(e) => setF({ ...f, slope: e.target.value })} placeholder="134" autoComplete="off" />
            </label>
          </div>
          <p className="ch-rs-note">
            <Icon icon={Info} size={14} />
            Rating and slope are on the scorecard, usually beside the tee name.
          </p>
        </div>
      )}
      {step === 2 && <HoleConfig holes={holes} baseline={null} count={count} nine="front" onHoles={setHoles} onNine={() => {}} />}
      {step === 3 && (
        <div className="ch-rs-rv">
          <div className="ch-rs-rv__hero">
            <span aria-hidden="true">
              <Icon icon={Flag} size={22} />
            </span>
            <div>
              <b>{f.name.trim()}</b>
              <span>{[place, `${count} holes`, `par ${parOf(holes)}`, `${yardsOf(holes).toLocaleString('en-US')} yds`].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
          <p className="ch-rs-rv__tee">
            <i className={f.color ? `ch-rd-tee ch-rd-tee--${f.color}` : 'ch-rd-tee'} aria-hidden="true" />
            <b>{f.teeName.trim()} tees</b>
            <span>{f.rating || f.slope ? `${f.rating || '—'} / ${f.slope || '—'}` : 'No rating or slope'}</span>
          </p>
          <Checkbox checked={save} onChange={setSave}>
            Save this course for next time, and offer it to the course library for your teammates
          </Checkbox>
        </div>
      )}
    </Modal>
  );
}
