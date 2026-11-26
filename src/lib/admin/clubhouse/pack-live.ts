/**
 * The live half of a context pack's evidence (plan §9.1 part 3), as pure functions over the live lenses' reads: which
 * hourly rows, session events, sessions and rule hits belong to a pack's target, and the sections they make (counts and
 * their split, representative envelopes, the sessions, the release it started in, the rules firing).
 *
 * pack-server.ts does the reading (through live.ts, once per pack) and hands the result here, so every rule about what
 * counts as "this target" is testable without a database. People and teams print through the labels the caller passes:
 * pseudonymous unless the pack asked for names (D7).
 */
import type { BridgeGraph } from './graph';
import {
  isFailureRow,
  previousRelease,
  releaseDiff,
  releaseList,
  type HourlyRow,
  type LiveState,
  type SessionEventRow,
  type SessionRow,
} from './live-model';
import type { PackCell, PackLiveContext, PackLiveSection, PackTarget } from './pack';
import type { BridgeAlert } from './rules';

/** What one pack reads from the live tables, once, for every live section. */
export interface PackLiveData {
  state: LiveState;
  error?: string;
  truncated: boolean;
  /** Hourly counters: the last day and the seven before it (the snapshot's day and baseline rows). */
  rows: readonly HourlyRow[];
  /** Sessions with a failure in the window the reader used, and their events (only those keep events). */
  sessions: readonly SessionRow[];
  events: readonly SessionEventRow[];
  /** Every rule hit over the last day (R-01 to R-12). */
  alerts: readonly BridgeAlert[];
}

export interface PackPeopleLabels {
  person: (userId: string | null) => string | null;
  team: (teamId: string | null) => string | null;
  /** A session id joins straight to its user: printed as a pseudonym (pack-server's sessionPseudonym). */
  session: (sessionId: string | null) => string | null;
}

const UUID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** An envelope's message in a pseudonymous paste: no uuids, no PostgREST details or hints. */
function scrubMessage(text: string, includeNames: boolean): string {
  const cut = includeNames ? text : text.replace(/\s*(?:[;,]\s*)?\b(?:details|hint)=.*$/is, '').replace(UUID_TEXT, '[id]');
  return cut.slice(0, 160);
}

/** The held migration that creates the signal tables: what every "No signal yet" here waits for. */
export const SIGNAL_MIGRATION = '20261124090000';
export const COUNTS_WINDOW = 'the last 8 days';
export const SESSIONS_WINDOW = 'the last 24 hours';
const ENVELOPE_LIMIT = 3;
const SESSION_LIMIT = 10;
const SPLIT_LIMIT = 12;

const chOf = (graph: BridgeGraph, target: PackTarget) => (target.kind === 'code' ? graph.ids[target.key]?.ch : undefined);
const actionNameOf = (graph: BridgeGraph, target: PackTarget) => (target.kind === 'action' ? graph.actions[target.key]?.useActionName : undefined);

/** Hourly counter rows that are about the target. A team has no hourly column, so none are. */
export function hourlyMatches(graph: BridgeGraph, target: PackTarget): (r: HourlyRow) => boolean {
  const ch = chOf(graph, target);
  const actionName = actionNameOf(graph, target);
  switch (target.kind) {
    case 'code':
      return (r) => r.bridge_id === Number(target.key) || r.code === target.key || (!!ch && r.code === ch);
    case 'action':
      return (r) => !!actionName && r.kind === 'action' && r.act === actionName;
    case 'control':
      return (r) => r.act === target.key;
    case 'release':
      return (r) => !!target.ref && r.release.startsWith(target.ref);
    case 'person':
      return (r) => !!target.ref && (r.user_ids ?? []).includes(target.ref);
    case 'team':
      return () => false;
    default:
      return (r) => !!target.page && r.page_id === target.page;
  }
}

/** Sessions that are about the target: by their own columns for a release, person or team, else by their events. */
export function sessionsFor(graph: BridgeGraph, target: PackTarget, sessions: readonly SessionRow[], events: readonly SessionEventRow[]): SessionRow[] {
  if (target.kind === 'release') return sessions.filter((s) => !!target.ref && s.release.startsWith(target.ref));
  if (target.kind === 'person') return sessions.filter((s) => s.user_id === target.ref);
  if (target.kind === 'team') return sessions.filter((s) => s.team_id === target.ref);
  const match = eventMatches(graph, target);
  const ids = new Set(events.filter(match).map((e) => e.session_id));
  return sessions.filter((s) => ids.has(s.session_id));
}

