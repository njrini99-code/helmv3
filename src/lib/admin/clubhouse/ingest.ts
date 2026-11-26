/**
 * Turning one parsed, redacted batch into what `/api/ch/signal` stores (plan §4.5).
 *
 * Pure: no database, no clock of its own. The route parses and redacts (signal.ts), calls `buildIngest`, then sends
 * each session's plan to `clubhouse_ingest_signals` and writes or stamps the `admin_events` rows. Keeping it pure keeps
 * every rule here testable offline.
 *
 * - Every envelope adds one to its hourly row (hour × code × kind × outcome × act × page × role × platform × release),
 *   with a duration histogram whose edges match `clubhouse_bucket_quantile`.
 * - A session's row counts what it sent; its timeline is stored by the database only once the session has a failure.
 * - A failure the client did not already report becomes an `admin_events` row (one error store, DECISIONS 5). A failure
 *   it did report through `chReport` is matched to that row by session and seq and stamped with the Bridge columns.
 * - Drift is counted over the batch's own envelopes, never over context (which was counted when first sent).
 */
import type { BridgeGraph, BridgeId } from './graph';
import { actionIndex, countDrift, type DriftKind, resolveSignal, type ResolvedSignal, silentActions } from './resolve';
import { type ChSignal, isFailureSignal } from './signal';

/** Upper edges (ms) of the 17 duration buckets; the last holds everything over 60 s (the envelope caps at 600 s). */
export const DURATION_EDGES_MS = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10_000, 20_000, 30_000, 60_000, 600_000] as const;

/** At most this many `admin_events` rows from one batch; the rest are still counted hourly and kept in the timeline. */
export const MAX_ADMIN_ROWS_PER_BATCH = 5;

/** How far a client's clock may sit from the server's before its envelopes are read at the server's time. */
export const CLOCK_PAST_MS = 24 * 60 * 60 * 1000;
export const CLOCK_FUTURE_MS = 5 * 60 * 1000;

export function durationBucket(ms: number): number {
  const i = DURATION_EDGES_MS.findIndex((edge) => ms <= edge);
  return i === -1 ? DURATION_EDGES_MS.length - 1 : i;
}

