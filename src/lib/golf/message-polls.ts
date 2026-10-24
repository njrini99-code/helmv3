/**
 * Polls in a thread (premium features P-2, handoff §4.34.2): the pure half.
 *
 * A poll is a `golf_messages` row with `kind = 'poll'` and its question and options in `payload`. Every vote is one
 * `golf_message_responses` row per person per message (unique on message_id + user_id), so a person's whole answer
 * lives in that row's `choice`: one option id, or for a poll that takes more than one answer, the ids joined by commas
 * in option order ("o1,o3"). `choice` holds 1 to 64 characters, and six two-character ids with commas is 17.
 *
 * Both tables, their RLS and their realtime publication are live in production (read 2026-10-24), so polls need no
 * migration. Nothing here talks to the database: the actions in app/golf/actions/message-polls.ts write a poll, and
 * hooks/golf/use-message-responses.ts reads and writes votes. Shared by the server and the Clubhouse thread.
 */

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
export const POLL_QUESTION_MAX = 140;
export const POLL_OPTION_MAX = 60;

export interface PollOption {
  /** "o1" to "o6", fixed when the poll is sent so a vote never points at the wrong label. */
  id: string;
  label: string;
}

export interface Poll {
  question: string;
  options: PollOption[];
  /** More than one answer per person. */
  multi: boolean;
  /** When voting ends on its own (ISO), or null for a poll that stays open until its sender closes it. */
  closesAt: string | null;
  /** When the sender closed it early (ISO), or null. */
  closedAt: string | null;
}

/** What `payload` holds for `kind = 'poll'`, as written by sendGolfPoll. Version 1. */
export interface PollPayload {
  v: 1;
  question: string;
  options: { id: string; label: string }[];
  multi: boolean;
  closes_at: string | null;
  closed_at: string | null;
}

const OPTION_ID = /^o[1-6]$/;

const clean = (s: unknown, max: number): string | null => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= max ? t : null;
};

const isoOrNull = (s: unknown): string | null => {
  if (typeof s !== 'string') return null;
  return Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null;
};

/**
 * A row's payload as a poll, or null when it isn't one we can draw honestly. A malformed payload falls back to the
 * row's plain `content` (the fallback text), never to a half-drawn card.
 */
export function parsePollPayload(payload: unknown): Poll | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.v !== 1) return null;
  const question = clean(p.question, POLL_QUESTION_MAX);
  if (!question || !Array.isArray(p.options)) return null;
  const seen = new Set<string>();
  const options: PollOption[] = [];
  for (const raw of p.options) {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const label = clean(o.label, POLL_OPTION_MAX);
    if (typeof o.id !== 'string' || !OPTION_ID.test(o.id) || seen.has(o.id) || !label) return null;
    seen.add(o.id);
    options.push({ id: o.id, label });
  }
  if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) return null;
  return {
    question,
    options,
    multi: p.multi === true,
    closesAt: isoOrNull(p.closes_at),
    closedAt: isoOrNull(p.closed_at),
  };
}

export interface PollDraft {
  question: string;
  options: string[];
  multi: boolean;
  closesAt: string | null;
}

export type PollDraftProblem = 'question' | 'options' | 'duplicate' | 'closes';

/**
 * The draft as a payload, or what's wrong with it. Empty option rows are dropped first (the sheet always keeps a
 * spare one), labels compare without case or extra spaces, and an end time must be in the future.
 */
export function buildPollPayload(
  draft: PollDraft,
  now: number = Date.now(),
): { ok: true; payload: PollPayload } | { ok: false; problem: PollDraftProblem } {
  const question = clean(draft.question, POLL_QUESTION_MAX);
  if (!question) return { ok: false, problem: 'question' };
  const labels = draft.options.map((o) => clean(o, POLL_OPTION_MAX)).filter((o): o is string => !!o);
  if (labels.length !== draft.options.filter((o) => o.trim()).length) return { ok: false, problem: 'options' };
  if (labels.length < POLL_MIN_OPTIONS || labels.length > POLL_MAX_OPTIONS) return { ok: false, problem: 'options' };
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) return { ok: false, problem: 'duplicate' };
  let closes: string | null = null;
  if (draft.closesAt) {
    const t = Date.parse(draft.closesAt);
    if (!Number.isFinite(t) || t <= now) return { ok: false, problem: 'closes' };
    closes = new Date(t).toISOString();
  }
  return {
    ok: true,
    payload: {
      v: 1,
      question,
      options: labels.map((label, i) => ({ id: `o${i + 1}`, label })),
      multi: draft.multi,
      closes_at: closes,
      closed_at: null,
    },
  };
}

