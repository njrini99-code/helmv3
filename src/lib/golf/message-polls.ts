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

export type PollDraftProblem = 'question' | 'options' | 'duplicate' | 'closes' | 'closes_far';

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
    if (t > now + POLL_MAX_DAYS * 86_400_000) return { ok: false, problem: 'closes_far' };
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

/**
 * No poll timer waits longer than this: a 30-day end can't be one `setTimeout` (browsers cap the delay, and iOS pauses
 * timers in the background), so the card re-arms in chunks until the end and re-checks when the page is shown again.
 */
export const POLL_TIMER_CHUNK_MS = 6 * 60 * 60 * 1000;

/** How long the card waits before checking its end again: to the end (plus a beat), at most a chunk; null once ended. */
export function nextPollCheckDelay(closesAt: string | null, now: number): number | null {
  if (!closesAt) return null;
  const end = Date.parse(closesAt);
  if (!Number.isFinite(end) || end <= now) return null;
  return Math.min(end - now + 50, POLL_TIMER_CHUNK_MS);
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

/** The latest a poll can end: thirty days after it is sent. */
export const POLL_MAX_DAYS = 30;

/**
 * Who can be counted as able to vote: the people in the thread now, and anyone who voted and has since left. So the
 * footer never reads "9 of 8".
 */
export function pollEligibleCount(tally: PollTally, memberIds: readonly string[]): number {
  return new Set([...memberIds, ...pollVoterIds(tally)]).size;
}

/** Open, closed by its sender, or ended because its time ran out. */
export function pollState(poll: Poll, now: number): 'open' | 'closed' | 'ended' {
  if (poll.closedAt) return 'closed';
  return poll.closesAt && Date.parse(poll.closesAt) <= now ? 'ended' : 'open';
}

const FALLBACK_FOOTER = 'Vote in GolfHelm.';

/**
 * Whether a message's text is a poll's plain-text copy (`pollFallbackText`): "Poll: " on the first line, the numbered
 * choices, and exactly "Vote in GolfHelm." last, 4 to 8 lines. A typed message that merely starts "Poll: " is not one.
 */
export function isPollFallbackText(text: string | null | undefined): boolean {
  if (!text) return false;
  const lines = text.split('\n');
  if (lines.length < 2 + POLL_MIN_OPTIONS || lines.length > 2 + POLL_MAX_OPTIONS) return false;
  if (!lines[0]!.startsWith('Poll: ') || lines[lines.length - 1] !== FALLBACK_FOOTER) return false;
  return lines.slice(1, -1).every((l, i) => l.startsWith(`${i + 1}. `));
}

/** A poll's copy as one search line: "Poll: Which van? · Van A, Van B, Van C", more than three ending "and 2 more". */
export function pollSearchSnippet(text: string): string {
  const lines = text.split('\n');
  const question = lines[0]!.slice('Poll: '.length);
  const choices = lines.slice(1, -1).map((l) => l.replace(/^\d+\.\s/, ''));
  const shown = choices.slice(0, 3).join(', ');
  const more = choices.length > 3 ? ` and ${choices.length - 3} more` : '';
  return `Poll: ${question} · ${shown}${more}`;
}

/** A search hit on a poll's copy that matched only its footer ("vote", "golfhelm") is no hit at all. */
export function pollHitOnlyInFooter(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const body = text.split('\n').slice(0, -1).join('\n').toLowerCase();
  return !body.includes(q);
}


/** Quick start (P-2 4.4.2): static polls that fill the form, shown only while it is empty. No reads, no model calls. */
export const POLL_SUGGESTIONS: ReadonlyArray<{
  chip: string;
  question: string;
  options: readonly string[];
  /** Placeholders for choices left empty ("Pick a time"). */
  placeholders?: readonly string[];
  multi: boolean;
  ends: 'none' | '1d';
}> = [
  { chip: 'Which van?', question: 'Which van are you riding in?', options: ['Van 1', 'Van 2'], multi: false, ends: 'none' },
  { chip: 'Can you make it?', question: 'Can you make it?', options: ['Yes', 'No'], multi: false, ends: 'none' },
  { chip: 'Which days work?', question: 'Which days work?', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], multi: true, ends: 'none' },
  { chip: 'Pick a time', question: 'Which time works?', options: ['', ''], placeholders: ['First time', 'Second time'], multi: false, ends: '1d' },
];

/** The wall clock of an instant in a time zone, as numbers. */
function wallOf(t: number, zone: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(t));
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { y: n('year'), mo: n('month'), d: n('day'), h: n('hour') % 24, mi: n('minute') };
}