/** Session events that are about the target (for a release, person or team: every event of their sessions). */
export function eventMatches(graph: BridgeGraph, target: PackTarget): (e: SessionEventRow) => boolean {
  const ch = chOf(graph, target);
  const actionName = actionNameOf(graph, target);
  switch (target.kind) {
    case 'code':
      return (e) => e.bridge_id === Number(target.key) || e.code === target.key || (!!ch && e.code === ch);
    case 'action':
      return (e) => e.action_id === target.key || (!!actionName && e.act === actionName);
    case 'control':
      return (e) => e.control_id === target.key;
    case 'release':
    case 'person':
    case 'team':
      return () => true;
    default:
      return (e) => !!target.page && e.page_id === target.page;
  }
}

/** Rule hits that name the target; for a person or team, the per-session ones (R-06, R-07) in their sessions. */
export function alertMatches(graph: BridgeGraph, target: PackTarget, sessionIds: ReadonlySet<string>): (a: BridgeAlert) => boolean {
  const ch = chOf(graph, target);
  const actionName = actionNameOf(graph, target);
  switch (target.kind) {
    case 'code':
      return (a) => a.code === target.key || (!!ch && a.code === ch);
    case 'action':
      return (a) => a.action === target.key || (!!actionName && a.action === actionName);
    case 'control':
      return (a) => a.control === target.key;
    case 'release':
      return (a) => !!target.ref && !!a.release && a.release.startsWith(target.ref);
    case 'person':
    case 'team':
      return (a) => typeof a.evidence.sessionId === 'string' && sessionIds.has(a.evidence.sessionId);
    default:
      return (a) => !!target.page && a.page === target.page;
  }
}

/** The section a read that did not come back says, instead of claiming zero. */
function notRead(source: string, title: string, data: PackLiveData, what: string): PackLiveSection | null {
  if (data.state === 'no-signal') {
    return { source, title, state: 'no-signal', note: `No signal yet: ${what} once the signal tables exist (held migration ${SIGNAL_MIGRATION}).` };
  }
  if (data.state === 'error') return { source, title, state: 'failed', note: data.error ?? 'The live read failed.' };
  return null;
}

const cut = (data: PackLiveData) => (data.truncated ? ' The read was cut short, so these are the newest rows only.' : '');
const minIso = (xs: readonly string[]) => xs.reduce<string | null>((a, x) => (a === null || x < a ? x : a), null);
const maxIso = (xs: readonly string[]) => xs.reduce<string | null>((a, x) => (a === null || x > a ? x : a), null);
const total = (rows: readonly HourlyRow[]) => rows.reduce((a, r) => a + Number(r.signal_count || 0), 0);

/** Counts and their split (§9.1): the total, how many failed, first and last seen, then by release, role and platform. */
export function countersSection(graph: BridgeGraph, target: PackTarget, data: PackLiveData, ctx: PackLiveContext): PackLiveSection {
  const title = 'Counts and their split';
  const pending = notRead('counters', title, data, 'counts by role, platform and release, first and last seen');
  if (pending) return pending;
  if (target.kind === 'team') {
    return { source: 'counters', title, state: 'ok', note: 'Hourly counters carry no team, so a team has no counts of its own; its sessions below are the evidence.' };
  }
  if (target.kind === 'action' && !actionNameOf(graph, target)) {
    return { source: 'counters', title, state: 'ok', note: `${target.key} has no useAction name in the graph yet, so its counters cannot be told apart; its sessions are below.` };
  }
  const mine = data.rows.filter(hourlyMatches(graph, target));
  if (!mine.length) return { source: 'counters', title, state: 'ok', note: `Nothing counted for ${ctx.subject} in ${COUNTS_WINDOW}.${cut(data)}` };
  const failures = total(mine.filter(isFailureRow));
  const groups = new Map<string, { release: string; role: string; platform: string; count: number; failures: number; first: string; last: string }>();
  for (const r of mine) {
    const key = `${r.release}|${r.role}|${r.platform}`;
    const g = groups.get(key) ?? { release: r.release.slice(0, 7), role: r.role, platform: r.platform, count: 0, failures: 0, first: r.bucket_hour, last: r.last_at };
    g.count += Number(r.signal_count || 0);
    if (isFailureRow(r)) g.failures += Number(r.signal_count || 0);
    if (r.bucket_hour < g.first) g.first = r.bucket_hour;
    if (r.last_at > g.last) g.last = r.last_at;
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, SPLIT_LIMIT);
  return {
    source: 'counters',
    title,
    state: 'ok',
    note: `${total(mine)} signal(s) for ${ctx.subject} in ${COUNTS_WINDOW}, ${failures} of them failures; first seen ${minIso(mine.map((r) => r.bucket_hour))}, last seen ${maxIso(mine.map((r) => r.last_at))}.${cut(data)}`,
    rows: rows.map((g) => ({ release: g.release, role: g.role, platform: g.platform, signals: g.count, failures: g.failures, first: g.first, last: g.last })),
  };
}

