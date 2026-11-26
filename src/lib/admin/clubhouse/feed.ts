/**
 * The Reliability space's error feed (B19; plan docs/superpowers/specs/helm-bridge/2026-11-26-bridge-spaces-build.md):
 * every failure a person saw, who it happened to (coach, player or signed out), where, on which button, and how it is
 * counted. Pure: rows in, view models out. The reads are in feed-server.ts.
 *
 * Where the numbers come from:
 * - A failure is a `clubhouse_session_events` row with kind `crash` or outcome `failure` (isFailureRow). Every failure is
 *   kept there: ingest stores a session's whole timeline once it has one. `admin_events` is capped at
 *   MAX_ADMIN_ROWS_PER_BATCH rows a batch, so nothing here counts from it.
 * - Role, platform, release, team and user come from the event's session (`clubhouse_sessions`, joined by session_id):
 *   the session row keeps its newest values.
 * - People are distinct user ids (a set), so a person who hits a code three times is one person, on their 3rd time.
 *
 * Players may be minors: nothing here carries a name. Items keep the user id only to count people and ordinals; the
 * screens never print it.
 */
import type { BridgeGraph, GraphAction, GraphControl, PageId } from './graph';
import { hourOf } from './ingest';
import { isFailureRow, PLATFORM_WORDS, type SessionEventRow, type SessionRow } from './live-model';
import type { LivePlatform } from './live-scope';
import type { BridgeNoteRow, NotesIndex } from './notes';
import { describeServerCode } from '@/lib/admin/server-codes';
import { explainFailure, failureHeadline, type Explanation } from './explain';

// ---------------------------------------------------------------------------
// Scope: window, role, device, page, server code, the selected event and its tab (all in the URL)
// ---------------------------------------------------------------------------

export const FEED_WINDOWS = ['today', '24h', '7d'] as const;
export type FeedWindow = (typeof FEED_WINDOWS)[number];
export const FEED_ROLES = ['all', 'coach', 'player', 'signed-out'] as const;
export type FeedRoleFilter = (typeof FEED_ROLES)[number];
export type FeedRole = 'coach' | 'player' | 'signed-out';
export const FEED_DEVICES = ['all', 'ios-app', 'ios-safari', 'desktop', 'other'] as const satisfies readonly LivePlatform[];
export type FeedDevice = (typeof FEED_DEVICES)[number];
export const DETAIL_TABS = ['where', 'trail', 'counts', 'server'] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

export const DETAIL_TAB_LABEL: Readonly<Record<DetailTab, string>> = {
  where: 'Where',
  trail: 'What they did',
  counts: 'How it counts',
  server: 'Server',
};

export const WINDOW_LABEL: Readonly<Record<FeedWindow, string>> = { today: 'Today', '24h': 'Last 24 hours', '7d': 'Last 7 days' };

export interface EventKey {
  sessionId: string;
  seq: number;
}

export interface FeedScope {
  w: FeedWindow;
  role: FeedRoleFilter;
  pf: FeedDevice;
  page: string | null;
  /** A server code (42501, PGRST116): only failures that carried it. */
  sc: string | null;
  e: EventKey | null;
  tab: DetailTab;
}

export const DEFAULT_FEED: FeedScope = { w: 'today', role: 'all', pf: 'all', page: null, sc: null, e: null, tab: 'where' };

type Params = Record<string, string | string[] | undefined>;
const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw);
const pick = <T extends string>(list: readonly T[], raw: string | undefined, fallback: T): T => ((list as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback);

const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const SERVER_CODE = /^[A-Z0-9]{3,10}$/;

/** `<sessionId>:<seq>`. Split on the last colon; anything malformed is no selection, never an error. */
export function parseEventKey(raw: string | undefined | null): EventKey | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(':');
  if (i <= 0) return null;
  const sessionId = raw.slice(0, i);
  const seqText = raw.slice(i + 1);
  if (!SESSION_ID.test(sessionId) || !/^\d{1,9}$/.test(seqText)) return null;
  return { sessionId, seq: Number(seqText) };
}

export function eventKey(k: EventKey): string {
  return `${k.sessionId}:${k.seq}`;
}

/** An unknown value falls back to the default: a stale link opens today's feed. */
export function parseFeedScope(sp: Params | undefined): FeedScope {
  const page = first(sp?.page);
  const sc = first(sp?.sc)?.toUpperCase();
  return {
    w: pick(FEED_WINDOWS, first(sp?.w), DEFAULT_FEED.w),
    role: pick(FEED_ROLES, first(sp?.role), DEFAULT_FEED.role),
    pf: pick(FEED_DEVICES, first(sp?.pf), DEFAULT_FEED.pf),
    page: page && /^P\d{3}$/.test(page) ? page : null,
    sc: sc && SERVER_CODE.test(sc) ? sc : null,
    e: parseEventKey(first(sp?.e)),
    tab: pick(DETAIL_TABS, first(sp?.tab), DEFAULT_FEED.tab),
  };
}

