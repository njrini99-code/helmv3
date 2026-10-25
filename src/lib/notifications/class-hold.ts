import 'server-only';

/**
 * P-10 held pushes, the effectful half: the gate `sendPushNotificationDirect` calls, the release of what was held, and the minute job
 * that runs it (src/app/api/cron/class-holds-release). The pure rules are in class-hold-core.ts.
 *
 * Everything here fails open. The gate answers "pass" on any error, timeout or missing function; a release that cannot send gives the
 * rows back for the next tick, and the safety net sends a row that failed three times as itself. A hold never ends as silence because
 * of our own failure. The migrations are held (20261025070200), so until they are applied every call here lands on PGRST202 and reads
 * as "send now".
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { decodeMessageContent } from '@/lib/utils/decode-message-content';
import { getUserNotificationPreferences } from './email';
import {
  composeClassSummary,
  summaryCollapseId,
  type HeldRow,
  type HoldSpec,
} from './class-hold-core';
import type { NotificationPreferences, NotificationType } from './types';

type Failure = { code?: string; message?: string } | null;
type RpcResult = { data: unknown; error: Failure };
type RpcBuilder = PromiseLike<RpcResult> & { abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult> };
type Rpc = (fn: string, args: object) => RpcBuilder;

/**
 * push.ts imports this module (the gate), so this module cannot import the sender back without a runtime import cycle. A release is
 * handed the sender instead: push.ts passes its own for the inline release, and the callers outside it (the cron, Deliver now) import
 * push.ts themselves.
 */
export type PushDeps = {
  sendPushNotificationDirect: (type: NotificationType, userId: string, data: Record<string, unknown>) => Promise<{ success: boolean; delivered?: number }>;
  shouldSendPush: (type: NotificationType, prefs: NotificationPreferences) => boolean;
};

const rpcOf = (admin: SupabaseClient): Rpc => (admin as unknown as { rpc: Rpc }).rpc.bind(admin);

/** The gate's budget. A put that takes longer than this is cancelled by id and the push goes out directly. */
export const PUT_TIMEOUT_MS = 300;
const CONCURRENCY = 8;
const CLAIM_USERS = 200;

/** A row of golf_push_holds as the claim functions return it. */
type HoldRow = HeldRow & {
  user_id: string;
  message_id: string | null;
  expires_at: string | null;
  release_at: string;
  attempts: number;
};

// --- Fail-open logging ----------------------------------------------------------------------------------------------------------

let lastFailOpenLog = 0;
/** One line a minute per process: a stopped function would otherwise log on every push. No payload content, ever. */
function warnFailOpen(why: string): void {
  const now = Date.now();
  if (now - lastFailOpenLog < 60_000) return;
  lastFailOpenLog = now;
  void logServerEvent(`class_hold_fail_open: ${why}`, { action: 'pushes.class_hold', featureArea: 'notifications', skipSentry: true }, 'warning');
}

// --- The gate -------------------------------------------------------------------------------------------------------------------

const numberOr0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/**
 * Decide whether a push is held for the player's class. 'held' only when the database answered that it stored the hold; every other
 * outcome, including an error or a timeout, is 'pass' and the caller sends the push as it always did.
 */
export async function holdOrPass(
  admin: SupabaseClient,
  userId: string,
  type: string,
  payload: { title: string; body: string },
  data: Record<string, unknown>,
  spec: HoldSpec | undefined,
  push: PushDeps,
): Promise<'held' | 'pass'> {
  if (!spec || spec === 'bypass') return 'pass';
  try {
    return await holdOrPassUnguarded(admin, userId, type, payload, data, spec, push);
  } catch (error) {
    // Nothing in the gate may fail a push: anything unexpected sends it now.
    warnFailOpen(error instanceof Error ? error.message : 'gate failed');
    return 'pass';
  }
}