/** The start of the UTC hour `at` falls in, as ISO. */
export function hourOf(at: number): string {
  const d = new Date(at);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

export interface HourlyRow {
  hour: string;
  code: string;
  kind: ChSignal['kind'];
  outcome: string;
  act: string;
  page_id: string;
  role: ChSignal['role'];
  platform: ChSignal['platform'];
  release: string;
  bridge_id: BridgeId | null;
  count: number;
  user_ids: string[];
  buckets: number[];
  first_at: string;
  last_at: string;
}

export interface SessionRow {
  session_id: string;
  user_id: string | null;
  role: ChSignal['role'];
  team_id: string | null;
  platform: ChSignal['platform'];
  release: string;
  first_at: string;
  last_at: string;
  ended: boolean;
  pages: string[];
  count: number;
  failures: number;
  replay_id: string | null;
}

export interface EventRow {
  seq: number;
  at: string;
  kind: ChSignal['kind'];
  outcome: string | null;
  code: string | null;
  bridge_id: BridgeId | null;
  page_id: string;
  act: string | null;
  action_id: string | null;
  control_id: string | null;
  duration_ms: number | null;
  server_code: string | null;
  message: string | null;
  trail: string[] | null;
  drift: DriftKind[];
}

export interface DriftRow {
  kind: DriftKind;
  code: string;
  release: string;
  count: number;
  first_seen: string;
  last_seen: string;
}

/** The `p_batch` argument of `clubhouse_ingest_signals`, one per session in the batch. */
export interface SessionPlan {
  hourly: HourlyRow[];
  session: SessionRow;
  events: EventRow[];
  drift: DriftRow[];
}

/** The Bridge's columns on an `admin_events` row (added by the held migration). */
export interface BridgeColumns {
  ch_code: string | null;
  bridge_id: BridgeId | null;
  page_id: string;
  action_id: string | null;
  control_id: string | null;
  release: string;
  platform: string;
  session_id: string;
  server_code: string | null;
}

/** A failure nobody reported yet: written as a new `admin_events` row. */
export interface AdminFailure {
  signal: ChSignal;
  resolved: ResolvedSignal;
  /** The catalog code it counts under: the resolved row's CH code, else its Bridge ID, else what was sent. */
  code: string;
  title: string;
  severity: 'error' | 'warning';
  columns: BridgeColumns;
}

/** A failure `chReport` already wrote through `/api/log-error`: its row is found by session and seq and stamped. */
export interface AdminStamp {
  sessionId: string;
  seq: number;
  columns: BridgeColumns;
}

export interface IngestPlan {
  sessions: SessionPlan[];
  adminRows: AdminFailure[];
  stamps: AdminStamp[];
  /** Failures past MAX_ADMIN_ROWS_PER_BATCH: counted, not written. */
  adminCapped: number;
}

export interface IngestInput {
  signals: ChSignal[];
  context: ChSignal[];
  ended: boolean;
  graph: BridgeGraph;
  /** The signed-in user the server verified; the envelope's own `userId` is never trusted. */
  userId: string | null;
  /** The server's clock, for envelopes whose client clock is far off. */
  now: number;
  /**
   * The release this deploy serves (NEXT_PUBLIC_SENTRY_RELEASE). A client's release that differs is stored as 'other',
   * so a made-up release can't mint hourly and drift rows (security review of #2611, M3). Unset: kept as sent.
   */
  serverRelease?: string | null;
}

/** Drift rows one session's batch may add; the rest are still in the session's events. */
export const MAX_DRIFT_ROWS_PER_BATCH = 5;
const CONTROL_ID = /^CTL-P\d{3}-\d{3,}$/;
/** The metrics a vital names in `act` (E8, use-signals.ts). */
const VITAL_ACTS: ReadonlySet<string> = new Set(['INP', 'LCP', 'CLS']);

function clampAt(at: number, now: number): number {
  return at < now - CLOCK_PAST_MS || at > now + CLOCK_FUTURE_MS ? now : at;
}

function codeFor(s: ChSignal, r: ResolvedSignal, graph: BridgeGraph): string {
  if (s.code !== undefined) return s.code;
  if (r.bridgeId === null) return '';
  return graph.ids[r.bridgeId]?.ch ?? String(r.bridgeId);
}

/** The code an `admin_events` row and its title name: the resolved row's own, so a generic save failure on a known action reads as that action's code. */
function catalogCode(s: ChSignal, r: ResolvedSignal, graph: BridgeGraph): string {
  if (r.bridgeId !== null) return graph.ids[r.bridgeId]?.ch ?? String(r.bridgeId);
  return s.code ?? '';
}

function columnsFor(s: ChSignal, r: ResolvedSignal, graph: BridgeGraph): BridgeColumns {
  const code = catalogCode(s, r, graph);
  return {
    ch_code: code || null,
    bridge_id: r.bridgeId,
    page_id: s.page,
    action_id: r.actionId,
    control_id: s.control ?? null,
    release: s.release,
    platform: s.platform,
    session_id: s.sessionId,
    server_code: s.serverCode ?? null,
  };
}

function titleFor(s: ChSignal, r: ResolvedSignal, graph: BridgeGraph, code: string): string {
  const meaning = r.bridgeId !== null ? graph.ids[r.bridgeId]?.meaning : undefined;
  const what = meaning ?? (s.kind === 'crash' ? 'A Clubhouse section crashed' : 'A Clubhouse action failed');
  return (code ? `${what} (${code})` : what).slice(0, 500);
}

function addHourly(rows: Map<string, HourlyRow>, s: ChSignal, r: ResolvedSignal, at: number, graph: BridgeGraph, userId: string | null): void {
  const row: Omit<HourlyRow, 'count' | 'user_ids' | 'buckets' | 'first_at' | 'last_at'> = {
    hour: hourOf(at),
    code: r.bridgeId === null && s.code !== undefined ? 'unknown' : codeFor(s, r, graph),
    kind: s.kind,
    outcome: s.outcome ?? '',
    // Only keys the graph knows go into the hourly key: an unknown act, control or code is one bucket, not a new row each.
    // A vital keeps its metric (INP, LCP, CLS): without it the three would merge into one CH-1954 histogram (B09, R-12).
    act: r.actionId && s.act ? s.act : s.kind === 'vital' && s.act && VITAL_ACTS.has(s.act) ? s.act : s.control && CONTROL_ID.test(s.control) ? s.control : '',
    page_id: s.page,
    role: s.role,
    platform: s.platform,
    release: s.release,
    bridge_id: r.bridgeId,
  };
  // One row per key in a batch: ON CONFLICT DO UPDATE cannot touch the same row twice in one statement.
  const key = [row.hour, row.code, row.kind, row.outcome, row.act, row.page_id, row.role, row.platform, row.release].join('|');
  const iso = new Date(at).toISOString();
  let out = rows.get(key);
  if (!out) {
    out = { ...row, count: 0, user_ids: [], buckets: [], first_at: iso, last_at: iso };
    rows.set(key, out);
  }
  out.count += 1;
  if (iso < out.first_at) out.first_at = iso;
  if (iso > out.last_at) out.last_at = iso;
  if (out.bridge_id === null && r.bridgeId !== null) out.bridge_id = r.bridgeId;
  if (userId && !out.user_ids.includes(userId)) out.user_ids.push(userId);
  if (s.durationMs !== undefined) {
    if (out.buckets.length === 0) out.buckets = DURATION_EDGES_MS.map(() => 0);
    const i = durationBucket(s.durationMs);
    out.buckets[i] = (out.buckets[i] ?? 0) + 1;
  }
}

function eventFor(s: ChSignal, r: ResolvedSignal, at: number, graph: BridgeGraph, drift: DriftKind[]): EventRow {
  const code = codeFor(s, r, graph);
  return {
    seq: s.seq,
    at: new Date(at).toISOString(),
    kind: s.kind,
    outcome: s.outcome ?? null,
    code: code || null,
    bridge_id: r.bridgeId,
    page_id: s.page,
    act: s.act ?? null,
    action_id: r.actionId,
    control_id: s.control ?? null,
    duration_ms: s.durationMs ?? null,
    server_code: s.serverCode ?? null,
    message: s.message ?? null,
    trail: s.trail ?? null,
    drift,
  };
}

function groupBySession(signals: ChSignal[]): Map<string, ChSignal[]> {
  const out = new Map<string, ChSignal[]>();
  for (const s of signals) out.set(s.sessionId, [...(out.get(s.sessionId) ?? []), s]);
  return out;
}

/**
 * Silent actions inside this batch: a start with no outcome 30 s or more before the batch's newest envelope (the
 * client's own clock on both sides, so skew can't fake one). A start whose outcome lands in a later batch is not
 * caught here; pairing across batches needs the session's open starts kept server-side, which is PR 2's.
 */
function silentInBatch(session: ChSignal[], ended: boolean): Set<ChSignal> {
  const newest = Math.max(...session.map((s) => s.at));
  return new Set(silentActions(session, { now: newest, pagehideAt: ended ? newest : undefined }));
}

export function buildIngest(input: IngestInput): IngestPlan {
  const { graph, userId, now } = input;
  const release = (sent: string) => (input.serverRelease && sent !== input.serverRelease ? 'other' : sent);
  const normalize = (list: ChSignal[]) => list.map((x) => (x.release === release(x.release) ? x : { ...x, release: release(x.release) }));
  const signals = normalize(input.signals);
  const context = normalize(input.context);
  const actions = actionIndex(graph);
  const sessions: SessionPlan[] = [];
  const adminRows: AdminFailure[] = [];
  const stamps: AdminStamp[] = [];
  let adminCapped = 0;

  const contextBySession = groupBySession(context);
  for (const [sessionId, batch] of groupBySession(signals)) {
    const ordered = [...batch].sort((a, b) => a.seq - b.seq);
    const silent = silentInBatch(ordered, input.ended);
    const hourly = new Map<string, HourlyRow>();
    const events = new Map<number, EventRow>();
    const driftItems: { signal: ChSignal; drift: DriftKind[] }[] = [];
    const pages = new Set<string>();
    let failures = 0;
    let first = Infinity;
    let last = -Infinity;

    // Context first, so a seq sent twice keeps the batch's own copy.
    for (const s of contextBySession.get(sessionId) ?? []) {
      const at = clampAt(s.at, now);
      events.set(s.seq, eventFor(s, resolveSignal(s, graph, actions), at, graph, []));
    }

    for (const s of ordered) {
      const at = clampAt(s.at, now);
      const r = resolveSignal(s, graph, actions);
      const drift: DriftKind[] = silent.has(s) ? [...r.drift, 'silent-action'] : r.drift;
      addHourly(hourly, s, r, at, graph, userId);
      events.set(s.seq, eventFor(s, r, at, graph, drift));
      // A silent start has no code of its own; its drift row names the action instead.
      if (r.drift.length) driftItems.push({ signal: { ...s, at }, drift: r.drift });
      if (silent.has(s)) driftItems.push({ signal: { ...s, at, code: s.code ?? s.act ?? s.control }, drift: ['silent-action'] });
      pages.add(s.page);
      first = Math.min(first, at);
      last = Math.max(last, at);

      if (!isFailureSignal(s)) continue;
      failures += 1;
      const columns = columnsFor(s, r, graph);
      if (s.reported) {
        stamps.push({ sessionId, seq: s.seq, columns });
        continue;
      }
      if (adminRows.length >= MAX_ADMIN_ROWS_PER_BATCH) {
        adminCapped += 1;
        continue;
      }
      const code = catalogCode(s, r, graph);
      adminRows.push({
        signal: s,
        resolved: r,
        code,
        title: titleFor(s, r, graph, code),
        severity: s.kind === 'crash' ? 'error' : 'warning',
        columns,
      });
    }

    const newest = ordered[ordered.length - 1];
    if (!newest) continue;
    sessions.push({
      hourly: [...hourly.values()],
      session: {
        session_id: sessionId,
        user_id: userId,
        role: newest.role,
        // A team is the client's word, so it is kept only for a signed-in sender (and the database drops an id that
        // names no team).
        team_id: userId ? ([...ordered].reverse().find((s) => s.teamId)?.teamId ?? null) : null,
        platform: newest.platform,
        release: newest.release,
        first_at: new Date(first).toISOString(),
        last_at: new Date(last).toISOString(),
        ended: input.ended,
        pages: [...pages].sort(),
        count: ordered.length,
        failures,
        replay_id: [...ordered].reverse().find((s) => s.replayId)?.replayId ?? null,
      },
      events: [...events.values()].sort((a, b) => a.seq - b.seq),
      drift: countDrift(driftItems).slice(0, MAX_DRIFT_ROWS_PER_BATCH).map((d) => ({
        kind: d.kind,
        code: d.code,
        release: d.release,
        count: d.count,
        first_seen: new Date(d.firstSeen).toISOString(),
        last_seen: new Date(d.lastSeen).toISOString(),
      })),
    });
  }

  return { sessions, adminRows, stamps, adminCapped };
}