/** Three representative envelopes with their trails: the newest failures about the target, from different sessions first. */
export function envelopesSection(graph: BridgeGraph, target: PackTarget, data: PackLiveData, ctx: PackLiveContext, labels: PackPeopleLabels): PackLiveSection {
  const title = 'Representative envelopes';
  const pending = notRead('envelopes', title, data, 'three envelopes with their trails, grouped stacks and server codes');
  if (pending) return pending;
  const sessionIds = new Set(sessionsFor(graph, target, data.sessions, data.events).map((s) => s.session_id));
  const match = eventMatches(graph, target);
  const fails = data.events
    .filter((e) => sessionIds.has(e.session_id) && match(e) && isFailureRow({ kind: e.kind, outcome: e.outcome }))
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const picked: SessionEventRow[] = [];
  for (const e of fails) if (picked.length < ENVELOPE_LIMIT && !picked.some((p) => p.session_id === e.session_id)) picked.push(e);
  for (const e of fails) if (picked.length < ENVELOPE_LIMIT && !picked.includes(e)) picked.push(e);
  if (!picked.length) return { source: 'envelopes', title, state: 'ok', note: `No failure envelope for ${ctx.subject} in ${SESSIONS_WINDOW}.${cut(data)}` };
  return {
    source: 'envelopes',
    title,
    state: 'ok',
    note: `The newest ${picked.length} failure envelope(s) for ${ctx.subject}, from sessions with a failure in ${SESSIONS_WINDOW}.`,
    rows: picked.map((e) => ({
      when: e.sent_at,
      session: labels.session(e.session_id),
      page: e.page_id,
      code: e.code ?? (e.bridge_id !== null ? String(e.bridge_id) : null),
      kind: e.outcome ? `${e.kind} ${e.outcome}` : e.kind,
      server: e.server_code,
      ms: e.duration_ms,
      trail: (e.trail ?? []).slice(-6).join(' > ') || null,
      message: e.message ? scrubMessage(e.message, ctx.includeNames) : null,
    })),
  };
}

/** The sessions that hit it, newest first, people as pseudonymous ids unless names were asked for. */
export function sessionsSection(graph: BridgeGraph, target: PackTarget, data: PackLiveData, ctx: PackLiveContext, labels: PackPeopleLabels): PackLiveSection {
  const title = 'Sessions';
  const pending = notRead('sessions', title, data, 'the sessions that hit it, as pseudonymous ids');
  if (pending) return pending;
  const mine = sessionsFor(graph, target, data.sessions, data.events).sort((a, b) => b.last_at.localeCompare(a.last_at));
  if (!mine.length) return { source: 'sessions', title, state: 'ok', note: `No session with a failure touched ${ctx.subject} in ${SESSIONS_WINDOW}.${cut(data)}` };
  return {
    source: 'sessions',
    title,
    state: 'ok',
    note: `${mine.length} session(s) with a failure touched ${ctx.subject} in ${SESSIONS_WINDOW}${mine.length > SESSION_LIMIT ? `; the newest ${SESSION_LIMIT}` : ''}. Each opens on B07.`,
    rows: mine.slice(0, SESSION_LIMIT).map((s) => ({
      session: labels.session(s.session_id),
      person: labels.person(s.user_id),
      team: labels.team(s.team_id),
      role: s.role,
      platform: s.platform,
      release: s.release.slice(0, 7),
      last: s.last_at,
      failures: s.failure_count,
      pages: s.pages.join(' '),
    })),
  };
}