async function holdOrPassUnguarded(
  admin: SupabaseClient,
  userId: string,
  type: string,
  payload: { title: string; body: string },
  data: Record<string, unknown>,
  spec: Exclude<HoldSpec, 'bypass'>,
  push: PushDeps,
): Promise<'held' | 'pass'> {
  const holdId = randomUUID();
  const rpc = rpcOf(admin);
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), PUT_TIMEOUT_MS);
  let result: RpcResult;
  try {
    const call = rpc('golf_push_hold_put', {
      p_user_id: userId,
      p_hold_id: holdId,
      p_notification_type: type,
      p_group_key: spec.group,
      p_dedupe_key: spec.dedupeKey ?? null,
      p_title: payload.title,
      p_body: payload.body,
      p_data: data,
      p_conversation_id: spec.conversationId ?? null,
      p_message_id: spec.messageId ?? null,
      p_expires_at: spec.expiresAt ?? null,
    });
    result = await (call.abortSignal ? call.abortSignal(control.signal) : call);
  } catch (error) {
    result = { data: null, error: { message: error instanceof Error ? error.message : 'put failed' } };
  } finally {
    clearTimeout(timer);
  }

  if (control.signal.aborted) {
    // The put may still commit after we gave up. A tombstone by id makes that harmless: if the row landed unclaimed it is cancelled (our
    // direct send is the only delivery), and if it has not landed a cancelled row takes its id. `false` means the row is already being
    // delivered by a release, so the push must not also go out here.
    try {
      const cancelled = await rpc('golf_push_holds_cancel', { p_hold_id: holdId, p_user_id: userId });
      warnFailOpen('put timed out');
      return cancelled.error ? 'pass' : cancelled.data === false ? 'held' : 'pass';
    } catch {
      return 'pass';
    }
  }
  if (result.error) {
    warnFailOpen(result.error.code ?? 'put failed');
    return 'pass';
  }

  const answer = (typeof result.data === 'object' && result.data !== null ? result.data : {}) as { held?: unknown; due_waiting?: unknown };
  if (numberOr0(answer.due_waiting) > 0) {
    // Rows held before a stop go out on this user's next push (Should 20): due rows only, class reason only.
    try {
      await releaseHeldForUser(admin, userId, { dueOnly: true, push });
    } catch {
      /* the next tick or Deliver now picks them up */
    }
  }
  return answer.held === true ? 'held' : 'pass';
}

// --- Release --------------------------------------------------------------------------------------------------------------------

const previewOf = (content: string) => (content.length > 80 ? `${content.substring(0, 80)}…` : content);

type Outcome = 'summarized' | 'sent_alone' | 'read_in_app' | 'expired' | 'failed' | 'cancelled' | 'no_device';
export type ReleaseTally = { users: number; rows: number; summarized: number; sentAlone: number; dropped: number; failed: number };
const emptyTally = (): ReleaseTally => ({ users: 0, rows: 0, summarized: 0, sentAlone: 0, dropped: 0, failed: 0 });

async function mark(admin: SupabaseClient, token: string, ids: string[], outcome: Outcome): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await rpcOf(admin)('golf_push_holds_mark', { p_token: token, p_ids: ids, p_outcome: outcome });
  if (error) await logServerError(`class hold mark failed: ${error.message ?? error.code}`, { action: 'pushes.class_hold.mark', featureArea: 'notifications' });
}

async function unclaim(admin: SupabaseClient, token: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await rpcOf(admin)('golf_push_holds_unclaim', { p_token: token, p_ids: ids });
}

/**
 * Release one user's claimed rows: drop what no longer matters (read in the app, deleted, muted, expired, a type turned off since),
 * then send what is left as itself (one row) or as one summary (two or more). Edits made during class are what the player sees: a
 * message's preview is read again here.
 */