/** How far a zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(t: number, zone: string): number {
  const w = wallOf(t, zone);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - Math.floor(t / 60_000) * 60_000;
}

/**
 * A date and time on the team's wall clock (`golf_team_settings.timezone`), as an instant. A time skipped by a spring-
 * forward change moves forward by the gap (2:30 AM becomes 3:30 AM) and says so (`shifted`); a time a fall-back change
 * repeats takes the first. Null for a date or time that doesn't parse.
 */
export function zonedWallTimeToInstant(date: string, time: string, zone: string): { at: string; shifted: boolean } | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Date.UTC rolls a 13th month or a 31 June over: a date that doesn't come back unchanged isn't a date.
  if (!Number.isFinite(wall) || h > 23 || mi > 59 || new Date(wall).toISOString().slice(0, 10) !== date) return null;
  const before = offsetAt(wall - 86_400_000, zone);
  const after = offsetAt(wall + 86_400_000, zone);
  const same = (t: number) => {
    const w = wallOf(t, zone);
    return w.y === y && w.mo === mo && w.d === d && w.h === h && w.mi === mi;
  };
  const hits = [...new Set([wall - before, wall - after])].filter(same).sort((a, b) => a - b);
  if (hits.length) return { at: new Date(hits[0]!).toISOString(), shifted: false };
  // The wall time doesn't exist (a spring-forward gap): read it on the clock from before the change, which lands past it.
  return { at: new Date(wall - before).toISOString(), shifted: true };
}

/** The Custom end's default, on the team's clock: today at 9:00 PM before 8:00 PM, else tomorrow at 9:00 PM. */
export function defaultCustomEnd(now: number, zone: string): { date: string; time: string } {
  const w = wallOf(now, zone);
  const day = new Date(Date.UTC(w.y, w.mo - 1, w.d + (w.h < 20 ? 0 : 1)));
  return { date: day.toISOString().slice(0, 10), time: '21:00' };
}

/** "Ava", "Ava and Ben", "Ava, Ben and Jordan". */
const listWords = (names: readonly string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * Remind (P-2 4.6): the reply a coach can edit and send to the ones who haven't voted, by first name (the caller turns
 * two people with the same first name into "Sam C."); seven or more by count. `endsPhrase` is "today at 6:00 PM".
 * Prefilled only: the coach presses Send.
 */
export function pollRemindDraft(input: { firstNames: readonly string[]; endsPhrase: string | null }): string {
  const n = input.firstNames.length;
  const ask = n >= 7 ? `${n} of you haven’t voted yet. Can you vote in the poll when you get a chance?` : `${listWords(input.firstNames)}, can you vote in the poll when you get a chance?`;
  return input.endsPhrase ? `${ask} It ends ${input.endsPhrase}.` : ask;
}

/**
 * Share result (P-2 4.7): the final result as the sender's or the coach's own words, counts out of the people who voted
 * ("of the 8 who voted"). The top three choices with votes, then "Others had fewer."
 */
export function pollResultDraft(poll: Poll, tally: PollTally): string {
  const voted = tally.voterCount;
  const ranked = poll.options
    .map((o, i) => ({ label: o.label, n: tally.counts[o.id] ?? 0, i }))
    .filter((o) => o.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i);
  if (!ranked.length) return 'No one voted in the poll.';
  const more = ranked.length > 3 ? ' Others had fewer.' : '';
  const top = ranked.slice(0, 3);
  if (poll.multi) {
    const [first, ...rest] = top;
    return `${first!.label} works for ${first!.n} of the ${voted} who voted.${rest.map((o) => ` ${o.label} for ${o.n}.`).join('')}${more}`;
  }
  const tied = ranked.filter((o) => o.n === ranked[0]!.n);
  if (tied.length > 1) return `It’s a tie: ${listWords(tied.map((o) => o.label))} have ${tied[0]!.n} each.${ranked.length > tied.length ? ' Others had fewer.' : ''}`;
  const [lead, ...rest] = top;
  return `${lead!.label} has it with ${lead!.n} of the ${voted} who voted.${rest.map((o) => ` ${o.label} had ${o.n}.`).join('')}${more}`;
}

/**
 * The push and Bell end phrase, free of any time zone (P-2 4.9): "in 1 hour", "in 5 hours", "in 1 day", "in 3 days".
 * Under an hour reads "in under an hour"; null with no end or once ended.
 */
export function pollEndsPhraseServer(closesAt: string | null, now: number): string | null {
  if (!closesAt) return null;
  const left = Date.parse(closesAt) - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  const hours = Math.round(left / 3_600_000);
  if (hours < 1) return 'in under an hour';
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(left / 86_400_000);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}