export const FEED_PATH = '/admin/spaces/reliability';

/** A feed link that keeps the scope; defaults add nothing to the URL. `patch` replaces fields (null clears one). */
export function feedHref(scope: FeedScope, patch: Partial<FeedScope> = {}, hash?: string): string {
  const s = { ...scope, ...patch };
  const q = new URLSearchParams();
  if (s.w !== DEFAULT_FEED.w) q.set('w', s.w);
  if (s.role !== DEFAULT_FEED.role) q.set('role', s.role);
  if (s.pf !== DEFAULT_FEED.pf) q.set('pf', s.pf);
  if (s.page) q.set('page', s.page);
  if (s.sc) q.set('sc', s.sc);
  if (s.e) q.set('e', eventKey(s.e));
  if (s.e && s.tab !== DEFAULT_FEED.tab) q.set('tab', s.tab);
  const qs = q.toString();
  return `${FEED_PATH}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Where the window starts. Today starts at 00:00 UTC, as the admin's Activity tab counts a day. */
export function windowStart(w: FeedWindow, now: number): number {
  if (w === 'today') return Math.floor(now / DAY_MS) * DAY_MS;
  return now - (w === '24h' ? DAY_MS : 7 * DAY_MS);
}

/** The window in words, for headlines and sentences: "today (since 00:00 UTC)". */
export function windowWords(w: FeedWindow): string {
  return w === 'today' ? 'today (since 00:00 UTC)' : w === '24h' ? 'in the last 24 hours' : 'in the last 7 days';
}

/** "today", "in 24 hours", "in 7 days": the tail of "3rd today". */
export function windowTail(w: FeedWindow): string {
  return w === 'today' ? 'today' : w === '24h' ? 'in 24 h' : 'in 7 days';
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

// ---------------------------------------------------------------------------
// One feed item per failure
// ---------------------------------------------------------------------------

/** Expected and Watching come from the owner's notes (bridge_notes); New from the hourly store. */
export type FeedState = 'expected' | 'watching' | 'new' | null;

export const STATE_WORDS: Readonly<Record<Exclude<FeedState, null>, string>> = {
  expected: 'Expected',
  watching: 'Watching',
  new: 'New in this release',
};

export interface FeedItem {
  key: string;
  sessionId: string;
  seq: number;
  at: string;
  kind: string;
  outcome: string | null;
  /** The code the event carried (null when it carried none). */
  code: string | null;
  /** The Bridge ID it resolved to: the event's own, else the code's from the graph. */
  bridgeId: number | null;
  /** The code the error log and the notes key on: the Bridge row's CH code, else its Bridge ID, else the event's code. */
  catalogCode: string | null;
  /** The exact words the person saw (the catalog row's "they see"), else the row's meaning, else null. */
  theySee: string | null;
  meaning: string | null;
  page: string;
  pageName: string;
  control: string | null;
  controlLabel: string | null;
  action: string | null;
  actionLabel: string | null;
  act: string | null;
  /** Null when the session row could not be found: the role is then not guessed. */
  role: FeedRole | null;
  /** Used to count people and ordinals only; never printed. */
  userId: string | null;
  teamId: string | null;
  teamName: string | null;
  platform: string | null;
  release: string | null;
  serverCode: string | null;
  message: string | null;
  durationMs: number | null;
  trail: string[] | null;
  drift: string[];
  state: FeedState;
  /** This person's (or, signed out, this session's) Nth hit of this code in the window. */
  nth: number;
}

function normRole(role: string | null | undefined): FeedRole | null {
  return role === 'coach' || role === 'player' || role === 'signed-out' ? role : null;
}

export function catalogCodeOf(graph: Pick<BridgeGraph, 'ids'>, bridgeId: number | null, code: string | null): string | null {
  if (bridgeId !== null) return graph.ids[String(bridgeId)]?.ch ?? String(bridgeId);
  return code;
}

/** The words a person saw for a code: catalog "they see", else meaning, else null. */
export function toastFor(graph: Pick<BridgeGraph, 'ids'>, bridgeId: number | null): { theySee: string | null; meaning: string | null } {
  const id = bridgeId === null ? undefined : graph.ids[String(bridgeId)];
  return { theySee: id?.catalogRow?.theySee?.trim() || null, meaning: id?.meaning ?? null };
}

/** The headline a row shows: what they saw, else what it means, else the bare code. */
/**
 * One readable line for a failure: the message the person read (quoted in the catalog), else the row's meaning in plain
 * words, else the kind. The catalog's prose is cleaned in explain.ts; `itemHeadlineQuoted` says whether it is their words.
 */
export function itemHeadline(i: Pick<FeedItem, 'theySee' | 'meaning' | 'code' | 'kind'>): string {
  return failureHeadline(i).text;
}

/** A code's headline without an event (a list of codes): CH code or Bridge ID through the map; null when unmapped. */
export function codeHeadline(graph: Pick<BridgeGraph, 'ids' | 'chIndex'>, code: string): { text: string; quoted: boolean } | null {
  const id = graph.chIndex[code] ?? (/^\d+$/.test(code) ? Number(code) : null);
  const row = id !== null && id !== undefined ? graph.ids[String(id)] : undefined;
  if (!row) return null;
  return failureHeadline({ theySee: row.catalogRow?.theySee ?? null, meaning: row.meaning, code, kind: 'failure' });
}

/** True when the headline is the exact words the person read (show it in quotes); false for a description. */
export function itemHeadlineQuoted(i: Pick<FeedItem, 'theySee' | 'meaning' | 'code' | 'kind'>): boolean {
  return failureHeadline(i).quoted;
}

/** Why this failure most likely happened and what to check (server code, else message, else kind). */
export function itemExplanation(i: Pick<FeedItem, 'kind' | 'outcome' | 'serverCode' | 'message'>): Explanation {
  return explainFailure({ kind: i.kind, outcome: i.outcome, serverCode: i.serverCode, message: i.message });
}

export function controlName(control: GraphControl | undefined): string | null {
  if (!control) return null;
  return control.label ?? control.labelTemplate ?? null;
}

/** The release a feed calls "this release": the stamped one, else the newest a session reported. */
export function currentRelease(stamped: string, sessions: readonly Pick<SessionRow, 'release' | 'last_at'>[]): string | null {
  if (stamped && stamped !== 'main') return stamped;
  const newest = [...sessions].filter((s) => s.release && s.release !== 'other').sort((a, b) => b.last_at.localeCompare(a.last_at))[0];
  return newest?.release ?? null;
}

/**
 * Codes new in `release`: they have failure rows in it and in no other release in the rows given (the hourly store over
 * the week before, as R-02 reads it). Unknown codes never count as new.
 */
export function newCodes(rows: ReadonlyArray<{ code: string; release: string }>, release: string | null): Set<string> {
  if (!release) return new Set();
  const inRelease = new Set<string>();
  const elsewhere = new Set<string>();
  for (const r of rows) {
    if (!r.code || r.code === 'unknown') continue;
    (r.release === release ? inRelease : elsewhere).add(r.code);
  }
  return new Set([...inRelease].filter((c) => !elsewhere.has(c)));
}

/** One state per item. Precedence: Expected (the owner said so), then Watching, then New in this release. */
export function itemState(
  catalogCode: string | null,
  notes: Pick<NotesIndex, 'expected' | 'watched'>,
  fresh: ReadonlySet<string>,
  sessionRelease: string | null,
  release: string | null,
  hourlyCode: string | null = catalogCode,
): FeedState {
  if (!catalogCode) return null;
  if (notes.expected.has(catalogCode)) return 'expected';
  if (notes.watched.has(catalogCode)) return 'watching';
  if (release && sessionRelease === release && hourlyCode && fresh.has(hourlyCode)) return 'new';
  return null;
}

/**
 * The code a failure is counted under in `clubhouse_signal_hourly` (ingest.ts `codeFor`): the code the event sent,
 * else the resolved row's CH code or Bridge ID. The notes key on `catalogCode`; release history keys on this.
 */
export function hourlyCodeOf(i: Pick<FeedItem, 'code' | 'catalogCode'>): string | null {
  return i.code ?? i.catalogCode;
}

/** Who counts as "the same person" for an ordinal: the user, else (signed out) the session. */
export function personKey(i: Pick<FeedItem, 'userId' | 'sessionId'>): string {
  return i.userId ? `u:${i.userId}` : `s:${i.sessionId}`;
}

export interface BuildFeedInput {
  graph: BridgeGraph;
  /** Failure events (any order); non-failures are dropped. */
  events: readonly SessionEventRow[];
  sessions: readonly SessionRow[];
  teamNames: ReadonlyMap<string, string>;
  notes: Pick<NotesIndex, 'expected' | 'watched'>;
  /** Codes new in `release` (newCodes). */
  fresh: ReadonlySet<string>;
  release: string | null;
}

/** Every failure as a feed item, newest first. */
export function buildFeed(i: BuildFeedInput): FeedItem[] {
  const sessions = new Map(i.sessions.map((s) => [s.session_id, s]));
  const items: FeedItem[] = i.events
    .filter((e) => isFailureRow({ kind: e.kind, outcome: e.outcome }))
    .map((e) => {
      const s = sessions.get(e.session_id);
      const bridgeId = e.bridge_id ?? (e.code ? (i.graph.chIndex[e.code] ?? null) : null);
      const catalogCode = catalogCodeOf(i.graph, bridgeId, e.code);
      const page = e.page_id ?? '';
      const control = e.control_id ? i.graph.controls[e.control_id] : undefined;
      const action = e.action_id ? i.graph.actions[e.action_id] : undefined;
      const { theySee, meaning } = toastFor(i.graph, bridgeId);
      return {
        key: eventKey({ sessionId: e.session_id, seq: e.seq }),
        sessionId: e.session_id,
        seq: e.seq,
        at: e.sent_at,
        kind: e.kind,
        outcome: e.outcome,
        code: e.code,
        bridgeId,
        catalogCode,
        theySee,
        meaning,
        page,
        pageName: i.graph.pages[page as PageId]?.name ?? (page || 'No page'),
        control: e.control_id,
        controlLabel: controlName(control),
        action: e.action_id,
        actionLabel: action?.label ?? null,
        act: e.act,
        role: normRole(s?.role),
        userId: s?.user_id ?? null,
        teamId: s?.team_id ?? null,
        teamName: s?.team_id ? (i.teamNames.get(s.team_id) ?? null) : null,
        platform: s?.platform ?? null,
        release: s?.release ?? null,
        serverCode: e.server_code,
        message: e.message,
        durationMs: e.duration_ms,
        trail: e.trail,
        drift: e.drift ?? [],
        state: itemState(catalogCode, i.notes, i.fresh, s?.release ?? null, i.release, e.code ?? catalogCode),
        nth: 0,
      };
    });
  // Ordinals run oldest first: the first time a person hit a code is their 1st.
  const seen = new Map<string, number>();
  for (const item of [...items].sort((a, b) => a.at.localeCompare(b.at) || a.sessionId.localeCompare(b.sessionId) || a.seq - b.seq)) {
    const k = `${personKey(item)}|${item.catalogCode ?? ''}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    item.nth = n;
  }
  return items.sort((a, b) => b.at.localeCompare(a.at) || a.sessionId.localeCompare(b.sessionId) || b.seq - a.seq);
}

