'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { stepsReceipt, type AskStep } from '../../../../data/coachhelm-chat-thread';
import { haptic } from '../../../../lib/haptics';
import { Icon } from '../../../../ui/Icon';
import { ReadPicture } from '../../plan/ReadPicture';
import { nextReadChange, nextWaitingChange, readRowState, TURN_TIMING, waitingWords, type ReadRowState } from '../turn-timing';

export interface WorkRow {
  step: AskStep;
  /** `stopped`: the turn ended (Stop, a lost connection) while this read was still running. It never earned its check. */
  state: Exclude<ReadRowState, 'hidden'> | 'stopped';
  /** It was on screen as a running row before it finished: its check draws. One that arrives finished is drawn still. */
  watched: boolean;
}

export interface WorkModel {
  /** The assistant's first row may show (150 ms after the question; at once for a turn that is not being waited on). */
  present: boolean;
  rows: WorkRow[];
  /** The list hangs open under the name: before the first word, or because the coach opened it. */
  listOpen: boolean;
  /** Its rows are fading before it folds. */
  folding: boolean;
  /** What the work line says after the name, and whether it is a control. */
  line: { kind: 'none' } | { kind: 'words'; text: string } | { kind: 'running'; text: string } | { kind: 'summary'; text: string };
  /** The answer may paint (the fold, if there is one, has finished). */
  textReady: boolean;
  toggle: () => void;
  open: boolean;
}

/**
 * The work of one assistant turn as the coach is shown it (SPEC Moment 4): which read rows are on screen and in what state,
 * whether the list hangs open, what the work line says, and when the answer may start. Every rule here is a rule about time:
 * a row is held back 300 ms, a running row lives 400 ms, the words wait 1.2 s, and the list folds before the first word.
 *
 * `live`: this browser is watching the turn run. `sentAt`: when its question was sent (performance.now), for a live turn.
 * `started`: the server has opened the turn. `hasText`: the answer has begun. `waitingForCoach`: a card waits.
 */
export function useWork({ steps, live, sentAt, started, hasText, waitingForCoach, seconds, island = null }: { steps: AskStep[]; live: boolean; sentAt: number | null; started: boolean; hasText: boolean; waitingForCoach: boolean; seconds: number | null; /** The activity island is where this thread's work is shown: the list never hangs under the name, and while the island speaks for this turn the line is silent. */ island?: { showing: boolean } | null }): WorkModel {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  // When this browser first saw each read, and when it saw it finish. A turn that was not watched has neither: its rows are settled.
  const seen = useRef(new Map<string, { at: number; done: number | null; cut?: boolean }>());
  const watching = useRef(live);
  if (live) watching.current = true;
  const now = typeof performance === 'undefined' ? 0 : performance.now();
  for (const s of steps) {
    const finished = s.state === 'done' || s.state === 'failed';
    const known = seen.current.get(s.id);
    if (!known) seen.current.set(s.id, watching.current ? { at: now, done: finished ? now : null } : { at: -Infinity, done: -Infinity });
    else if (finished && known.done === null) known.done = now;
    // The turn ended with a row the server never closed (Stop, a lost connection): it is not running any more.
    else if (!live && known.done === null) {
      known.done = now;
      known.cut = true;
    }
  }

  const shown: WorkRow[] = [];
  let next: number | null = null;
  const sooner = (at: number | null) => {
    if (at !== null && (next === null || at < next)) next = at;
  };
  for (const s of steps) {
    const k = seen.current.get(s.id)!;
    const timed = readRowState(now, k.at, k.done, s.state === 'failed');
    const state = k.cut && timed !== 'hidden' ? 'stopped' : timed;
    sooner(nextReadChange(now, k.at, k.done));
    if (state !== 'hidden') shown.push({ step: s, state, watched: k.done !== null && k.done > k.at + TURN_TIMING.readHold });
  }

  // The list is the work line's open form: it opens by itself only while nothing is under it (no answer text yet).
  const [open, setOpen] = useState(false);
  const autoOpen = !island && live && !hasText && shown.length > 0;
  const wasAuto = useRef(false);
  const [folding, setFolding] = useState(false);
  const foldDone = useRef(false);
  if (autoOpen) wasAuto.current = true;
  useEffect(() => {
    if (!wasAuto.current || autoOpen || foldDone.current) return;
    // The first word arrived (or the turn ended) under an open list: its rows fade, then it folds into the line.
    foldDone.current = true;
    setFolding(true);
    const t = setTimeout(() => setFolding(false), TURN_TIMING.fold);
    return () => clearTimeout(t);
  }, [autoOpen]);
  const foldPending = wasAuto.current && !autoOpen && !foldDone.current;

  const elapsed = sentAt === null ? Infinity : now - sentAt;
  if (live && sentAt !== null) sooner(((): number | null => {
    const at = nextWaitingChange(elapsed);
    return at === null ? null : sentAt + at;
  })());
  useEffect(() => {
    if (next === null) return;
    const t = setTimeout(tick, Math.max(0, next - performance.now()) + 4);
    return () => clearTimeout(t);
  });

  const running = shown.filter((r) => r.state === 'running');
  let line: WorkModel['line'] = { kind: 'none' };
  if (live && !autoOpen && running.length > 0) line = { kind: 'running', text: running[running.length - 1]!.step.label };
  else if (live && shown.length === 0 && !hasText) {
    const words = waitingWords(elapsed, started);
    if (words) line = { kind: 'words', text: words };
  } else if (!live && waitingForCoach) line = { kind: 'words', text: 'Waiting for you' };
  if (line.kind === 'none' && !autoOpen && shown.length > 0) line = { kind: 'summary', text: stepsReceipt(steps, seconds) };
  // The island is saying it: one place speaks at a time. When the island leaves, the summary is here, and it is the way back.
  if (island?.showing) line = { kind: 'none' };

  return {
    present: !live || sentAt === null || elapsed >= TURN_TIMING.present || started,
    rows: shown,
    listOpen: autoOpen || folding || foldPending || (open && shown.length > 0),
    folding: folding || foldPending,
    line,
    textReady: !(folding || foldPending),
    open,
    toggle: () => {
      haptic('select');
      setOpen((v) => !v);
    },
  };
}