async function releaseClaimed(admin: SupabaseClient, userId: string, rows: HoldRow[], token: string, now: Date, tally: ReleaseTally, push: PushDeps): Promise<void> {
  tally.users += 1;
  tally.rows += rows.length;
  const { sendPushNotificationDirect, shouldSendPush } = push;
  const gone = (ids: string[], outcome: Outcome) => {
    tally.dropped += ids.length;
    return mark(admin, token, ids, outcome);
  };

  // 1. Messages: read, deleted or muted rows leave the release.
  const messageIds = [...new Set(rows.map((r) => r.message_id).filter((id): id is string => !!id))];
  const conversationIds = [...new Set(rows.map((r) => r.conversation_id).filter((id): id is string => !!id))];
  const messages = new Map<string, { content: string; created_at: string; is_deleted: boolean }>();
  const participation = new Map<string, { last_read_at: string | null; notification_level: string | null; muted_until: string | null }>();
  if (messageIds.length > 0) {
    const { data } = await admin.from('golf_messages').select('id, content, created_at, is_deleted').in('id', messageIds);
    for (const m of (data ?? []) as { id: string; content: string; created_at: string; is_deleted: boolean | null }[]) {
      messages.set(m.id, { content: m.content, created_at: m.created_at, is_deleted: !!m.is_deleted });
    }
  }
  if (conversationIds.length > 0) {
    const { data } = await admin
      .from('golf_conversation_participants')
      .select('conversation_id, last_read_at, notification_level, muted_until')
      .eq('user_id', userId)
      .in('conversation_id', conversationIds);
    for (const p of (data ?? []) as { conversation_id: string; last_read_at: string | null; notification_level: string | null; muted_until: string | null }[]) {
      participation.set(p.conversation_id, p);
    }
  }

  const prefs = await getUserNotificationPreferences(userId);
  const keep: HoldRow[] = [];
  const dropped = new Map<Outcome, string[]>();
  const drop = (outcome: Outcome, id: string) => dropped.set(outcome, [...(dropped.get(outcome) ?? []), id]);
  for (const row of rows) {
    if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) {
      drop('expired', row.id);
      continue;
    }
    if (!shouldSendPush(row.notification_type as NotificationType, prefs)) {
      drop('cancelled', row.id);
      continue;
    }
    if (row.message_id) {
      const message = messages.get(row.message_id);
      if (!message || message.is_deleted) {
        drop('cancelled', row.id);
        continue;
      }
      const part = row.conversation_id ? participation.get(row.conversation_id) : undefined;
      if (part?.last_read_at && Date.parse(part.last_read_at) >= Date.parse(message.created_at)) {
        drop('read_in_app', row.id);
        continue;
      }
      if (part?.notification_level === 'muted' && (!part.muted_until || Date.parse(part.muted_until) > now.getTime())) {
        drop('cancelled', row.id);
        continue;
      }
      const preview = previewOf(decodeMessageContent(message.content));
      row.data = { ...(row.data ?? {}), preview };
    }
    keep.push(row);
  }
  for (const [outcome, ids] of dropped) await gone(ids, outcome);
  if (keep.length === 0) return;

  const ids = keep.map((r) => r.id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';

  // 2. One row goes out as itself (its own type and text), several as one summary. Both bypass the gate: a release must never be held.
  let result: { success: boolean; delivered?: number };
  let outcome: Outcome;
  if (keep.length === 1) {
    const row = keep[0]!;
    result = await sendPushNotificationDirect(row.notification_type as NotificationType, userId, {
      ...(row.data ?? {}),
      hold: 'bypass',
      interruptionLevel: 'active',
    });
    outcome = 'sent_alone';
  } else {
    const titles: Record<string, string> = {};
    const groupIds = [...new Set(keep.filter((r) => r.group_key === 'group' && r.conversation_id).map((r) => r.conversation_id!))];
    if (groupIds.length > 0) {
      const { data } = await admin.from('golf_conversations').select('id, title').in('id', groupIds);
      for (const c of (data ?? []) as { id: string; title: string | null }[]) if (c.title) titles[c.id] = c.title;
    }
    const summary = composeClassSummary(keep, { baseUrl, titles, collapseId: summaryCollapseId(now) });
    result = await sendPushNotificationDirect('class_summary', userId, {
      title: summary.title,
      body: summary.body,
      link: summary.link,
      hold: 'bypass',
      interruptionLevel: summary.interruptionLevel,
      threadId: summary.threadId,
      collapseId: summary.collapseId,
      relevanceScore: summary.relevanceScore,
    });
    outcome = 'summarized';
  }

  if (!result.success) {
    // Attempts were already counted by the claim; the rows come back for the next tick, and the safety net takes them after the third.
    await unclaim(admin, token, ids);
    tally.failed += ids.length;
    return;
  }
  if (typeof result.delivered === 'number' && result.delivered > 0) {
    if (outcome === 'summarized') tally.summarized += ids.length;
    else tally.sentAlone += ids.length;
    await mark(admin, token, ids, outcome);
  } else {
    // Opted out since, or no device any more: nothing was owed.
    tally.dropped += ids.length;
    await mark(admin, token, ids, 'no_device');
  }
}

