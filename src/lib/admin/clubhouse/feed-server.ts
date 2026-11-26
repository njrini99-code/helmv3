import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { classifyReadError, hourFloorIso, type LiveRead, type LiveState, type SessionEventRow, type SessionRow } from './live-model';
import type { ErrorLogRow } from './feed';

/**
 * The error feed's reads (B19, B21's database errors; plan 2026-11-26-bridge-spaces-build.md), through the service
 * role. Every caller is a page behind `requireSuperAdmin()`; nothing here checks a role itself.
 *
 * Failures are read from `clubhouse_session_events` directly (kind crash or outcome failure), newest first, paged with
 * `.range` to a hard cap and `truncated` past it, never through the session list (capped at 1,000 sessions ordered by
 * activity, which would drop failures silently). Same read conventions as live.ts: a missing table is `no-signal`,
 * `.in()` lists go in chunks of 100.
 */

type DbError = { code?: string | null; message?: string | null } | null;

function db(): SupabaseClient {
  // The Bridge tables aren't all in the generated types; read them untyped, as live.ts does.
  return createAdminClient() as unknown as SupabaseClient;
}

const PAGE_SIZE = 1000;
const IN_CHUNK = 100;
/** The most failures one feed reads: a bad week is a few thousand. */
export const FAILURE_CAP = 5000;
/** The most hourly failure rows the "new in this release" test reads. */
export const NEW_CODE_CAP = 6000;

const EVENT_COLUMNS = 'session_id, seq, sent_at, kind, outcome, code, bridge_id, page_id, act, action_id, control_id, duration_ms, server_code, message, trail, drift';
const SESSION_COLUMNS = 'session_id, user_id, role, team_id, platform, release, started_at, last_at, ended_at, pages, signal_count, failure_count, replay_id';
const FAILURE_FILTER = 'kind.eq.crash,outcome.eq.failure';

function fail<T>(error: DbError, empty: T): LiveRead<T> {
  const state = classifyReadError(error);
  return state === 'no-signal' ? { state, data: empty } : { state: 'error', data: empty, error: error?.message ?? 'read failed' };
}

function thrown<T>(e: unknown, empty: T): LiveRead<T> {
  return { state: 'error', data: empty, error: e instanceof Error ? e.message : String(e) };
}

function chunks<T>(list: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function paged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: DbError }>,
  cap: number,
  map: (r: Record<string, unknown>) => T,
): Promise<LiveRead<T[]>> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, cap) - 1;
    const { data, error } = await run(from, to);
    if (error) return fail(error, []);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows.map(map));
    if (rows.length < to - from + 1) return { state: 'ok', data: out };
  }
  return { state: 'ok', data: out, truncated: true };
}

const eventRow = (r: Record<string, unknown>): SessionEventRow => ({
  ...(r as unknown as SessionEventRow),
  seq: Number(r.seq),
  duration_ms: r.duration_ms === null || r.duration_ms === undefined ? null : Number(r.duration_ms),
  trail: Array.isArray(r.trail) ? (r.trail as string[]) : null,
  drift: Array.isArray(r.drift) ? (r.drift as string[]) : [],
});

/** Every failure since `sinceIso`, newest first. */
export async function readFailureEvents(o: { sinceIso: string; cap?: number }): Promise<LiveRead<SessionEventRow[]>> {
  try {
    const client = db();
    return await paged(
      (from, to) =>
        client
          .from('clubhouse_session_events')
          .select(EVENT_COLUMNS)
          .gte('sent_at', o.sinceIso)
          .or(FAILURE_FILTER)
          .order('sent_at', { ascending: false })
          .order('session_id')
          .order('seq', { ascending: false })
          .range(from, to),
      o.cap ?? FAILURE_CAP,
      eventRow,
    );
  } catch (e) {
    return thrown(e, []);
  }
}

/** One event, for a stored `?e=` link whose failure is outside the loaded window. */
export async function readEventByKey(sessionId: string, seq: number): Promise<LiveRead<SessionEventRow | null>> {
  try {
    const { data, error } = await db().from('clubhouse_session_events').select(EVENT_COLUMNS).eq('session_id', sessionId).eq('seq', seq).maybeSingle();
    if (error) return fail(error, null);
    return { state: 'ok', data: data ? eventRow(data as Record<string, unknown>) : null };
  } catch (e) {
    return thrown(e, null);
  }
}