/** The live dot: the one sign that something is still happening (a running read, pending words, more below). */
export function LiveDot({ className }: { className?: string }) {
  return <i className={'ch-ak-live' + (className ? ` ${className}` : '')} aria-hidden="true" />;
}

/**
 * The work line: the words after the name on the turn's first row. The only place status is said, so status never adds or
 * removes a row and the answer's first line is always under the name. Folded, it is the button that opens the reads.
 */
export function WorkLine({ work, listId, handle }: { work: WorkModel; listId: string; /** The summary opens the activity island instead of a list under the name. */ handle?: { open: boolean; onOpen: () => void } }) {
  const { line } = work;
  // The words are announced when they change, politely; rows are not individually live.
  const say = line.kind === 'none' ? '' : line.text;
  if (line.kind === 'summary')
    return (
      <button type="button" className="ch-ak-wl is-sum" aria-expanded={handle ? handle.open : work.open} aria-controls={handle ? undefined : listId} onClick={handle ? handle.onOpen : work.toggle} data-ch-press="" data-ch-isl-handle={handle ? '' : undefined}>
        <span className="t ch-num">{line.text}</span>
        <Icon icon={ChevronDown} size={15} className="chev" />
      </button>
    );
  return (
    <span className={'ch-ak-wl' + (line.kind === 'running' ? ' is-run' : '')} role="status" aria-live="polite">
      {line.kind === 'running' && <LiveDot />}
      {say && (
        // Keyed by its words, so a change is a new line fading in, not letters swapping in place.
        <span key={say} className={'t' + (line.kind === 'running' ? ' shim' : '')}>
          {say}
        </span>
      )}
    </span>
  );
}

function Glyph({ state, watched }: { state: WorkRow['state']; watched: boolean }) {
  // An amber ring with a bar; red means under par and nothing else.
  if (state === 'failed')
    return (
      <span className="ic is-fail" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="9" cy="9" r="7" />
          <path d="M6 9h6" />
        </svg>
      </span>
    );
  if (state === 'running')
    return (
      <span className="ic" aria-hidden="true">
        <LiveDot />
      </span>
    );
  if (state === 'stopped')
    return (
      <span className="ic" aria-hidden="true">
        <i className="dash" />
      </span>
    );
  return (
    <span className={'ic ok' + (watched ? ' is-drawn' : '')} aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 7.5 5.6 10.5 11.5 3.8" pathLength="24" />
      </svg>
    </span>
  );
}

/** The reads, one row each, in the order they started: the kit's rows. Open only where nothing sits under them, or because the coach opened them. */
export function ReadList({ work, id, live }: { work: WorkModel; id: string; live: boolean }) {
  if (!work.listOpen) return null;
  return (
    <ol id={id} className={'ch-ak-reads' + (work.folding ? ' is-folding' : '') + (live ? ' is-live' : ' is-still')} aria-label="What CoachHelm read">
      {work.rows.map(({ step, state, watched }) => (
        <li key={step.id} className={'rd is-' + state} aria-current={state === 'running' ? 'step' : undefined}>
          <Glyph state={state} watched={watched} />
          <span className="tx">
            <span className={state === 'running' ? 'lb shim' : 'lb'}>{state === 'failed' ? couldNot(step.label) : state === 'done' ? pastOf(step.done ?? step.label) : step.label}</span>
            {state === 'done' && step.detail && <small>{step.detail}</small>}
            {state === 'done' && step.picture && <ReadPicture picture={step.picture} />}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A finished read is said in the past tense ("Read Jonah's strokes gained"): the kit's rows. The server sends one label for both states today. */
export function pastOf(label: string): string {
  const past: Record<string, string> = { reading: 'Read', checking: 'Checked', finding: 'Found', comparing: 'Compared', drawing: 'Drew', drafting: 'Drafted', building: 'Built', 'looking up': 'Looked up' };
  const m = /^(Reading|Checking|Finding|Comparing|Drawing|Drafting|Building|Looking up)\s+(.*)$/i.exec(label);
  return m ? `${past[m[1]!.toLowerCase()]} ${m[2]}` : label;
}

/** "Reading practice reviews" that failed reads "Couldn't read practice reviews": the server's own words, turned. */
export function couldNot(label: string): string {
  const m = /^(Reading|Checking|Finding|Comparing|Drawing|Drafting|Building|Looking up)\s+(.*)$/i.exec(label);
  if (!m) return `${label}: didn’t come back`;
  const verb: Record<string, string> = { reading: 'read', checking: 'check', finding: 'find', comparing: 'compare', drawing: 'draw', drafting: 'draft', building: 'build', 'looking up': 'look up' };
  return `Couldn’t ${verb[m[1]!.toLowerCase()]} ${m[2]}`;
}

export function useWorkListId(): string {
  return useId();
}
