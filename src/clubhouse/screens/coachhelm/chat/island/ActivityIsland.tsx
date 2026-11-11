'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { Avatar } from '../../../../ui/Avatar';
import { Icon } from '../../../../ui/Icon';
import { elapsedWords, type IslandStep, type IslandStepState } from './model';
import type { Island } from './useIsland';

/** How long a finished ring keeps turning after it has closed: by then it is a full circle, its check is drawn, and the stop cannot be seen. */
const RING_REST_MS = 600;
/** The island's own exit, a quick fade (`--ch-dur-quick`). */
const LEAVE_MS = 180;
const FACES = 6;

/**
 * A step's mark. Waiting: a dim dot. Active: an open ring, turning. Done: the ring closes and the check draws inside it, in
 * the same place (the signature beat, MOTION MO-4-I5). Failed: the ring closes amber with a bar. Stopped: the ring stays open
 * and still. The ring keeps one animation for its whole life, so it never restarts or jumps when its state changes; it is
 * stopped only once it is a full circle. A mark that is first drawn finished is drawn still.
 */
function StepMark({ state }: { state: IslandStepState }) {
  const [resting, setResting] = useState(state !== 'active');
  useEffect(() => {
    if (state === 'active') {
      setResting(false);
      return;
    }
    const t = setTimeout(() => setResting(true), RING_REST_MS);
    return () => clearTimeout(t);
  }, [state]);
  if (state === 'waiting') return <span className="mk is-waiting" aria-hidden="true" />;
  return (
    <span className={`mk is-${state}` + (resting ? ' is-rest' : '')} aria-hidden="true">
      <svg viewBox="0 0 20 20" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle className="trk" cx="10" cy="10" r="8" />
        <circle className="arc" cx="10" cy="10" r="8" pathLength="100" />
        {state === 'done' && <path className="ck" d="M6.2 10.4 8.9 13 13.9 7.2" pathLength="24" />}
        {state === 'failed' && <path className="bar" d="M6.5 10h7" />}
      </svg>
    </span>
  );
}

/** The island's clock: the seconds the live turn has worked, ticking here so nothing above re-renders for it. */
function Clock({ since }: { since: number }) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <>{elapsedWords((performance.now() - since) / 1000)}</>;
}

function StepRow({ step, onOpen }: { step: IslandStep; onOpen?: (ref: string, label: string) => void }) {
  const faces = step.subjects.filter((s) => s.kind === 'player');
  const others = step.subjects.length - faces.length;
  const opens = Boolean(step.ref && onOpen);
  // The row is one element for its whole life (its mark must be the same mark when the ring closes); a finished step that
  // produced a read gains a button laid over it, so it is usable while the rest continues.
  return (
    <li className={`st is-${step.state}` + (step.child ? ' is-child' : '') + (opens ? ' can-open' : '')} aria-current={step.state === 'active' ? 'step' : undefined}>
      <span className="row">
        <StepMark state={step.state} />
        <span className="tx">
          <span className="lb">{step.label}</span>
          {/* A tally that grows changes in place, in tabular figures: it is not a new line each time. */}
          {step.detail && <span className="dt ch-num">{step.detail}</span>}
          {step.subjects.length > 0 && (
            <span className="subj" role="img" aria-label={`${step.subjects.length} ${faces.length === step.subjects.length ? (step.subjects.length === 1 ? 'player' : 'players') : 'found'} so far`}>
              {faces.slice(0, FACES).map((s) => (
                <span key={s.id} className="face" title={s.label}>
                  <Avatar name={s.label} id={s.id} size="xs" />
                </span>
              ))}
              {faces.length > FACES && <span className="more ch-num">+{faces.length - FACES}</span>}
              {faces.length === 0 &&
                step.subjects.slice(0, 3).map((s) => (
                  <span key={s.id} className="tag">
                    {s.label}
                  </span>
                ))}
              {faces.length === 0 && others > 3 && <span className="more ch-num">+{others - 3}</span>}
            </span>
          )}
        </span>
        {step.ms !== null && step.state === 'done' && <span className="ms ch-num">{elapsedWords(step.ms / 1000)}</span>}
        {opens && <Icon icon={ChevronRight} size={15} className="go" />}
      </span>
      {opens && <button type="button" className="op" data-ch-press="" aria-label={`${step.label}${step.detail ? `, ${step.detail}` : ''}. Open what it found`} onClick={() => onOpen!(step.ref!, step.label)} />}
    </li>
  );
}

