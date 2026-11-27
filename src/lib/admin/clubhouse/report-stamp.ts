import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { catalogCodeOf } from './feed';
import { loadBridgeGraph } from './graph-server';
import type { BridgeColumns } from './ingest';
import { isFailureRow } from './live-model';

/**
 * A Clubhouse failure that `chReport` writes through `/api/log-error` carries its signal's place (`context.chSignal`:
 * session and seq), and the same failure reaches `/api/ch/signal` as an envelope marked `reported`. The two posts race,
 * and whichever lands second gives the report its Bridge columns:
 *
 * - the signal second (the usual order): the signal route stamps the row with the columns it resolved (`stampReport`);
 * - the report second (the 20th envelope flushes on a microtask, a pagehide flush goes by beacon, a report whose first
 *   post failed retries 2 s later): the signal route's stamp found no row, so `/api/log-error` reads the stored signal
 *   back from `clubhouse_session_events` and stamps its own row (`stampFromStoredSignal`).
 *
 * The signal route stores the envelope before it stamps, so between the two one of them always sees the other. Both
 * write through one filter: only the caller's own client row with that session and seq, only while it has no code yet,
 * and only within STAMP_WINDOW_MS. A known session id can't restamp anyone else's row, and a second stamp changes
 * nothing.
 */
export const STAMP_WINDOW_MS = 15 * 60_000;

/** The session ids the signal route accepts (parseSignalBatch). */
const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;
/** A database the migration hasn't reached (no table, no column): there is nothing to stamp from or into. */
const NOT_THERE = new Set(['PGRST204', 'PGRST205', '42703', '42P01']);

type DbError = { code?: string } | null;
type SignalPlace = { sessionId: string; seq: number };

function notThere(error: unknown): boolean {
  return NOT_THERE.has((error as DbError)?.code ?? '');
}

/** Give the caller's report of one signal its Bridge columns. Returns how many rows it stamped (0 or 1). */
export async function stampReport(db: SupabaseClient, userId: string, place: SignalPlace, columns: BridgeColumns): Promise<number> {
  const since = new Date(Date.now() - STAMP_WINDOW_MS).toISOString();
  const { error, count } = await db
    .from('admin_events')
    .update(columns, { count: 'exact' })
    .eq('source', 'client')
    .eq('user_id', userId)
    .eq('metadata->context->chSignal->>sessionId', place.sessionId)
    .eq('metadata->context->chSignal->>seq', String(place.seq))
    .is('ch_code', null)
    .gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

/** The signal a client report says it reports (`context.chSignal`), when that is a well-formed place. */
export function reportedSignalOf(context: unknown): SignalPlace | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const ref = (context as { chSignal?: unknown }).chSignal;
  if (!ref || typeof ref !== 'object') return null;
  const { sessionId, seq } = ref as { sessionId?: unknown; seq?: unknown };
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return null;
  return { sessionId, seq };
}

type StoredEvent = {
  kind: string;
  outcome: string | null;
  code: string | null;
  bridge_id: number | null;
  page_id: string | null;
  action_id: string | null;
  control_id: string | null;
  server_code: string | null;
};
type StoredSession = { user_id: string | null; release: string; platform: string };

/**
 * Stamp the caller's report from its signal, when the signal got there first. Reads the stored envelope and its
 * session and gives the row the columns the signal route would have (the code resolved the same way, the release and
 * platform from the session). Nothing to do when nothing is stored yet (the usual order, or signals off), when the
 * session isn't the caller's, or when the envelope isn't a failure. Returns how many rows it stamped.
 */
export async function stampFromStoredSignal(db: SupabaseClient, userId: string, place: SignalPlace): Promise<number> {
  const [event, session] = await Promise.all([
    db
      .from('clubhouse_session_events')
      .select('kind, outcome, code, bridge_id, page_id, action_id, control_id, server_code')
      .eq('session_id', place.sessionId)
      .eq('seq', place.seq)
      .maybeSingle(),
    db.from('clubhouse_sessions').select('user_id, release, platform').eq('session_id', place.sessionId).maybeSingle(),
  ]);
  const readError = event.error ?? session.error;
  if (readError) {
    if (notThere(readError)) return 0;
    throw readError;
  }
  const e = event.data as StoredEvent | null;
  const s = session.data as StoredSession | null;
  if (!e || !s || s.user_id !== userId || e.page_id === null || !isFailureRow(e)) return 0;

  const columns: BridgeColumns = {
    ch_code: catalogCodeOf(loadBridgeGraph() ?? { ids: {} }, e.bridge_id, e.code) || null,
    bridge_id: e.bridge_id,
    page_id: e.page_id,
    action_id: e.action_id,
    control_id: e.control_id,
    release: s.release,
    platform: s.platform,
    session_id: place.sessionId,
    server_code: e.server_code,
  };
  try {
    return await stampReport(db, userId, place, columns);
  } catch (error) {
    if (notThere(error)) return 0;
    throw error;
  }
}
