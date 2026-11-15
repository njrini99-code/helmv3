/**
 * The thresholds of a CoachHelm turn (docs/clubhouse/coachhelm-chat-v3/SPEC.md, Moment 4 and 5; MOTION.md "The grammar").
 *
 * These are not durations of a motion (those are tokens in tokens.css): they are how long the chat waits before it says
 * something, and how long a thing it has said stays. Two rules sit behind every number: nothing that will be gone in under
 * 300 ms is shown, and anything shown stays long enough to be read.
 */
export const TURN_TIMING = {
  /** The assistant's first row (mark and name) arrives this long after the question is sent: after the question, as a reply does. */
  present: 150,
  /** A read's row is held back this long. A read that finishes sooner never shows as running. */
  readHold: 300,
  /** Once a row has been shown running, it stays running at least this long (a check that would come sooner waits). */
  readLife: 400,
  /** Before this the wait has no words, only the turning mark. */
  words: 1200,
  /** The wait is long enough to explain. */
  slow: 6000,
  /** The wait is long enough to offer the way out. */
  stuck: 20000,
  /** The read list's rows fade for this long before the list folds into the work line; the answer's first words wait for it. */
  fold: 150,
  /** No new text for this long while the turn is live: the live dot sits after the last word. */
  pending: 400,
  /** One beat: how far a consequence trails its cause. */
  beat: 120,
  /** The coach is at the live edge when the thread is within this many pixels of its end. */
  edge: 24,
} as const;

/** One beat, by name, for the surfaces that share the thread's rhythm (quick chat). */
export const BEAT_MS = TURN_TIMING.beat;

/** What the work line says while nothing else can (SPEC Moment 4). `started`: the server has opened the turn. */
export function waitingWords(elapsed: number, started: boolean): string | null {
  if (elapsed < TURN_TIMING.words) return null;
  if (elapsed >= TURN_TIMING.stuck) return 'No answer yet. You can stop and ask again.';
  if (elapsed >= TURN_TIMING.slow) return started ? 'Still working on it. Long questions take a little longer.' : 'Still sending. This is taking longer than usual.';
  // Never a bare "Thinking" (owner, the live workspace): the wait says what is being done.
  return started ? 'Reading your question' : 'Sending';
}

/** The next instant, after `elapsed`, at which `waitingWords` changes; null when it will not change again. */
export function nextWaitingChange(elapsed: number): number | null {
  for (const at of [TURN_TIMING.present, TURN_TIMING.words, TURN_TIMING.slow, TURN_TIMING.stuck]) if (elapsed < at) return at;
  return null;
}

/** How one read's row is drawn at an instant, given when the browser first saw it and when it saw it finish. */
export type ReadRowState = 'hidden' | 'running' | 'done' | 'failed';
export function readRowState(now: number, seenAt: number, finishedAt: number | null, failed: boolean): ReadRowState {
  const visibleAt = seenAt + TURN_TIMING.readHold;
  if (now < visibleAt) return 'hidden';
  if (finishedAt === null) return 'running';
  // It finished before its row was due: it appears finished. Otherwise it was seen running, and stays so for its minimum life.
  const settleAt = finishedAt <= visibleAt ? visibleAt : Math.max(finishedAt, visibleAt + TURN_TIMING.readLife);
  if (now < settleAt) return 'running';
  return failed ? 'failed' : 'done';
}

/** The next instant after `now` at which that row's state changes; null when it is settled or waits on the server. */
export function nextReadChange(now: number, seenAt: number, finishedAt: number | null): number | null {
  const visibleAt = seenAt + TURN_TIMING.readHold;
  if (now < visibleAt) return visibleAt;
  if (finishedAt === null) return null;
  const settleAt = finishedAt <= visibleAt ? visibleAt : Math.max(finishedAt, visibleAt + TURN_TIMING.readLife);
  return now < settleAt ? settleAt : null;
}

/**
 * The part of a streaming answer that is safe to draw: half-written syntax is held back until it completes, so the coach
 * never sees a stray asterisk, an open bracket or half a read marker. An unclosed `**` is closed (bold in progress).
 */
export function settledText(text: string): string {
  let out = text;
  // A read marker or a link still being written: "[", "[e", "[e12".
  out = out.replace(/\[[a-z]?\d*$/i, '');
  // A table row with no closing pipe, a list marker with no text yet, a heading marker with no text yet.
  const lastBreak = out.lastIndexOf('\n');
  const line = out.slice(lastBreak + 1);
  if (/^\s*\|/.test(line) && !/\|\s*$/.test(line)) out = out.slice(0, lastBreak + 1);
  else if (/^\s*(?:[-*]|\d+[.)]|#{1,4})\s*$/.test(line)) out = out.slice(0, lastBreak + 1);
  // A lone trailing asterisk is the first half of "**".
  out = out.replace(/(^|[^*])\*$/, '$1');
  // Bold in progress: close it, so the words draw bold without their asterisks.
  const lastPara = out.slice(out.lastIndexOf('\n\n') + 1);
  if ((lastPara.match(/\*\*/g) ?? []).length % 2 === 1) out = /\*\*$/.test(out) ? out.slice(0, -2) : `${out}**`;
  return out.replace(/\s+$/, '');
}

/** The complete sentences of `text` past `from`: what a screen reader is told, a sentence at a time (never per word). */
export function sentencesSince(text: string, from: number): { say: string; upTo: number } | null {
  const rest = text.slice(from);
  const end = Math.max(rest.lastIndexOf('. '), rest.lastIndexOf('? '), rest.lastIndexOf('! '), rest.lastIndexOf('\n'));
  if (end < 0) return null;
  const say = rest.slice(0, end + 1).replace(/\*\*|\[[a-z]?\d+\]/gi, '').replace(/\s+/g, ' ').trim();
  return say ? { say, upTo: from + end + 1 } : null;
}
