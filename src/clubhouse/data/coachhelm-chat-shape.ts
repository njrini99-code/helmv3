import type { UIMessage } from 'ai';
import type { PulseItem } from '@/lib/coachhelm/v3/chat/program-pulse';

/**
 * Ask CoachHelm's frame data (Clubhouse P013, the Ask sub-tab): the shapes the loader
 * (data/coachhelm-chat.ts) fills and the screens, the preview and the tests share, and the pure
 * steps between them (the History grouping, the openers, the findings, the composer's seeds).
 *
 * Nothing here is computed from a model: the conversation list, the restored thread, the program
 * pulse and the roster are the ones the production Ask page reads (`loadChatTab`); this file only
 * re-shapes them. It imports types from program-pulse and nothing at run time, so client screens
 * can use it.
 */

export interface ChAskPlayer {
  id: string;
  name: string;
}

/** What a finding is about, as the word over its headline ("Putting" on the board's findings). */
const CATEGORY_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  ['signals', 'Signals'],
  ['coverage', 'Coverage'],
  ['movement', 'Scoring'],
  ['rsvp', 'Schedule'],
  ['prep', 'Schedule'],
  ['focus', 'Focus areas'],
  ['tasks', 'Tasks'],
];

export interface ChAskFinding {
  id: string;
  category: string;
  headline: string;
  evidence: string;
  tone: PulseItem['tone'];
  /** The question the finding makes worth asking. A finding without one is text, never a dead button. */
  ask: string | null;
  /** Where to look, only when that screen is rebuilt (nav.rebuiltHref). */
  link: { label: string; href: string } | null;
}

export function findingCategory(id: string): string {
  return CATEGORY_BY_PREFIX.find(([prefix]) => id.startsWith(prefix))?.[1] ?? 'Program';
}

/**
 * The pulse's items as findings: at most `limit`, each link kept only when `rebuilt` gives its screen back. The "N open signals across M
 * players" item is left out, as it is from the board's pulse: it counts every active row, which the board never draws (CH13-4).
 */
export function pulseToFindings(items: readonly PulseItem[], rebuilt: (href: string) => string | null, limit = 3): ChAskFinding[] {
  return items.filter((item) => item.id !== 'signals-open').slice(0, limit).map((item) => {
    const href = item.action ? rebuilt(item.action.href) : null;
    return {
      id: item.id,
      category: findingCategory(item.id),
      headline: item.headline,
      evidence: item.evidence,
      tone: item.tone,
      ask: item.ask?.trim() || null,
      link: item.action && href ? { label: item.action.label, href } : null,
    };
  });
}

/**
 * A question the new-chat page offers: a pill on desktop, a card on the phone.
 * `text` is what is sent; `title` and `sub` are the phone card's two lines.
 */
export interface ChAskSuggestion {
  id: 'brief' | 'strokes' | 'trending' | 'week';
  text: string;
  title: string;
  sub: (team: string) => string;
}

/** The players with a recent round it takes before "who is trending" is a team answer (the strokes opener's own rule). */
export const ASK_MIN_COVERED = 3;

/**
 * The openers, only those the data can answer. `openers` are the production generalOpeners (Brief
 * me, and Where is the team losing the most strokes? once enough players have a recent round);
 * trending up has the strokes opener's coverage rule; what is on this week is a schedule question
 * any roster can ask. Never advertises an answer the data cannot give.
 */
export function buildAskSuggestions(input: { openers: readonly string[]; recentCovered: number; rosterCount: number }): ChAskSuggestion[] {
  const out: ChAskSuggestion[] = [];
  const brief = input.openers.find((o) => /^brief me/i.test(o));
  const strokes = input.openers.find((o) => /losing the most strokes/i.test(o));
  if (brief) out.push({ id: 'brief', text: brief, title: 'Brief me', sub: (team) => `on ${team}` });
  if (strokes) out.push({ id: 'strokes', text: strokes, title: 'Losing strokes', sub: () => 'where the team loses most' });
  if (input.recentCovered >= ASK_MIN_COVERED) out.push({ id: 'trending', text: 'Who is trending up this month?', title: 'Trending up', sub: () => "who's improving this month" });
  if (input.rosterCount > 0) out.push({ id: 'week', text: "What's on this week?", title: 'This week', sub: () => "what's coming up" });
  return out.slice(0, 5);
}

export interface ChAskConversation {
  id: string;
  title: string;
  /** ISO instant of the last message. */
  updatedAt: string;
}

export function conversationTitle(title: string | null | undefined): string {
  return title?.trim() || 'Untitled chat';
}

export type ChAskGroupKey = 'today' | 'week' | 'earlier';

export interface ChAskGroup {
  key: ChAskGroupKey;
  label: string;
  items: ChAskConversation[];
}

const GROUP_LABEL: Record<ChAskGroupKey, string> = { today: 'Today', week: 'This week', earlier: 'Earlier' };

/** The calendar day of an instant in a zone, as `YYYY-MM-DD` (en-CA orders it that way). */
export function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

/**
 * The History list in the team's zone: the same calendar day is Today, the six days before it are
 * This week, anything older is Earlier. Each group keeps the list's order (newest first); a group
 * with nobody in it is left out. `nowIso` comes from the server so the server and the browser agree.
 */