/**
 * The activity island (chat v3, SPEC Moment 4): where CoachHelm's work is shown. One line in chrome that already exists above
 * the thread, so it covers nothing and nothing the coach is reading moves; tapped, or by itself for a big job while the page is
 * still empty, it opens over the thread into the live workspace: every step with its state, what it touched and what it found.
 *
 * Its two sizes are one shape: the plate is three slices (two caps and a middle that scales), moved by transform only, so the
 * change is a shape change on the compositor and never a height animation. The island's own box keeps its one-line height in
 * both sizes, so its host row never changes.
 */
export function ActivityIsland({ island, density = 'full', onOpenStep }: { island: Island; density?: 'full' | 'compact'; onOpenStep?: (messageId: string, ref: string, label: string) => void }) {
  const { model } = island;
  // Kept for its exit after the model has gone.
  const [shown, setShown] = useState(model);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (model) {
      setShown(model);
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const t = setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, LEAVE_MS);
    return () => clearTimeout(t);
  }, [model]);
  const m = model ?? shown;
  const present = m !== null;

  // It is first drawn as one line and opens from there, so an island that arrives open is seen to open.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!present) {
      setArmed(false);
      return;
    }
    const f = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(f);
  }, [present]);
  const open = island.open && armed && !leaving;

  // The full form's height, read when its content changes (never during a move): the plate's middle scales to it.
  const body = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = body.current;
    const host = root.current;
    if (!el || !host) return;
    const measure = () => host.style.setProperty('--ch-isl-h', String(el.offsetHeight));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [present, m?.turnId]);

  // Escape folds it; a press outside folds it. Focus stays where it was.
  const close = island.close;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      // The turn's own line is the island's other handle: it toggles, so it must not also close.
      if (root.current?.contains(t) || t?.closest?.('[data-ch-isl-handle]')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);

  // What a screen reader hears: a step finishing, in a few words. Never a tick, never every row, never a restored turn's history.
  const [said, setSaid] = useState('');
  const told = useRef(new Set<string>());
  useEffect(() => {
    if (!m) return;
    for (const s of m.steps) {
      if ((s.state !== 'done' && s.state !== 'failed') || told.current.has(s.id)) continue;
      told.current.add(s.id);
      if (m.live) setSaid(s.detail ? `${s.label}, ${s.detail}` : s.label);
    }
  }, [m]);

  const listId = useId();
  if (!m) return null;
  return (
    <div ref={root} className={'ch-isl' + (open ? ' is-open' : '') + (leaving ? ' is-leaving' : '') + (m.live ? ' is-live' : '') + (density === 'compact' ? ' is-compact' : '')} data-ch-code="CH-13860">
      <span className="sh" aria-hidden="true" />
      <span className="pl" aria-hidden="true">
        <i className="pt" />
        <i className="pm" />
        <i className="pb" />
      </span>
      <button type="button" className="hd" aria-expanded={open} aria-controls={listId} onClick={island.toggle} data-ch-press="">
        <StepMark state={m.live ? 'active' : m.stopped ? 'stopped' : m.settled ? 'done' : 'waiting'} />
        {/* Keyed by its words: a change of activity is a new line fading in, not letters swapping in place. */}
        <span key={m.head} className="t">
          {m.head}
          {m.more > 0 && <span className="mo"> and {m.more} more</span>}
        </span>
        {m.live && m.total > 0 && (
          <span className="n ch-num">
            {m.done} of {m.total}
            {island.since !== null && (
              <>
                {' · '}
                <Clock since={island.since} />
              </>
            )}
          </span>
        )}
        <Icon icon={ChevronDown} size={16} className="chev" />
      </button>
      <div className="bc">
        <div ref={body} id={listId} className="bd" inert={!open}>
          <ol className="steps" aria-label="What CoachHelm is doing">
            {m.steps.map((s) => (
              <StepRow key={s.id} step={s} onOpen={onOpenStep ? (ref, label) => onOpenStep(m.turnId, ref, label) : undefined} />
            ))}
          </ol>
        </div>
      </div>
      <span className="ch-sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