/** Items in the scope's role, device, page and server code. */
export function filterFeed(items: readonly FeedItem[], scope: Pick<FeedScope, 'role' | 'pf' | 'page' | 'sc'>): FeedItem[] {
  return items.filter(
    (i) =>
      (scope.role === 'all' || i.role === scope.role) &&
      (scope.pf === 'all' || i.platform === scope.pf) &&
      (!scope.page || i.page === scope.page) &&
      (!scope.sc || i.serverCode === scope.sc),
  );
}

// ---------------------------------------------------------------------------
// The role cards
// ---------------------------------------------------------------------------

export interface RoleCard {
  role: 'coach' | 'player';
  errors: number;
  /** Distinct signed-in people. */
  people: number;
  /** The words seen most often, with how many times. Null with no errors. */
  top: { text: string; count: number } | null;
}

export interface RoleSummary {
  coach: RoleCard;
  player: RoleCard;
  signedOut: number;
  /** Failures whose session row could not be read, so their role is not known. */
  unknownRole: number;
}

function topHeadline(items: readonly FeedItem[]): { text: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const i of items) {
    const t = itemHeadline(i);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? { text: best[0], count: best[1] } : null;
}

export function roleSummary(items: readonly FeedItem[]): RoleSummary {
  const card = (role: 'coach' | 'player'): RoleCard => {
    const mine = items.filter((i) => i.role === role);
    return { role, errors: mine.length, people: new Set(mine.map((i) => i.userId).filter(Boolean)).size, top: topHeadline(mine) };
  };
  return {
    coach: card('coach'),
    player: card('player'),
    signedOut: items.filter((i) => i.role === 'signed-out').length,
    unknownRole: items.filter((i) => i.role === null).length,
  };
}