/**
 * The release it started in: the earliest release that sent it. A release pack instead lists what is new or rising
 * against the release before it (B10's diff), and a person or team pack the releases their sessions ran.
 */
export function releaseSection(graph: BridgeGraph, target: PackTarget, data: PackLiveData, ctx: PackLiveContext): PackLiveSection {
  const title = target.kind === 'release' ? 'What it changed (against the release before)' : 'The release it started in';
  const pending = notRead('release', title, data, target.kind === 'release' ? 'the codes new and rising in it' : 'the first release that sent it');
  if (pending) return pending;
  if (target.kind === 'release') {
    const list = releaseList(data.rows);
    const full = list.find((r) => !!target.ref && r.release.startsWith(target.ref))?.release;
    if (!full) return { source: 'release', title, state: 'ok', note: `${ctx.subject} sent nothing in ${COUNTS_WINDOW}.${cut(data)}` };
    const base = previousRelease(list, full);
    const diff = releaseDiff(data.rows, full, base);
    const moved = diff.codes.filter((c) => c.kind === 'new' || c.kind === 'rising');
    return {
      source: 'release',
      title,
      state: 'ok',
      note: base
        ? `${moved.length} code(s) new or rising against ${base.slice(0, 7)}, over the first ${diff.hours} hour(s) after each one's first signal.${cut(data)}`
        : `No earlier release in ${COUNTS_WINDOW} to compare with.${cut(data)}`,
      rows: moved.slice(0, SPLIT_LIMIT).map((c) => ({ code: c.code, page: c.page, change: c.kind, now: c.now, before: c.before })),
    };
  }
  if (target.kind === 'person' || target.kind === 'team') {
    const mine = sessionsFor(graph, target, data.sessions, data.events);
    if (!mine.length) return { source: 'release', title: 'The releases they ran', state: 'ok', note: `No session with a failure for ${ctx.subject} in ${SESSIONS_WINDOW}.` };
    const byRelease = new Map<string, number>();
    for (const s of mine) byRelease.set(s.release, (byRelease.get(s.release) ?? 0) + 1);
    return {
      source: 'release',
      title: 'The releases they ran',
      state: 'ok',
      note: `The releases ${ctx.subject}'s failing sessions ran, in ${SESSIONS_WINDOW}.`,
      rows: [...byRelease.entries()].sort((a, b) => b[1] - a[1]).map(([release, sessions]) => ({ release: release.slice(0, 7), sessions })),
    };
  }
  const mine = data.rows.filter(hourlyMatches(graph, target));
  if (!mine.length) return { source: 'release', title, state: 'ok', note: `Nothing sent for ${ctx.subject} in ${COUNTS_WINDOW}, so no release to name.${cut(data)}` };
  const firsts = releaseList(mine).sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
  const first = firsts[0]!;
  return {
    source: 'release',
    title,
    state: 'ok',
    note: `First sent by ${first.release.slice(0, 7)} at ${first.firstSeen}, within ${COUNTS_WINDOW} (older releases are outside the window).${cut(data)}`,
    rows: firsts.slice(0, SPLIT_LIMIT).map((r) => ({ release: r.release.slice(0, 7), first: r.firstSeen, last: r.lastSeen, signals: r.signals, failures: r.failures })),
  };
}

/** The rules firing about it now (R-01 to R-12 over the last day), worst first. */
export function rulesSection(graph: BridgeGraph, target: PackTarget, data: PackLiveData, ctx: PackLiveContext): PackLiveSection {
  const title = 'Rules firing';
  const pending = notRead('rules', title, data, 'the rules (R-01 to R-12) firing about it');
  if (pending) return pending;
  const sessionIds = new Set(sessionsFor(graph, target, data.sessions, data.events).map((s) => s.session_id));
  const hits = data.alerts.filter(alertMatches(graph, target, sessionIds));
  if (!hits.length) return { source: 'rules', title, state: 'ok', note: `No rule fired about ${ctx.subject} in the last 24 hours.` };
  return {
    source: 'rules',
    title,
    state: 'ok',
    note: `${hits.length} rule hit(s) about ${ctx.subject} in the last 24 hours, worst first.`,
    rows: hits.map((a) => {
      const row: Record<string, PackCell> = { rule: a.rule, severity: a.severity, title: a.title, release: a.release ? a.release.slice(0, 7) : null };
      return row;
    }),
  };
}