export function groupConversations(list: readonly ChAskConversation[], nowIso: string, timeZone: string): ChAskGroup[] {
  const today = localDay(nowIso, timeZone);
  const groups: Record<ChAskGroupKey, ChAskConversation[]> = { today: [], week: [], earlier: [] };
  for (const c of list) {
    const age = daysBetween(localDay(c.updatedAt, timeZone), today);
    groups[age <= 0 ? 'today' : age < 7 ? 'week' : 'earlier'].push(c);
  }
  return (['today', 'week', 'earlier'] as const).filter((k) => groups[k].length > 0).map((key) => ({ key, label: GROUP_LABEL[key], items: groups[key] }));
}

/** Search chats: a case-insensitive substring of the title. A blank query is the whole list. */
export function filterConversations(list: readonly ChAskConversation[], query: string): ChAskConversation[] {
  const q = query.trim().toLowerCase();
  return q ? list.filter((c) => c.title.toLowerCase().includes(q)) : [...list];
}

/** What a chat is called until the server names it: the first question, one line, about 60 characters. */
export function titleFromQuestion(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > 60 ? `${one.slice(0, 57).trimEnd()}...` : one || 'New chat';
}

export interface ChAskPulse {
  findings: ChAskFinding[];
  /** "6 of 8 players have a round in the last 30 days. Answers cover those 6." */
  coverage: string | null;
  /** "as of 3:05 PM", formatted in the team's zone on the server. */
  asOfLabel: string | null;
}

export interface ChAskThread {
  id: string;
  title: string;
  messages: UIMessage[];
}

export interface ChAskData {
  teamName: string;
  timezone: string;
  /** The server's clock, so History groups the same on the server and in the browser. */
  nowIso: string;
  players: ChAskPlayer[];
  suggestions: ChAskSuggestion[];
  /** Null when the pulse did not load (the thread still works; the findings say so). */
  pulse: ChAskPulse | null;
  /** Players on the roster, and none of them has a recorded round. */
  noRounds: boolean;
  conversations: { list: ChAskConversation[]; error: boolean };
  /** The conversation `?c=` opened. */
  thread: ChAskThread | null;
  /** `?c=` names a conversation that is gone or not the coach's. */
  notFound: boolean;
  /** The conversation exists but its messages did not read (an existing chat is never empty). */
  threadFailed: boolean;
}

export type ChAskLoad =
  | { status: 'ready'; data: ChAskData }
  /** An active roster of nobody: the page empty, no chat. */
  | { status: 'noRoster'; teamName: string }
  /** The chat context did not load (no active team, a dropped read): nothing to ask against. */
  | { status: 'failed' };

/** Whether the roster has players and not one round between them. */
export function noRoundsFrom(pulse: { active_roster: number; players_without_rounds: number } | null): boolean {
  return !!pulse && pulse.active_roster > 0 && pulse.players_without_rounds >= pulse.active_roster;
}

/** The `+` menu's seven starters. Each seeds the composer and never sends. */
export interface ChAskStarter {
  id: 'add-player' | 'compare' | 'date-range' | 'practice' | 'focus' | 'task' | 'update';
  label: string;
  seed: string;
}

export const ASK_STARTERS: readonly ChAskStarter[] = [
  { id: 'add-player', label: 'Add player', seed: '' },
  { id: 'compare', label: 'Compare players', seed: 'Compare ' },
  { id: 'date-range', label: 'Add date range', seed: 'Over the last 30 days, ' },
  { id: 'practice', label: 'Create practice', seed: 'Create a recurring practice every ' },
  { id: 'focus', label: 'Create focus area', seed: 'Create a focus area for ' },
  { id: 'task', label: 'Assign task', seed: 'Assign a task to ' },
  { id: 'update', label: 'Draft team update', seed: 'Draft a team update about ' },
];

/** The date chip's choices and the sentence each adds to the question, visibly. */
export type ChAskRange = '7d' | '30d' | 'season';

export const ASK_RANGES: ReadonlyArray<{ id: ChAskRange; label: string; clause: string }> = [
  { id: '7d', label: 'Last 7 days', clause: 'Use the last 7 days.' },
  { id: '30d', label: 'Last 30 days', clause: 'Use the last 30 days.' },
  { id: 'season', label: 'This season', clause: 'Use this season.' },
];

/** The text that is sent: the question, then the chosen range's sentence, so the coach reads what the model was told. */
export function withRangeClause(text: string, range: ChAskRange | null): string {
  const t = text.trim();
  const clause = ASK_RANGES.find((r) => r.id === range)?.clause;
  return clause ? `${t} ${clause}` : t;
}

/** Puts `@Name ` where the `@fragment` being typed is (or at the end), so the mention is text the coach can read and edit. */
export function insertMention(value: string, name: string): string {
  const base = /@[\w'-]*$/.test(value) ? value.replace(/@[\w'-]*$/, '') : value + (value && !/\s$/.test(value) ? ' ' : '');
  return `${base}@${name} `;
}

/** The `@fragment` the coach is typing at the end of the text, or null. */
export function mentionQuery(value: string): string | null {
  const m = /(?:^|\s)@([\w'-]*)$/.exec(value);
  return m ? (m[1] ?? '') : null;
}

/** Roster names matching the query, none already mentioned, at most 8 (the production picker). */
export function matchPlayers(players: readonly ChAskPlayer[], query: string, mentioned: string): ChAskPlayer[] {
  const q = query.trim().toLowerCase();
  return players
    .filter((p) => !mentioned.includes(`@${p.name}`))
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .slice(0, 8);
}