/** How often a code fired in the items, and for how many people. */
export function codeCount(items: readonly FeedItem[], catalogCode: string | null): { count: number; people: number; sessions: number } {
  const mine = items.filter((i) => i.catalogCode === catalogCode);
  return { count: mine.length, people: new Set(mine.map((i) => i.userId).filter(Boolean)).size, sessions: new Set(mine.map((i) => i.sessionId)).size };
}

// ---------------------------------------------------------------------------
// Where: page, control, action, files, tables, docs (the Bridge map)
// ---------------------------------------------------------------------------

export interface WhereModel {
  page: string;
  pageName: string;
  control: { id: string; label: string | null; description: string | null; file: string | null } | null;
  action: { id: string; label: string; component: string | null; handler: string | null; service: string | null } | null;
  /** Code files that hold the control, the action and the code's own row, deduplicated. */
  files: string[];
  /** Tables the action writes or reads, from the Bridge map (not stored on the event). */
  tables: string[];
  docs: Array<{ name: string; path: string }>;
  /** Plain words when the control → action link is missing, else null. */
  gap: string | null;
}

export function whereOf(item: Pick<FeedItem, 'page' | 'pageName' | 'control' | 'action' | 'bridgeId'>, graph: Pick<BridgeGraph, 'controls' | 'actions' | 'ids' | 'pages'>): WhereModel {
  const control: GraphControl | undefined = item.control ? graph.controls[item.control] : undefined;
  const action: GraphAction | undefined = item.action ? graph.actions[item.action] : undefined;
  const id = item.bridgeId === null ? undefined : graph.ids[String(item.bridgeId)];
  const files = [control?.file, action?.component, action?.service, ...(id?.where ?? [])].filter((f): f is string => Boolean(f));
  const docs = Object.entries(graph.pages[item.page as PageId]?.docs ?? {})
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([name, path]) => ({ name, path }));
  let gap: string | null = null;
  if (!item.control && !item.action) gap = 'The event named no button and no action.';
  else if (item.control && !control) gap = `${item.control} is not in the Bridge map yet.`;
  else if (item.action && !action) gap = `${item.action} is not in the Bridge map yet.`;
  else if (item.control && item.action && control && !control.actions.includes(item.action)) gap = `${item.control} is not linked to ${item.action} in the Bridge map yet.`;
  else if (!item.control) gap = 'The event named the action but not the button that started it.';
  return {
    page: item.page,
    pageName: item.pageName,
    control: item.control ? { id: item.control, label: controlName(control), description: control?.description ?? null, file: control?.file ?? null } : null,
    action: item.action && action ? { id: item.action, label: action.label, component: action.component, handler: action.handler, service: action.service } : item.action ? { id: item.action, label: item.action, component: null, handler: null, service: null } : null,
    files: [...new Set(files)],
    tables: action?.tables ?? [],
    docs,
    gap,
  };
}