/**
 * The row's `content`: what the bell, a push, the inbox preview, search and the older Fairway app show, since none of
 * them read `payload`. Plain text, no emoji (Clubhouse doctrine), the options numbered so a reader on an old app can
 * still answer in words.
 */
export function pollFallbackText(payload: Pick<PollPayload, 'question' | 'options'>): string {
  const lines = payload.options.map((o, i) => `${i + 1}. ${o.label}`);
  return [`Poll: ${payload.question}`, ...lines, 'Vote in GolfHelm.'].join('\n');
}

/** The text before the options, for the inbox row and search snippets: "Poll: Which van?". */
export const pollPreview = (poll: Pick<Poll, 'question'>) => `Poll: ${poll.question}`;

export function encodeChoice(poll: Poll, optionIds: readonly string[]): string | null {
  const picked = poll.options.filter((o) => optionIds.includes(o.id)).map((o) => o.id);
  if (!picked.length) return null;
  if (!poll.multi && picked.length > 1) return null;
  return picked.join(',');
}

export function decodeChoice(poll: Poll, choice: string): string[] {
  const ids = new Set(choice.split(','));
  const picked = poll.options.filter((o) => ids.has(o.id)).map((o) => o.id);
  return poll.multi ? picked : picked.slice(0, 1);
}

export interface PollResponseRow {
  message_id: string;
  user_id: string;
  choice: string;
  updated_at?: string | null;
}

export interface PollTally {
  /** Votes per option id, in option order. */
  counts: Record<string, number>;
  /** Who picked each option (auth user ids), for the faces and the voters card. */
  voters: Record<string, string[]>;
  /** People who answered at all. A multi-answer poll can have more votes than voters. */
  voterCount: number;
  /** The viewer's own picks. */
  mine: string[];
  /** The option ids with the most votes, when at least one vote is in. Ties share it. */
  leaders: string[];
}

export function tallyPoll(poll: Poll, rows: readonly PollResponseRow[], messageId: string, viewerId: string): PollTally {
  const counts: Record<string, number> = {};
  const voters: Record<string, string[]> = {};
  for (const o of poll.options) {
    counts[o.id] = 0;
    voters[o.id] = [];
  }
  const people = new Set<string>();
  let mine: string[] = [];
  for (const row of rows) {
    if (row.message_id !== messageId || people.has(row.user_id)) continue;
    const picked = decodeChoice(poll, row.choice);
    if (!picked.length) continue;
    people.add(row.user_id);
    for (const id of picked) {
      counts[id] = (counts[id] ?? 0) + 1;
      (voters[id] ??= []).push(row.user_id);
    }
    if (row.user_id === viewerId) mine = picked;
  }
  const top = Math.max(0, ...Object.values(counts));
  const leaders = top > 0 ? poll.options.filter((o) => counts[o.id] === top).map((o) => o.id) : [];
  return { counts, voters, voterCount: people.size, mine, leaders };
}

/** Closed by its sender, or past its end time. */
export function isPollClosed(poll: Poll, now: number): boolean {
  if (poll.closedAt) return true;
  return poll.closesAt ? Date.parse(poll.closesAt) <= now : false;
}

/**
 * The share of the bar an option fills: of the people who voted, not of the votes, so a multi-answer poll reads
 * "9 of 12 can make Tuesday" and its bars don't shrink as people pick more.
 */
export const pollShare = (tally: PollTally, optionId: string) =>
  tally.voterCount ? (tally.counts[optionId] ?? 0) / tally.voterCount : 0;

/** Members who could vote and haven't (the sender counts; anyone can vote on their own poll). */
export function pollWaiting(tally: PollTally, memberIds: readonly string[]): string[] {
  const voted = new Set(pollVoterIds(tally));
  return memberIds.filter((id) => !voted.has(id));
}

/** Everyone who answered, from the tally, without repeats. */
export function pollVoterIds(tally: PollTally): string[] {
  return [...new Set(Object.values(tally.voters).flat())];
}
