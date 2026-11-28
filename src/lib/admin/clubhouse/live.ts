import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { createAdminClient } from '@/lib/supabase/admin';
import type { BridgeGraph } from './graph';
import {
  categoryLookup,
  classifyReadError,
  hourFloorIso,
  isActiveHour,
  pipeStatus,
  runRules,
  type DriftRow,
  type HourlyRow,
  type LiveRead,
  type LiveState,
  type PipeStatus,
  type SessionEventRow,
  type SessionRow,
} from './live-model';
import { EMPTY_NOTES, NOTE_COLUMNS, decidingRelease, indexNotes, packVerdict, sentHour, type BridgeNoteRow, type NotesIndex, type PackVerdict } from './notes';
import type { BridgeAlert } from './rules';
import { liveRef } from './screens';

/**
 * The live lenses' reads (plan §4.5 tables, through the service role). Every caller is a page behind
 * `requireSuperAdmin()` or the digest cron; nothing here checks a role itself, so nothing here may be imported by a
 * route a signed-in user can reach.
 *
 * Every read returns `{ state, data }`. While the migration 20261124090000 is held, the tables and the admin_events
 * Bridge columns don't exist: those reads say `no-signal` and the screen shows "No signal yet" (BR-xx93), never an
 * error page. PostgREST returns at most 1,000 rows a request, so window reads page with `.range` up to a hard cap
 * and say `truncated` past it; `.in()` lists go in chunks of 100 so the URL stays short.
 */

type Db = SupabaseClient;
type DbError = { code?: string | null; message?: string | null } | null;

function db(): Db {
  // The five tables aren't in the generated types while the migration is held; read them untyped, as the route does.
  return createAdminClient() as unknown as Db;
}

const PAGE_SIZE = 1000;
const HOUR_MS = 3_600_000;
const IN_CHUNK = 100;
/** The most hourly rows one screen reads. A few hundred rows an hour (plan §4.5) is a day in about 5,000. */
export const HOURLY_CAP = 6000;

/**
 * The rest of clubhouse_signal_hourly's primary key after (bucket_hour, code). Paging with LIMIT/OFFSET needs a total
 * order: rows tied on the first keys come back in any order per call, so a row at a page edge can be read twice or
 * not at all. Once the held migration 20261128090000 is applied, route sits in the key after page_id.
 */
export const HOURLY_KEY_TAIL = ['kind', 'outcome', 'act', 'page_id', 'role', 'platform', 'release'] as const;
const HOURLY_KEY_TAIL_WITH_ROUTE = ['kind', 'outcome', 'act', 'page_id', 'route', 'role', 'platform', 'release'] as const;

/** Appends the rest of the key to a query already ordered by bucket_hour and code. */
export function orderByHourlyKeyTail<Q extends { order: (c: string) => Q }>(q: Q, withRoute = false): Q {
  return (withRoute ? HOURLY_KEY_TAIL_WITH_ROUTE : HOURLY_KEY_TAIL).reduce((acc, c) => acc.order(c), q);
}

/**
 * Whether to read the route column (the screen a row fired on). Until the held migration 20261128090000 is applied it
 * isn't there: the first read that asks for it is refused (42703, or PGRST204), the same read runs again without it,
 * and the column isn't asked for again for a while, so a screen costs one refused read per server instance per
 * ROUTE_RETRY_MS, not one per page view.
 */
export const ROUTE_RETRY_MS = 10 * 60_000;
const ROUTE_MISSING = new Set(['42703', 'PGRST204']);
let routeMissingUntil = 0;

/** Tests only: forget that the route column was missing. */
export function resetRouteColumnForTests(): void {
  routeMissingUntil = 0;
}

function isRouteMissing(error: DbError): boolean {
  if (!error) return false;
  if (error.code && ROUTE_MISSING.has(error.code)) return /route/i.test(error.message ?? 'route');
  return /column .*route.* does not exist/i.test(error.message ?? '');
}

/**
 * Runs an hourly read with the route column while it may be there, and once more without it when the database says
 * it isn't.
 */
