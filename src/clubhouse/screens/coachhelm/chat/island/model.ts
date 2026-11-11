import type { AskAssistantTurn, AskStep, AskStepSubject } from '../../../../data/coachhelm-chat-thread';
import { pastOf, couldNot } from '../parts/Work';

/**
 * The activity island's model (chat v3, SPEC Moment 4): what CoachHelm is doing, as steps, each caused by a real event from
 * the engine. Pure: the same turn gives the same island, which is what lets the harness prove that tool events, and nothing
 * else, drive it. Nothing here reads a clock except the two thresholds the caller passes in.
 */
export type IslandStepState = 'waiting' | 'active' | 'done' | 'failed' | 'stopped';

export interface IslandStep {
  id: string;
  /** Nested under a parent (a read the model's code called). */
  child: boolean;
  state: IslandStepState;
  /** In the state's own tense: "Reading…", "Read…", "Couldn't read…". */
  label: string;
  /** What it found ("38 rounds"), a running tally ("12 rounds and counting"), or what a calculation covered. */
  detail: string | null;
  subjects: AskStepSubject[];
  /** The read it produced: the row opens it. */
  ref: string | null;
  /** How long it took, when the server said. */
  ms: number | null;
}

export interface IslandModel {
  turnId: string;
  live: boolean;
  steps: IslandStep[];
  done: number;
  total: number;
  /** What it is doing right now, in the app's words. Never a bare "Thinking". */
  head: string;
  /** How many other steps are running beside the one the head names ("and 2 more"). */
  more: number;
  /** The head is a finished state (done or stopped), not an activity. */
  settled: boolean;
  /** It finished by being stopped or by failing: the head's ring does not close. */
  stopped: boolean;
  /** The work is the kind that opens the island by itself (three or more steps, or a calculation), while nothing is under it. */
  wide: boolean;
}

/** "12 rounds and counting": the sample in words, never notation. */
export function tally(count: NonNullable<AskStep['count']>): string {
  const unit = count.n === 1 ? count.unit.replace(/s$/, '') : count.unit;
  return `${count.n.toLocaleString('en-US')} ${unit}${count.more ? ' and counting' : ''}`;
}

function stateOf(step: AskStep, live: boolean, stated: boolean): IslandStepState {
  if (step.state === 'failed') return 'failed';
  if (step.state === 'next') return 'waiting';
  if (step.state === 'done') return 'done';
  // Started and not finished (the engine's `read_started` carries no state): running while the turn is live. Once it is not,
  // the step was cut short, unless the turn is from before steps recorded how they ended (none of its steps has a state).
  if (live) return 'active';
  return stated || step.state === 'active' ? 'stopped' : 'done';
}

export function islandSteps(steps: readonly AskStep[], live: boolean): IslandStep[] {
  const stated = steps.some((s) => s.state === 'done' || s.state === 'failed');
  return steps.map((s) => {
    const state = stateOf(s, live, stated);
    const label = state === 'failed' ? couldNot(s.label) : state === 'done' ? pastOf(s.done ?? s.label) : s.label;
    const covered = s.covers ? `${s.covers.n} of ${s.covers.of} ${s.covers.unit}` : null;
    const detail = state === 'done' ? (s.detail ?? covered ?? (s.count ? tally({ ...s.count, more: false }) : null)) : state === 'active' && s.count ? tally(s.count) : state === 'failed' ? (s.detail ?? null) : null;
    const ms = s.startedAt && s.endedAt ? Math.max(0, Date.parse(s.endedAt) - Date.parse(s.startedAt)) : null;
    return { id: s.id, child: Boolean(s.parentId), state, label, detail, subjects: s.subjects ?? [], ref: state === 'done' ? (s.ref ?? null) : null, ms };
  });
}

/** "6s", "1m 12s". */
export function elapsedWords(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function islandModel(turn: AskAssistantTurn, o: { live: boolean; hasText: boolean; waitingForCoach: boolean; seconds: number | null; ended: boolean }): IslandModel {
  const steps = islandSteps(turn.steps, o.live);
  const total = steps.length;
  const done = steps.filter((s) => s.state === 'done').length;
  // What is running, said by its leaves: a calculation whose own read is running is named by that read.
  const parents = new Set(turn.steps.flatMap((s) => (s.parentId ? [s.parentId] : [])));
  const running = steps.filter((s) => s.state === 'active');
  const leaves = running.filter((s) => !parents.has(s.id) || !running.some((r) => r.child));
  const active = leaves.length > 0 ? leaves : running;
  const count = `${total} ${total === 1 ? 'step' : 'steps'}`;
  let head: string;
  let settled = false;
  let more = 0;
  if (o.live && active.length > 0) {
    // The earliest step still running leads, so the head moves down the list as steps finish and never jumps back up.
    head = active[0]!.label;
    more = active.length - 1;
  } else if (o.live && o.hasText) head = 'Writing the answer';
  else if (o.live) head = total === 0 ? 'Reading your question' : 'Putting it together';
  else if (o.waitingForCoach) head = 'Waiting for you';
  else if (o.ended) {
    head = `Stopped · ${done} of ${count}`;
    settled = true;
  } else {
    head = o.seconds === null ? `Done · ${count}` : `Done · ${count} · ${elapsedWords(o.seconds)}`;
    settled = true;
  }
  return { turnId: turn.id, live: o.live, steps, done, total, head, more, settled, stopped: settled && o.ended, wide: total >= 3 || turn.steps.some((s) => s.kind === 'calculate') };
}

/** The island appears for real work only: two or more steps, or one step still running after `soloMs`. A single quick read is said on the turn's own line. */
export const ISLAND_SOLO_MS = 600;
/** Once the work has finished, the summary stays this long, then gets out of the way (the turn's own line is the way back). */
export const ISLAND_REST_MS = 6000;