/** Group claimed rows by user. */
function byUser(rows: HoldRow[]): Map<string, HoldRow[]> {
  const out = new Map<string, HoldRow[]>();
  for (const row of rows) out.set(row.user_id, [...(out.get(row.user_id) ?? []), row]);
  return out;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      try {
        await fn(item);
      } catch (error) {
        await logServerError(`class hold release failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'pushes.class_hold.release', featureArea: 'notifications' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

/**
 * Release one player's open class holds now. `dueOnly` is the inline release before a new push (only what is already due); Deliver now
 * passes false, after `golf_push_holds_release_mine` made every row due, so a row held a second ago is not missed.
 */
export async function releaseHeldForUser(
  admin: SupabaseClient,
  userId: string,
  opts: { dueOnly?: boolean; now?: Date; push: PushDeps },
): Promise<ReleaseTally> {
  const tally = emptyTally();
  const token = randomUUID();
  const now = opts.now ?? new Date();
  const { data, error } = await rpcOf(admin)('golf_push_holds_claim_user', {
    p_user_id: userId,
    p_token: token,
    p_reason: 'class',
    p_due_only: opts.dueOnly === true,
  });
  if (error || !Array.isArray(data) || data.length === 0) return tally;
  await releaseClaimed(admin, userId, data as HoldRow[], token, now, tally, opts.push);
  return tally;
}

// --- The minute job -------------------------------------------------------------------------------------------------------------

export type ClassHoldRelease = {
  moved: number;
  expired: number;
  overdue: number;
  tally: ReleaseTally;
  safetyNet: number;
  unavailable: boolean;
};

/**
 * One tick: beat (so the gate knows the job is alive), reconcile, claim users with due rows and release them, send what failed three
 * times as itself, and clean up once an hour. A missing function (the migrations are held) returns `unavailable` and does nothing.
 */
export async function runClassHoldRelease(admin: SupabaseClient, push: PushDeps, now: Date = new Date()): Promise<ClassHoldRelease> {
  const rpc = rpcOf(admin);
  const out: ClassHoldRelease = { moved: 0, expired: 0, overdue: 0, tally: emptyTally(), safetyNet: 0, unavailable: false };

  const beat = await rpc('golf_push_holds_beat', { p_source: 'vercel-cron' });
  if (beat.error) {
    out.unavailable = true;
    return out;
  }

  const reconcile = await rpc('golf_push_holds_reconcile', { p_now: now.toISOString(), p_full: now.getUTCMinutes() % 15 === 0 });
  if (!reconcile.error && typeof reconcile.data === 'object' && reconcile.data !== null) {
    const r = reconcile.data as Record<string, unknown>;
    out.moved = numberOr0(r.moved);
    out.expired = numberOr0(r.expired);
    out.overdue = numberOr0(r.overdue);
    if (out.overdue > 0) {
      await logServerError(`class holds overdue: ${out.overdue} row(s) are more than 10 minutes past their release`, { action: 'pushes.class_hold.overdue', featureArea: 'notifications' }, 'warning');
    }
  }

  const token = randomUUID();
  const claim = await rpc('golf_push_holds_claim', { p_token: token, p_max_users: CLAIM_USERS, p_now: now.toISOString(), p_reason: 'class' });
  if (!claim.error && Array.isArray(claim.data) && claim.data.length > 0) {
    const groups = [...byUser(claim.data as HoldRow[])];
    await pool(groups, CONCURRENCY, ([userId, rows]) => releaseClaimed(admin, userId, rows, token, now, out.tally, push));
  }

  // Safety net: a row that failed three times goes out as itself, so a hold never ends as silence because of our own failure.
  const netToken = randomUUID();
  const failed = await rpc('golf_push_holds_claim_failed', { p_token: netToken, p_limit: 100, p_now: now.toISOString() });
  if (!failed.error && Array.isArray(failed.data) && failed.data.length > 0) {
    const { sendPushNotificationDirect } = push;
    await pool(failed.data as HoldRow[], CONCURRENCY, async (row) => {
      const sent = await sendPushNotificationDirect(row.notification_type as NotificationType, row.user_id, { ...(row.data ?? {}), hold: 'bypass', interruptionLevel: 'active' });
      out.safetyNet += 1;
      await mark(admin, netToken, [row.id], sent.success ? 'sent_alone' : 'failed');
    });
  }

  if (now.getUTCMinutes() === 7) await rpc('golf_push_holds_cleanup', {});
  return out;
}