async function withRouteColumn<T>(read: (withRoute: boolean, refused: (error: DbError) => void) => Promise<LiveRead<T>>): Promise<LiveRead<T>> {
  if (Date.now() < routeMissingUntil) return read(false, () => {});
  let missing = false;
  const first = await read(true, (error) => {
    if (isRouteMissing(error)) missing = true;
  });
  if (!missing) return first;
  routeMissingUntil = Date.now() + ROUTE_RETRY_MS;
  return read(false, () => {});
}
export const EVENT_CAP = 3000;

const HOURLY_COLUMNS =
  'bucket_hour, code, kind, outcome, act, role, platform, release, bridge_id, page_id, signal_count, user_ids, duration_buckets, last_at';
const hourlyColumns = (withRoute: boolean) => (withRoute ? `${HOURLY_COLUMNS}, route` : HOURLY_COLUMNS);
const SESSION_COLUMNS = 'session_id, user_id, role, team_id, platform, release, started_at, last_at, ended_at, pages, signal_count, failure_count, replay_id';
const EVENT_COLUMNS =
  'session_id, seq, sent_at, kind, outcome, code, bridge_id, page_id, act, action_id, control_id, duration_ms, server_code, message, trail, drift';

function fail<T>(error: DbError, empty: T): LiveRead<T> {
  const state = classifyReadError(error);
  return state === 'no-signal' ? { state, data: empty } : { state: 'error', data: empty, error: error?.message ?? 'read failed' };
}

function normalizeHourly(r: Record<string, unknown>): HourlyRow {
  return {
    ...(r as unknown as HourlyRow),
    signal_count: Number(r.signal_count ?? 0),
    user_ids: Array.isArray(r.user_ids) ? (r.user_ids as string[]) : [],
    duration_buckets: Array.isArray(r.duration_buckets) ? (r.duration_buckets as number[]).map(Number) : [],
    // Absent while the route column isn't there; '' when the row's screen wasn't told.
    route: typeof r.route === 'string' ? r.route : undefined,
  };
}

/** Page a query with `.range` until it runs dry or reaches `cap`. */
async function paged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: DbError }>,
  cap: number,
  map: (r: Record<string, unknown>) => T,
  refused: (error: DbError) => void = () => {},
): Promise<LiveRead<T[]>> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, cap) - 1;
    const { data, error } = await run(from, to);
    if (error) {
      refused(error);
      return fail(error, []);
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows.map(map));
    if (rows.length < to - from + 1) return { state: 'ok', data: out };
  }
  return { state: 'ok', data: out, truncated: true };
}