// ---------------------------------------------------------------------------
// What they did: the session trail
// ---------------------------------------------------------------------------

export type TrailTone = 'muted' | 'coach' | 'player' | 'bad' | 'good' | 'watch';

export interface TrailLine {
  seq: number;
  at: string;
  text: string;
  /** "switch 1.4 s", "after 1.8 s", or null. */
  detail: string | null;
  tone: TrailTone;
  /** The failure this panel is about. */
  current: boolean;
}

function secText(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

const OUTCOME_WORDS: Readonly<Record<string, string>> = {
  success: 'Done',
  offline: 'Offline, not sent',
  busy: 'Busy, not sent',
  cancelled: 'Cancelled',
  'stopped-waiting': 'Stopped waiting',
  retry: 'Pressed Try again',
};

/**
 * The session's events around one failure, as lines a person can read. Views say which page and, when the client sent
 * it, how long the switch took. At most `before` lines before the failure and `after` after.
 */
export function trailLines(events: readonly SessionEventRow[], graph: Pick<BridgeGraph, 'pages' | 'controls' | 'actions' | 'ids' | 'chIndex'>, focus: EventKey, role: FeedRole | null, o: { before?: number; after?: number } = {}): TrailLine[] {
  const mine = events.filter((e) => e.session_id === focus.sessionId).sort((a, b) => a.seq - b.seq);
  const at = mine.findIndex((e) => e.seq === focus.seq);
  const before = o.before ?? 12;
  const after = o.after ?? 6;
  const slice = at === -1 ? mine.slice(-before) : mine.slice(Math.max(0, at - before), at + after + 1);
  const pageName = (p: string | null) => (p ? (graph.pages[p as PageId]?.name ?? p) : 'a page');
  const actionName = (e: SessionEventRow) => (e.action_id ? (graph.actions[e.action_id]?.label ?? e.action_id) : (e.act ?? 'an action'));
  const pressTone: TrailTone = role === 'coach' ? 'coach' : role === 'player' ? 'player' : 'muted';
  return slice.map((e) => {
    const current = e.seq === focus.seq;
    const base = { seq: e.seq, at: e.sent_at, current };
    const bridgeId = e.bridge_id ?? (e.code ? (graph.chIndex[e.code] ?? null) : null);
    if (isFailureRow({ kind: e.kind, outcome: e.outcome })) {
      return { ...base, text: `${e.kind === 'crash' ? 'Crashed' : 'Failed'}: ${e.code ?? 'no code'}${e.server_code ? ` · ${serverCodeWords(e.server_code).words} (${e.server_code})` : ''}`, detail: e.duration_ms !== null ? `after ${secText(e.duration_ms)}` : null, tone: 'bad' };
    }
    switch (e.kind) {
      case 'view':
        return { ...base, text: `Opened ${pageName(e.page_id)}`, detail: e.duration_ms !== null ? `switch ${secText(e.duration_ms)}` : null, tone: 'muted' };
      case 'tap': {
        const label = e.control_id ? controlName(graph.controls[e.control_id]) : null;
        return { ...base, text: `Pressed ${label ?? 'a button'}${e.control_id ? ` (${e.control_id})` : ''}`, detail: null, tone: pressTone };
      }
      case 'action':
        if (e.outcome === 'start') return { ...base, text: `Started ${actionName(e)}`, detail: null, tone: pressTone };
        return {
          ...base,
          text: `${OUTCOME_WORDS[e.outcome ?? ''] ?? e.outcome ?? 'Ended'}: ${actionName(e)}`,
          detail: e.duration_ms !== null ? `after ${secText(e.duration_ms)}` : null,
          tone: e.outcome === 'success' ? 'good' : 'watch',
        };
      case 'toast':
      case 'state': {
        const words = toastFor(graph, bridgeId);
        return { ...base, text: `${e.kind === 'toast' ? 'Saw a toast' : 'Saw'}: ${words.theySee ?? words.meaning ?? e.code ?? 'a state'}`, detail: null, tone: 'muted' };
      }
      case 'frustration':
        return { ...base, text: `Rage or dead click${e.control_id ? ` on ${e.control_id}` : ''}`, detail: null, tone: 'watch' };
      case 'vital':
        return { ...base, text: `Measured ${e.act ?? 'a vital'}`, detail: e.duration_ms !== null ? secText(e.duration_ms) : null, tone: 'muted' };
      default:
        return { ...base, text: e.kind, detail: null, tone: 'muted' };
    }
  });
}

// ---------------------------------------------------------------------------
// How it counts: the hourly key and the sentences
// ---------------------------------------------------------------------------

/** The `act` ingest writes into the hourly key (ingest.ts addHourly). */
const VITAL_ACTS: ReadonlySet<string> = new Set(['INP', 'LCP', 'CLS']);
const CONTROL_ID = /^CTL-P\d{3}-\d{3,}$/;

export interface HourlyKey {
  hour: string;
  code: string;
  kind: string;
  outcome: string;
  act: string;
  page_id: string;
  role: string;
  platform: string;
  release: string;
}

/**
 * The hourly row a failure was added to, derived from its stored event and its session, the way ingest.ts addHourly
 * builds the key. An event whose code the Bridge map doesn't know is counted under "unknown". Role, platform and
 * release are the session's (the session row keeps its newest values).
 */
export function hourlyKeyOf(e: Pick<SessionEventRow, 'sent_at' | 'code' | 'bridge_id' | 'kind' | 'outcome' | 'act' | 'action_id' | 'control_id' | 'page_id'>, s: Pick<SessionRow, 'role' | 'platform' | 'release'> | null): HourlyKey {
  const act = e.action_id && e.act ? e.act : e.kind === 'vital' && e.act && VITAL_ACTS.has(e.act) ? e.act : e.control_id && CONTROL_ID.test(e.control_id) ? e.control_id : '';
  return {
    hour: hourOf(Date.parse(e.sent_at)),
    code: e.bridge_id === null && e.code ? 'unknown' : (e.code ?? ''),
    kind: e.kind,
    outcome: e.outcome ?? '',
    act,
    page_id: e.page_id ?? '',
    role: s?.role ?? 'unknown',
    platform: s?.platform ?? 'unknown',
    release: s?.release ?? 'unknown',
  };
}

export interface ErrorLogRow {
  id: string;
  fingerprint: string | null;
  ch_code: string | null;
}

export interface CountsContext {
  window: FeedWindow;
  /** This release (currentRelease). */
  release: string | null;
  /** The code in the window: count, people and sessions (codeCount over every item, before filters). */
  code: { count: number; people: number; sessions: number };
  expected: BridgeNoteRow | null;
  watched: boolean;
  isNew: boolean;
  /** The error log's rows for this session, or why they could not be read. */
  errorLog: { state: 'ok'; rows: readonly ErrorLogRow[] } | { state: 'no-signal' | 'error' };
  /** The new-after-release rule's people threshold (R-02 fires at this many or more). */
  r02People: number;
}

const ROLE_WORD: Readonly<Record<FeedRole, string>> = { coach: 'a coach', player: 'a player', 'signed-out': 'someone signed out' };

function hourWords(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${String(d.getUTCHours()).padStart(2, '0')}:00 UTC` : 'its';
}

/**
 * Four or five numbered sentences on how this one failure is counted, generated from the event and the rules ingest
 * runs. Every claim is about this event or a stated rule; nothing is assumed that wasn't read.
 */
export function howItCounts(item: FeedItem, key: HourlyKey, ctx: CountsContext): string[] {
  const out: string[] = [];
  out.push(
    item.kind === 'crash'
      ? 'It is an error because a section crashed (kind crash). Offline, busy, cancelled, stopped waiting and Try again are counted too, but never as errors.'
      : 'It is an error because the action ended in failure (outcome failure). Offline, busy, cancelled, stopped waiting and Try again are counted too, but never as errors.',
  );
  const who = item.role ? ROLE_WORD[item.role] : 'a person whose session row could not be read';
  const release = key.release === 'unknown' ? 'an unknown release' : `release ${key.release.slice(0, 7)}`;
  const platform = PLATFORM_WORDS[key.platform] ?? key.platform;
  out.push(
    key.code === 'unknown'
      ? `Its code ${item.code} is not in the Bridge map, so it counts once under "unknown" on ${item.pageName} (${item.page}), for ${who} on ${platform}, ${release}, in the ${hourWords(key.hour)} hour, and is logged as drift.`
      : `It counts once, under ${key.code || 'no code'} on ${item.pageName} (${item.page}), for ${who} on ${platform}, ${release}, in the ${hourWords(key.hour)} hour.`,
  );
  if (item.role === 'signed-out' || !item.userId) {
    out.push(`It is counted under signed-out, with no person attached; this session has hit it ${item.nth} ${item.nth === 1 ? 'time' : 'times'} ${windowTail(ctx.window)}.`);
  } else {
    out.push(
      `People are distinct signed-in users: this person is on their ${ordinal(item.nth)} time ${windowTail(ctx.window)} and counts once. ${ctx.code.count} ${ctx.code.count === 1 ? 'failure' : 'failures'} of this code ${windowWords(ctx.window)} came from ${ctx.code.people} ${ctx.code.people === 1 ? 'person' : 'people'}; coaches and players are counted apart.`,
    );
  }
  if (ctx.expected) {
    out.push(`It is marked expected ("${ctx.expected.body}"), so the spike (R-01) and new-after-release (R-02) rules skip it. It is still counted and listed.`);
  } else if (ctx.isNew) {
    out.push(
      ctx.code.people >= ctx.r02People
        ? `It never fired in an earlier release in the week before, and ${ctx.code.people} people have hit it, so the new-after-release rule (R-02) raises it.`
        : `It never fired in an earlier release in the week before. The new-after-release rule (R-02) raises it once ${ctx.r02People} or more people hit it; ${ctx.code.people} so far.`,
    );
  } else {
    out.push(`It is not marked expected, so the spike rule (R-01) and the new-after-release rule (R-02) both still watch it${ctx.watched ? '; it is also watched, so it is pinned to Pulse and the digest' : ''}.`);
  }
  if (ctx.errorLog.state !== 'ok') {
    out.push('Whether the error log also holds it could not be read.');
  } else {
    const match = ctx.errorLog.rows.filter((r) => r.ch_code && r.ch_code === item.catalogCode);
    out.push(
      match.length
        ? 'The error log holds a row for this session and code. A failure the app also reported itself is joined to that row by session and sequence and stamped, never written twice.'
        : 'The error log holds no row for this session and code: at most 5 failures from one batch become error-log rows. It is still counted in the hourly totals and kept in the session timeline.',
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Is it fixed? (read-only: from the hourly store's last 8 days, never a stored "resolved" flag)
// ---------------------------------------------------------------------------

export type FixState = 'unknown' | 'new-in-live' | 'still-failing' | 'not-seen-in-live' | 'no-history';

export interface FixStatus {
  state: FixState;
  /** One sentence for the detail panel. */
  words: string;
  tone: 'bad' | 'watch' | 'good' | 'muted';
}

/**
 * Whether a code still fails in the live release, from the failure rows of the 8 days before (code × release × hour).
 * "Not seen in the live release" is not "fixed": it may just have had no traffic yet, and the words say so.
 */
export function fixStatus(
  history: ReadonlyArray<{ code: string; release: string; at: string }> | null,
  code: string | null,
  live: string | null,
  /** The failure on screen is evidence too: it can never read as "not seen in live" or "no history". */
  self?: { release: string | null; at: string },
): FixStatus {
  const rows = history && code && self?.release ? [...history, { code, release: self.release, at: self.at }] : history;
  if (!rows) return { state: 'unknown', words: 'Whether it still fails is unknown: the 8-day release history could not be read whole.', tone: 'muted' };
  if (!code) return { state: 'unknown', words: 'Whether it still fails is unknown: the failure carried no code to follow.', tone: 'muted' };
  if (!live) return { state: 'unknown', words: 'Whether it still fails is unknown: the live release is not known here.', tone: 'muted' };
  const mine = rows.filter((r) => r.code === code && r.release);
  if (!mine.length) return { state: 'no-history', words: 'No failure of this code is in the hourly store for the last 8 days (it may be older than that).', tone: 'muted' };
  const inLive = mine.filter((r) => r.release === live);
  const others = [...new Set(mine.filter((r) => r.release !== live).map((r) => r.release))];
  if (inLive.length && !others.length) return { state: 'new-in-live', words: `New in the live release ${live}: it never failed in an earlier release in the 8 days before.`, tone: 'bad' };
  if (inLive.length) {
    return { state: 'still-failing', words: `Still failing in the live release ${live}, and in ${others.length} earlier ${others.length === 1 ? 'release' : 'releases'} in the last 8 days.`, tone: 'bad' };
  }
  const last = mine.reduce((a, b) => (b.at > a.at ? b : a));
  return {
    state: 'not-seen-in-live',
    words: `Not seen in the live release ${live} so far; it last failed in ${last.release} (${last.at.slice(0, 10)}). That points to fixed, but only once the live release has had real use.`,
    tone: 'good',
  };
}

// ---------------------------------------------------------------------------
// Server codes in plain words
// ---------------------------------------------------------------------------

/**
 * A Postgres or PostgREST code in a few plain words (src/lib/admin/server-codes.ts: the exact code, else its SQLSTATE
 * class). `known` is false only when neither is listed; `meaning` is the one-sentence version.
 */
export function serverCodeWords(code: string | null): { words: string; known: boolean; meaning: string | null } {
  const d = describeServerCode(code);
  if (!d) return { words: 'No server code came back', known: false, meaning: null };
  return d.match === 'none' ? { words: `Server code ${code}`, known: false, meaning: null } : { words: d.label, known: true, meaning: d.meaning };
}

/** Where a server code's name comes from: PGRST codes are PostgREST's, the rest Postgres's. */
export function serverSource(code: string): string {
  return code.startsWith('PGRST') ? 'PostgREST' : 'Postgres';
}

// ---------------------------------------------------------------------------
// Copy report
// ---------------------------------------------------------------------------

/** The feed as Markdown: codes, pages, buttons, teams and counts. Never a person. */
export function feedReport(items: readonly FeedItem[], summary: RoleSummary, w: FeedWindow, pipeLabel: string): string {
  const esc = (v: string) => v.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const lines = [
    `# Error feed, ${windowWords(w)}`,
    '',
    `- ${pipeLabel}`,
    `- Coaches: ${summary.coach.errors} errors, ${summary.coach.people} people`,
    `- Players: ${summary.player.errors} errors, ${summary.player.people} people`,
    `- Signed out: ${summary.signedOut} errors`,
    '',
    // "Likely cause" is the explainer's fixed label, never the raw message (it can hold ids).
    '| Time (UTC) | Role | Saw | Code | Page | Button | Team | Server | Likely cause |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...items.slice(0, 200).map((i) => {
      const cause = itemExplanation(i);
      return `| ${i.at.slice(11, 19)} | ${i.role ?? 'unknown'} | ${esc(itemHeadline(i))} | ${i.code ?? '—'} | ${esc(i.pageName)} | ${esc(i.controlLabel ?? i.control ?? '—')} | ${esc(i.teamName ?? '—')} | ${i.serverCode ?? '—'} | ${cause.basis === 'nothing' ? 'not reported' : cause.label} |`;
    }),
  ];
  if (items.length > 200) lines.push('', `${items.length - 200} more not listed.`);
  return lines.join('\n');
}