/** The sessions these failures belong to (role, platform, release, team, user). */
export async function readSessionsByIds(ids: readonly string[]): Promise<LiveRead<SessionRow[]>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { state: 'ok', data: [] };
  const out: SessionRow[] = [];
  try {
    const client = db();
    for (const part of chunks(unique)) {
      const { data, error } = await client.from('clubhouse_sessions').select(SESSION_COLUMNS).in('session_id', part);
      if (error) return { ...fail(error, []), data: out };
      out.push(...((data ?? []) as SessionRow[]));
    }
    return { state: 'ok', data: out };
  } catch (e) {
    return thrown(e, out);
  }
}

/** Team names by id (golf_teams.name). A team that can't be read is left out; the screen says "no team". */
export async function readTeamNames(ids: readonly string[]): Promise<LiveRead<Map<string, string>>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { state: 'ok', data: out };
  try {
    const client = createAdminClient();
    for (const part of chunks(unique)) {
      const { data, error } = await client.from('golf_teams').select('id, name').in('id', part);
      if (error) return { state: 'error', data: out, error: error.message };
      for (const t of data ?? []) out.set(t.id, t.name);
    }
    return { state: 'ok', data: out };
  } catch (e) {
    return thrown(e, out);
  }
}

/** Failure rows' code and release from the hourly store since `sinceIso`: the input to "new in this release". */
export async function readFailureCodeReleases(sinceIso: string, cap = NEW_CODE_CAP): Promise<LiveRead<Array<{ code: string; release: string; at: string; page_id: string }>>> {
  try {
    const client = db();
    return await paged(
      (from, to) =>
        client
          .from('clubhouse_signal_hourly')
          .select('code, release, bucket_hour, page_id')
          .gte('bucket_hour', hourFloorIso(sinceIso))
          .or(FAILURE_FILTER)
          .order('bucket_hour', { ascending: false })
          .order('code')
          // The rest of the table's key: a total order, so paging never skips or repeats a row (live.ts).
          .order('kind').order('outcome').order('act').order('page_id').order('role').order('platform').order('release')
          .range(from, to),
      cap,
      (r) => ({ code: String(r.code ?? ''), release: String(r.release ?? ''), at: String(r.bucket_hour ?? ''), page_id: String(r.page_id ?? '') }),
    );
  } catch (e) {
    return thrown(e, []);
  }
}

/**
 * The error log's rows (`admin_events`) for one session. `session_id` and `ch_code` are Bridge columns; while they
 * are missing the read is `no-signal` and the screen says it could not tell.
 */
export async function readErrorLogForSession(sessionId: string): Promise<LiveRead<ErrorLogRow[]>> {
  try {
    const { data, error } = await db().from('admin_events').select('id, fingerprint, ch_code').eq('session_id', sessionId).limit(50);
    if (error) return fail(error, []);
    return { state: 'ok', data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), fingerprint: (r.fingerprint as string | null) ?? null, ch_code: (r.ch_code as string | null) ?? null })) };
  } catch (e) {
    return thrown(e, []);
  }
}

export interface FailureRead {
  state: LiveState;
  truncated: boolean;
  events: SessionEventRow[];
  sessions: SessionRow[];
  teamNames: Map<string, string>;
  errors: string[];
}

function worst(states: LiveState[]): LiveState {
  if (states.includes('error')) return 'error';
  if (states.includes('no-signal')) return 'no-signal';
  return 'ok';
}

/** Failures since `sinceIso` with their sessions and team names: the feed's and Speed's one read. */
export async function readFailures(sinceIso: string): Promise<FailureRead> {
  const events = await readFailureEvents({ sinceIso });
  const sessions = await readSessionsByIds(events.data.map((e) => e.session_id));
  const teams = await readTeamNames(sessions.data.map((s) => s.team_id ?? '').filter(Boolean));
  return {
    // A team name that can't be read is not a failed feed: the row shows "no team name".
    state: worst([events.state, sessions.state]),
    truncated: Boolean(events.truncated),
    events: events.data,
    sessions: sessions.data,
    teamNames: teams.data,
    errors: [events, sessions, teams].map((r) => r.error).filter((e): e is string => Boolean(e)),
  };
}