function chunks<T>(list: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Hourly rows from the hour `sinceIso` falls in (and before the hour `untilIso` falls in), optionally one release. Newest
 * hours first. Both bounds snap to the top of the hour (`hourFloorIso`), so a window is whole buckets, never a partial
 * one dropped.
 */
export async function readHourly(o: {
  sinceIso?: string;
  untilIso?: string;
  release?: string;
  kinds?: string[];
  /** Only these pages' rows. */
  pages?: string[];
  /** Oldest hours first (a search forward in time); newest first otherwise. */
  ascending?: boolean;
  /** Only error rows (a crash, or an action that ended in failure): the counters a failure count needs, far fewer rows. */
  failuresOnly?: boolean;
  cap?: number;
}): Promise<LiveRead<HourlyRow[]>> {
  try {
    const client = db();
    return await withRouteColumn((withRoute, refused) =>
      paged(
        (from, to) => {
          let q = client.from('clubhouse_signal_hourly').select(hourlyColumns(withRoute));
          if (o.sinceIso) q = q.gte('bucket_hour', hourFloorIso(o.sinceIso));
          if (o.untilIso) q = q.lt('bucket_hour', hourFloorIso(o.untilIso));
          if (o.release) q = q.eq('release', o.release);
          if (o.kinds?.length) q = q.in('kind', o.kinds);
          if (o.pages?.length) q = q.in('page_id', o.pages);
          if (o.failuresOnly) q = q.or('kind.eq.crash,outcome.eq.failure');
          return orderByHourlyKeyTail(q.order('bucket_hour', { ascending: Boolean(o.ascending) }).order('code'), withRoute).range(from, to);
        },
        o.cap ?? HOURLY_CAP,
        normalizeHourly,
        refused,
      ),
    );
  } catch (e) {
    return { state: 'error', data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Hourly rows for exact hours: R-01's same hour on each of the previous four weeks. */
export async function readHourlyAt(hoursIso: readonly string[]): Promise<LiveRead<HourlyRow[]>> {
  if (!hoursIso.length) return { state: 'ok', data: [] };
  try {
    const client = db();
    return await withRouteColumn((withRoute, refused) =>
      paged(
        (from, to) =>
          orderByHourlyKeyTail(client.from('clubhouse_signal_hourly').select(hourlyColumns(withRoute)).in('bucket_hour', [...hoursIso]).order('bucket_hour').order('code'), withRoute).range(from, to),
        HOURLY_CAP,
        normalizeHourly,
        refused,
      ),
    );
  } catch (e) {
    return { state: 'error', data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** When the newest envelope arrived (R-09): one row. */
export async function readLastEnvelope(): Promise<LiveRead<string | null>> {
  try {
    const { data, error } = await db().from('clubhouse_signal_hourly').select('last_at').order('last_at', { ascending: false }).limit(1);
    if (error) return fail(error, null);
    return { state: 'ok', data: ((data ?? [])[0] as { last_at?: string } | undefined)?.last_at ?? null };
  } catch (e) {
    return { state: 'error', data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function readSessions(o: {
  sinceIso?: string;
  userId?: string;
  teamId?: string;
  failedOnly?: boolean;
  release?: string;
  limit?: number;
}): Promise<LiveRead<SessionRow[]>> {
  try {
    let q = db().from('clubhouse_sessions').select(SESSION_COLUMNS);
    if (o.sinceIso) q = q.gte('last_at', o.sinceIso);
    if (o.userId) q = q.eq('user_id', o.userId);
    if (o.teamId) q = q.eq('team_id', o.teamId);
    if (o.release) q = q.eq('release', o.release);
    if (o.failedOnly) q = q.gt('failure_count', 0);
    const limit = Math.min(o.limit ?? 200, PAGE_SIZE);
    const { data, error } = await q.order('last_at', { ascending: false }).limit(limit);
    if (error) return fail(error, []);
    const rows = (data ?? []) as SessionRow[];
    return { state: 'ok', data: rows, truncated: rows.length === limit };
  } catch (e) {
    return { state: 'error', data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function readSession(id: string): Promise<LiveRead<SessionRow | null>> {
  try {
    const { data, error } = await db().from('clubhouse_sessions').select(SESSION_COLUMNS).eq('session_id', id).maybeSingle();
    if (error) return fail(error, null);
    return { state: 'ok', data: (data as SessionRow | null) ?? null };
  } catch (e) {
    return { state: 'error', data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Events of these sessions, in order. Only sessions with a failure keep events (plan §4.5). */
export async function readSessionEvents(sessionIds: readonly string[], cap = EVENT_CAP): Promise<LiveRead<SessionEventRow[]>> {
  if (!sessionIds.length) return { state: 'ok', data: [] };
  const out: SessionEventRow[] = [];
  let truncated = false;
  try {
    const client = db();
    for (const ids of chunks(sessionIds)) {
      const read = await paged(
        (from, to) => client.from('clubhouse_session_events').select(EVENT_COLUMNS).in('session_id', ids).order('session_id').order('seq').range(from, to),
        cap - out.length,
        (r) => ({ ...(r as unknown as SessionEventRow), drift: Array.isArray(r.drift) ? (r.drift as string[]) : [] }),
      );
      if (read.state !== 'ok') return { ...read, data: out };
      out.push(...read.data);
      if (read.truncated || out.length >= cap) {
        truncated = true;
        break;
      }
    }
    return { state: 'ok', data: out, truncated };
  } catch (e) {
    return { state: 'error', data: out, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The sessions whose kept events ran this action (B04's "Sessions", BR-0406). Only sessions with a failure keep
 * their events (plan §4.5), so this finds those, not every session that pressed it. Newest first, capped.
 */
export async function readSessionIdsForAction(actionId: string, o: { sinceIso?: string; cap?: number } = {}): Promise<LiveRead<string[]>> {
  try {
    let q = db().from('clubhouse_session_events').select('session_id').eq('action_id', actionId);
    if (o.sinceIso) q = q.gte('sent_at', o.sinceIso);
    const limit = Math.min(o.cap ?? PAGE_SIZE, PAGE_SIZE);
    const { data, error } = await q.order('sent_at', { ascending: false }).limit(limit);
    if (error) return fail(error, []);
    const rows = (data ?? []) as Array<{ session_id: string }>;
    return { state: 'ok', data: [...new Set(rows.map((r) => r.session_id))], truncated: rows.length === limit };
  } catch (e) {
    return { state: 'error', data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function readDrift(sinceIso: string): Promise<LiveRead<DriftRow[]>> {
  try {
    const { data, error } = await db().from('clubhouse_drift').select('kind, code, release, drift_count, first_seen, last_seen').gte('last_seen', sinceIso).order('last_seen', { ascending: false }).limit(PAGE_SIZE);
    if (error) return fail(error, []);
    return { state: 'ok', data: ((data ?? []) as DriftRow[]).map((d) => ({ ...d, drift_count: Number(d.drift_count) })) };
  } catch (e) {
    return { state: 'error', data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The Bridge's open notes (bridge_notes): codes marked expected, watched codes and the Duet desk's queue. Archived,
 * unmarked and stopped rows are not read. A super admin's own state, so it is small; capped at one page.
 */
export async function readNotes(): Promise<LiveRead<NotesIndex>> {
  try {
    const { data, error } = await db().from('bridge_notes').select(NOTE_COLUMNS).is('resolved_at', null).order('created_at', { ascending: false }).limit(PAGE_SIZE);
    if (error) return fail(error, EMPTY_NOTES);
    const rows = (data ?? []) as BridgeNoteRow[];
    return { state: 'ok', data: indexNotes(rows), truncated: rows.length === PAGE_SIZE };
  } catch (e) {
    return { state: 'error', data: EMPTY_NOTES, error: e instanceof Error ? e.message : String(e) };
  }
}

/** How far back the release a pack was sent against is looked for on its page, and how many rows each search reads. */
const PACK_BEFORE_MS = 7 * 24 * HOUR_MS;
const PACK_SEARCH_CAP = 1000;

/**
 * Where one sent pack stands (B13's queue). Three narrow reads, all on the pack's page: the releases already in use
 * there when it was sent (the week before, newest first), the first release used there after (oldest first, from the
 * next hour), and that release's rows. A pack with no page or no failure codes is just "sent" and reads nothing.
 */
export async function readPackVerdict(i: { sentAt: string; page: string | null; codes: readonly string[] }): Promise<LiveRead<PackVerdict>> {
  const none = (status: PackVerdict['status']): PackVerdict => ({ status, release: null, firing: 0 });
  if (!i.codes.length || !i.page) return { state: 'ok', data: none('sent') };
  const hour = sentHour(i.sentAt);
  if (!Number.isFinite(hour)) return { state: 'ok', data: none('undecided') };
  const pages = [i.page];
  const next = new Date(hour + HOUR_MS).toISOString();
  const [before, after] = await Promise.all([
    readHourly({ sinceIso: new Date(hour - PACK_BEFORE_MS).toISOString(), untilIso: next, pages, cap: PACK_SEARCH_CAP }),
    readHourly({ sinceIso: next, pages, ascending: true, cap: PACK_SEARCH_CAP }),
  ]);
  for (const r of [before, after]) if (r.state !== 'ok') return { state: r.state, data: none('undecided'), error: r.error };
  const release = decidingRelease(before.data, after.data, i.sentAt);
  const rows = release ? await readHourly({ release, pages, cap: HOURLY_CAP }) : { state: 'ok' as const, data: [] as HourlyRow[] };
  if (rows.state !== 'ok') return { state: rows.state, data: none('undecided'), error: rows.error };
  return {
    state: 'ok',
    data: packVerdict({ codes: i.codes, release, searchTruncated: Boolean(after.truncated), rows: rows.data, rowsTruncated: Boolean(rows.truncated) }),
  };
}

export interface PersonName {
  name: string | null;
  email: string | null;
}

/**
 * D7: sessions store user ids only. Names and emails are read live, here, only when a super admin opens a session or
 * a person; lists and Copy reports never carry them. Coaches' names come from golf_coaches, players' from golf_players.
 */
export async function readPeopleNames(userIds: readonly string[]): Promise<Map<string, PersonName>> {
  const out = new Map<string, PersonName>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;
  try {
    const client = createAdminClient();
    for (const part of chunks(ids)) {
      const [users, coaches, players] = await Promise.all([
        client.from('users').select('id, email').in('id', part),
        client.from('golf_coaches').select('user_id, full_name').in('user_id', part),
        client.from('golf_players').select('user_id, first_name, last_name').in('user_id', part),
      ]);
      // A failed read leaves those people unnamed (the screen shows the short id); it never stops the page.
      if (!users.error) for (const u of users.data ?? []) out.set(u.id, { name: null, email: u.email });
      const setName = (id: string | null, name: string | null) => {
        if (!id || !name) return;
        out.set(id, { name, email: out.get(id)?.email ?? null });
      };
      if (!coaches.error) for (const c of coaches.data ?? []) setName(c.user_id, c.full_name);
      if (!players.error) for (const p of players.data ?? []) setName(p.user_id, [p.first_name, p.last_name].filter(Boolean).join(' ') || null);
    }
  } catch {
    // A name that can't be read shows as the short id; the screen still works.
  }
  return out;
}

export async function readTeamName(teamId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().from('golf_teams').select('name').eq('id', teamId).maybeSingle();
    // Unreadable is "no name": the caller prints the team's pseudonym instead.
    if (error) return null;
    return data?.name ?? null;
  } catch {
    return null;
  }
}

const ADMIN_BRIDGE_COLUMNS = 'ch_code, bridge_id, page_id, action_id, control_id, release, platform, session_id, server_code';

/**
 * admin_events rows with their Bridge fields: the columns when the migration is applied, else only `metadata` (the
 * fields travel in `metadata.bridge` while it is held). A separate guarded read, so the incident page's own select
 * never names a column that may not exist.
 */
export async function readAdminBridgeRows(o: { fingerprint?: string; userId?: string; teamId?: string; sinceIso?: string; limit?: number }): Promise<LiveRead<Record<string, unknown>[]>> {
  const base = 'id, created_at, fingerprint, title, severity, resolved, user_id, metadata';
  const run = (cols: string) => {
    let q = db().from('admin_events').select(cols);
    if (o.fingerprint) q = q.eq('fingerprint', o.fingerprint);
    if (o.userId) q = q.eq('user_id', o.userId);
    if (o.teamId) q = q.eq('team_id', o.teamId);
    if (o.sinceIso) q = q.gte('created_at', o.sinceIso);
    return q.order('created_at', { ascending: false }).limit(Math.min(o.limit ?? 50, 200));
  };
  try {
    const first = await run(`${base}, ${ADMIN_BRIDGE_COLUMNS}`);
    if (!first.error) return { state: 'ok', data: (first.data ?? []) as unknown as Record<string, unknown>[] };
    if (classifyReadError(first.error) !== 'no-signal') return fail(first.error, []);
    const second = await run(base);
    if (second.error) return fail(second.error, []);
    return { state: 'ok', data: (second.data ?? []) as unknown as Record<string, unknown>[] };
  } catch (e) {
    return { state: 'error', data: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// The snapshot Pulse and the digest read: the rules over the last day
// ---------------------------------------------------------------------------

export interface LiveSnapshot {
  /** The worst read state: one table missing makes the whole snapshot "no signal yet". */
  state: LiveState;
  truncated: boolean;
  now: number;
  release: string | null;
  pipe: PipeStatus;
  alerts: BridgeAlert[];
  dayRows: HourlyRow[];
  baselineRows: HourlyRow[];
  drift: DriftRow[];
  failedSessions: SessionRow[];
  /** The failed sessions' events (the rules read them; a context pack reuses them rather than reading twice). */
  failedEvents: SessionEventRow[];
  /** The owner's open notes: expected codes (R-01 and R-02 skip them) and watched codes (Pulse, the digest). */
  notes: NotesIndex;
  errors: string[];
}

function worst(states: LiveState[]): LiveState {
  if (states.includes('error')) return 'error';
  if (states.includes('no-signal')) return 'no-signal';
  return 'ok';
}


/**
 * One read of everything the rules need: the last day, the week before it, the same hour four weeks back, the failed
 * sessions' events, drift and the pipe. Pulse and the digest both call this, so they cannot disagree.
 */
export async function readLiveSnapshot(graph: BridgeGraph, now: number = Date.now()): Promise<LiveSnapshot> {
  const flagOn = isFlagEnabled('clubhouse_signals', { skipTelemetry: true });
  const hour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const dayStart = new Date(now - 24 * HOUR_MS).toISOString();
  const weekStart = new Date(now - 8 * 24 * HOUR_MS).toISOString();
  const sameHours = [1, 2, 3, 4].map((w) => new Date(hour - w * 7 * 24 * HOUR_MS).toISOString());

  const [last, day, baseline, same, drift, sessions, notes] = await Promise.all([
    readLastEnvelope(),
    readHourly({ sinceIso: dayStart }),
    readHourly({ sinceIso: weekStart, untilIso: dayStart }),
    readHourlyAt(sameHours),
    readDrift(dayStart),
    readSessions({ sinceIso: dayStart, failedOnly: true, limit: 300 }),
    readNotes(),
  ]);
  const events = await readSessionEvents(sessions.data.map((s) => s.session_id));

  const stamped = liveRef();
  const release = stamped !== 'main' ? stamped : (day.data[0]?.release ?? null);
  const sameHourCount = same.data.reduce((a, r) => a + r.signal_count, 0);
  const pipe = pipeStatus({
    flagOn,
    state: last.state,
    lastEnvelopeAt: last.data,
    now,
    activeHours: isActiveHour(now, same.state === 'ok' && same.data.length ? sameHourCount : null),
  });
  // Notes are the owner's own state, not signal: a missing table does not make the snapshot "no signal", but a failed
  // read does make it an error, and then nothing counts as expected (the rules fire more, never less).
  const state = worst([last.state, day.state, baseline.state, same.state, drift.state, sessions.state, events.state, notes.state === 'error' ? 'error' : 'ok']);
  const notesIndex = notes.state === 'ok' ? notes.data : EMPTY_NOTES;
  const alerts =
    state === 'no-signal'
      ? []
      : runRules({
          now,
          release,
          hourRows: day.data.filter((r) => Date.parse(r.bucket_hour) === hour),
          sameHourRows: same.data,
          dayRows: day.data,
          baselineRows: baseline.data,
          events: events.data,
          drift: drift.data,
          pipe,
          categoryOf: categoryLookup(graph),
          expectedCodes: new Set(notesIndex.expected.keys()),
        });
  return {
    state,
    truncated: Boolean(day.truncated || baseline.truncated || events.truncated || sessions.truncated),
    now,
    release,
    pipe,
    alerts,
    dayRows: day.data,
    baselineRows: baseline.data,
    drift: drift.data,
    failedSessions: sessions.data,
    failedEvents: events.data,
    notes: notesIndex,
    errors: [last, day, baseline, same, drift, sessions, events, notes].map((r) => r.error).filter((e): e is string => Boolean(e)),
  };
}

/** The pipe alone, for a screen's truth line. */
export async function readPipe(now: number = Date.now()): Promise<PipeStatus> {
  const flagOn = isFlagEnabled('clubhouse_signals', { skipTelemetry: true });
  const last = await readLastEnvelope();
  return pipeStatus({ flagOn, state: last.state, lastEnvelopeAt: last.data, now, activeHours: isActiveHour(now, null) });
}
