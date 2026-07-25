import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { shouldEmit } from '@/lib/admin/emit-throttle';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import {
  classifyInboundAutomation,
  isGmailReadConfigured,
  listInboundMessages,
  resolveLookbackWindow,
  type InboundAutomationReason,
  type InboundGmailMessage,
} from '@/lib/crm/gmail-read';
import type { Json } from '@/lib/types';

// ============================================================================
// CRON: mirror inbound mail from the admin@ Gmail inbox into the CRM.
// ============================================================================
//
// Why polling instead of the Resend inbound webhook: outreach deliberately
// keeps Reply-To on the real mailbox so replies feel 1:1 (product decision,
// 2026-07-20) — which means replies never touch Resend. This cron reads the
// mailbox via the DWD service account (gmail.readonly) and files each message
// into one of two tables. Dedupe: message_id is UNIQUE on BOTH, so re-runs and
// overlapping lookbacks are free.
//
//   sender matches a crm_coaches row  -> crm_replies    (a known coach replied)
//   sender matches nothing            -> crm_unmatched_inbound (cold inbound)
//
// WHAT THIS ROUTE USED TO DO, AND WHY IT WAS CHANGED (2026-07-24). crm_replies
// had ZERO rows all-time. Three independent bugs, all fixed here:
//
//   1. `if (!coachId) continue;` DISCARDED every message from a sender not
//      already in crm_coaches. A cold prospect emailing admin@ produced no
//      row and no log — it was simply gone. That was the single biggest hole,
//      and it is why crm_unmatched_inbound now exists.
//   2. The coach lookup compared lowercased Gmail addresses against
//      `.in('email', ...)`, which is case-sensitive, so every crm_coaches row
//      stored with a capital letter was unmatchable. See resolveCoachIdsByEmail.
//   3. The lookback was hard-coded to 2 days with no way to backfill, so any
//      outage longer than 48h lost replies permanently. It is now 7 days by
//      default and accepts `?days=N`, CLAMPED to [1, 30] (see
//      resolveLookbackWindow in gmail-read.ts for why those bounds). Recover a
//      missed window by hand:
//        curl -H "Authorization: Bearer $CRON_SECRET" \
//             'https://<host>/api/cron/ingest-gmail-replies?days=30'
//      Re-running is safe at any width — message_id is UNIQUE on both tables.
//
// Plus one observability fix: the route returned a cheerful
// `{ok:true, skipped:'not-armed'}` 200 when the gmail.readonly scope was
// missing, so the cron board showed green while ingesting nothing, forever.
// See reportDegraded.
//
// INERT until the gmail.readonly scope is added to the DWD client in Google
// Workspace Admin (see src/lib/crm/gmail-read.ts header).
//
// Auth: Authorization: Bearer ${CRON_SECRET} (same as sibling crons).
// ============================================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JOB_TYPE = 'ingest-gmail-replies';

// --- Coach matching ----------------------------------------------------------
/**
 * Cap on pass-2 (per-sender, case-insensitive) coach lookups per run — see
 * resolveCoachIdsByEmail. Senders past the cap stay unmatched, which is safe:
 * unmatched mail is captured in crm_unmatched_inbound, not dropped.
 */
const MAX_CASE_INSENSITIVE_LOOKUPS = 100;
/** Bound PostgREST fan-out while removing avoidable serial request waterfalls. */
const DATABASE_CONCURRENCY = 10;

// --- Degraded-state alerting -------------------------------------------------
/**
 * In-process burst guard only. Deliberately SHORT: the durable once-per-UTC-day
 * rule lives in alreadyAlertedToday(), and a long window here would fight it —
 * a warm instance that alerted at 20:00 would suppress the next calendar day's
 * alert until 20:00 the following day.
 */
const DEGRADED_BURST_WINDOW_MS = 5 * 60_000;

type DegradedReason = 'gmail-env-missing' | 'not-armed';

interface CoachEmailRow {
  id: string;
  email: string | null;
}

/**
 * crm_unmatched_inbound insert shape. Hand-written because the table ships in
 * supabase/migrations/20260724000000_crm_inbound_signal_capture.sql and is NOT
 * yet in the generated Database types — remove this and the fromUntyped() call
 * below once the migration is applied and `db:types` is regenerated.
 */
interface UnmatchedInboundInsert {
  message_id: string;
  thread_id: string | null;
  from_address: string;
  to_addresses: string[];
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  raw_payload: Json;
  reviewed: boolean;
}

export async function GET(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const { days, maxMessages } = resolveLookback(request);

  // Wrapped in recordJobRun so the admin cron board sees every run, matching
  // every other registered cron (enforced by cron-job-log-coverage.test.ts).
  return recordJobRun(JOB_TYPE, async () => {
    if (!isGmailReadConfigured()) {
      return degradedResponse(
        'gmail-env-missing',
        'GMAIL_SA_CLIENT_EMAIL / GMAIL_SA_PRIVATE_KEY / GMAIL_SEND_AS are not all set; no mail was read.',
      );
    }

    try {
      let inbound: InboundGmailMessage[];
      try {
        inbound = await listInboundMessages(days, maxMessages);
      } catch (err) {
        // Almost certainly the readonly scope isn't granted yet. Still a 200
        // (a non-2xx would make the cron platform retry-storm against a
        // condition only a human in Workspace Admin can clear) — but a LOUD
        // 200 now, not a silent one.
        const msg = err instanceof Error ? err.message : String(err);
        if (/40[13]/.test(msg) || /unauthorized_client|access_denied/i.test(msg)) {
          return degradedResponse(
            'not-armed',
            // Kept short on purpose: job-log.ts truncates `detail` at 300
            // chars when lifting it into background_job_logs.metadata.
            `Gmail read rejected the token — the gmail.readonly DWD scope is probably still ungranted: ${msg.slice(0, 160)}`,
          );
        }
        throw err;
      }

      const scanned = inbound.length;
      if (scanned === 0) {
        return NextResponse.json({
          ok: true,
          days,
          scanned: 0,
          matched: 0,
          inserted: 0,
          count: 0,
          detail: `Scanned 0 messages over ${days}d.`,
        });
      }

      // Drop machine mail (bounces, vacation responders, no-reply blasts)
      // BEFORE anything is written. Without this the new unmatched table fills
      // with noise and stops being read, which would recreate the original
      // "nobody sees inbound signal" failure by a different route.
      const automatedByReason = new Map<InboundAutomationReason, number>();
      let automated = 0;
      let unparseableSender = 0;
      const human: InboundGmailMessage[] = [];
      for (const message of inbound) {
        const reason = classifyInboundAutomation(message);
        if (reason) {
          automated++;
          automatedByReason.set(reason, (automatedByReason.get(reason) ?? 0) + 1);
          continue;
        }
        if (!message.fromAddress) {
          // No usable From header — there is nothing to match on and
          // crm_unmatched_inbound.from_address is the row's whole point.
          // Counted rather than silently dropped so it stays visible if it
          // ever stops being the rounding error it is today.
          unparseableSender++;
          continue;
        }
        human.push(message);
      }

      const supabase = createAdminClient();
      const senders = Array.from(
        new Set(human.map((m) => m.fromAddress).filter((a): a is string => Boolean(a))),
      );
      const coachByEmail = await resolveCoachIdsByEmail(supabase, senders);

      let matched = 0;
      let inserted = 0;
      let unmatchedCaptured = 0;
      for (let offset = 0; offset < human.length; offset += DATABASE_CONCURRENCY) {
        const batch = human.slice(offset, offset + DATABASE_CONCURRENCY);
        const outcomes = await Promise.all(
          batch.map(async (message) => {
            // fromAddress is non-null for everything in `human` (filtered
            // above), but narrow explicitly so the row types stay honest.
            const fromAddress = message.fromAddress;
            if (!fromAddress) return { matched: 0, inserted: 0, unmatchedCaptured: 0 };
            const coachId = coachByEmail.get(fromAddress);

            if (coachId) {
              const wrote = await insertReply(supabase, message, fromAddress, coachId);
              return { matched: 1, inserted: wrote ? 1 : 0, unmatchedCaptured: 0 };
            }

            // THE FIX: an unknown sender is a cold inbound prospect, not
            // garbage. It used to hit `continue` here and disappear.
            const wrote = await insertUnmatched(supabase, message, fromAddress, days);
            return { matched: 0, inserted: 0, unmatchedCaptured: wrote ? 1 : 0 };
          }),
        );
        for (const outcome of outcomes) {
          matched += outcome.matched;
          inserted += outcome.inserted;
          unmatchedCaptured += outcome.unmatchedCaptured;
        }
      }

      return NextResponse.json({
        ok: true,
        days,
        scanned,
        automated,
        automatedByReason: Object.fromEntries(automatedByReason),
        unparseableSender,
        matched,
        inserted,
        // `count` carries the unmatched-capture total because job-log.ts's
        // extractOutcomeMetadata() only lifts a fixed key whitelist
        // (skipped/matched/inserted/sent/processed/count/detail) into
        // background_job_logs.metadata. A key named `unmatched` would render
        // correctly here and then vanish from the cron board.
        count: unmatchedCaptured,
        detail: `${days}d window: ${scanned} scanned, ${automated} automated, ${matched} coach-matched (${inserted} new replies), ${unmatchedCaptured} unmatched captured.`,
      });
    } catch (err) {
      await logServerError(
        `ingest-gmail-replies failed: ${err instanceof Error ? err.message : String(err)}`,
        { action: 'cron.ingest_gmail_replies', featureArea: 'crm', source: 'cron' },
      );
      return NextResponse.json({ ok: false, error: 'ingest failed' }, { status: 500 });
    }
  });
}

/**
 * Read `?days=` off the request and hand it to the clamp in gmail-read.ts.
 * A malformed request URL must not stop the scheduled run, so a throw here
 * falls through to the default window.
 */
function resolveLookback(request: Request): { days: number; maxMessages: number } {
  try {
    return resolveLookbackWindow(new URL(request.url).searchParams.get('days'));
  } catch {
    return resolveLookbackWindow(null);
  }
}

/**
 * Map lowercased sender address -> crm_coaches.id, case-insensitively.
 *
 * WHY TWO PASSES. gmail-read.ts lowercases every address it parses, but
 * crm_coaches.email keeps whatever casing its import CSV had. The original
 * `.in('email', senders)` therefore compared lowercase needles against
 * mixed-case hay and silently missed every coach stored as, say,
 * `Christopher.Jones@LR.edu`. PostgREST's `in.` is case-sensitive and has no
 * case-insensitive variant, and building an `or=(email.ilike.a,email.ilike.b)`
 * string would splice attacker-controlled From headers straight into filter
 * syntax — the From header is the one field a stranger fully controls.
 *
 *   pass 1  one indexed `.in()` over the lowercased senders. Covers rows
 *           already stored lowercase (the overwhelming majority) in a single
 *           round trip.
 *   pass 2  only for senders pass 1 missed: one `.ilike()` each. A standalone
 *           `.ilike()` sends the value as its own query parameter, so there is
 *           no comma-delimited filter list to escape out of, and every hit is
 *           re-verified with an exact lowercase `===` compare. That last step
 *           is the real guarantee: a stray LIKE wildcard can widen the fetch
 *           but can never produce a wrong match.
 *
 * Pass 2 is capped so a burst of cold inbound cannot turn one run into
 * hundreds of queries.
 */
async function resolveCoachIdsByEmail(
  supabase: ReturnType<typeof createAdminClient>,
  senders: string[],
): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  if (senders.length === 0) return byEmail;

  const { data: exactRows } = await supabase
    .from('crm_coaches')
    .select('id, email')
    .in('email', senders);
  for (const row of (exactRows ?? []) as CoachEmailRow[]) {
    if (row.email) byEmail.set(row.email.toLowerCase(), row.id);
  }

  const stillMissing = senders
    .filter((sender) => !byEmail.has(sender))
    .slice(0, MAX_CASE_INSENSITIVE_LOOKUPS);
  for (let offset = 0; offset < stillMissing.length; offset += DATABASE_CONCURRENCY) {
    const batch = stillMissing.slice(offset, offset + DATABASE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (sender) => {
        const { data: fuzzyRows } = await supabase
          .from('crm_coaches')
          .select('id, email')
          .ilike('email', escapeLikePattern(sender))
          .limit(5);
        const verified = ((fuzzyRows ?? []) as CoachEmailRow[]).find(
          (row) => row.email?.toLowerCase() === sender,
        );
        return verified ? { sender, coachId: verified.id } : null;
      }),
    );
    for (const result of results) {
      if (result) {
        byEmail.set(result.sender, result.coachId);
      }
    }
  }

  return byEmail;
}

/**
 * Neutralise LIKE metacharacters so an address is matched literally.
 * `_` is legal and common in email local-parts (`john_smith@x.edu`) and would
 * otherwise act as a single-character wildcard. Correctness does not depend on
 * this — resolveCoachIdsByEmail re-verifies every hit by exact compare — but
 * without it a lookup can pull unrelated rows and lose the real one behind the
 * row limit.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Upsert a coach reply. Returns true when a row was written. */
async function insertReply(
  supabase: ReturnType<typeof createAdminClient>,
  message: InboundGmailMessage,
  fromAddress: string,
  coachId: string,
): Promise<boolean> {
  // message_id is UNIQUE — ignore duplicates so overlapping lookbacks are free.
  const { error } = await supabase.from('crm_replies').upsert(
    {
      coach_id: coachId,
      thread_id: message.threadId,
      message_id: messageKey(message),
      in_reply_to: message.inReplyTo,
      from_address: fromAddress,
      to_addresses: message.toAddresses,
      subject: message.subject,
      body_text: message.bodyText,
      body_html: message.bodyHtml,
      received_at: message.receivedAt,
      raw_payload: { source: 'gmail_poll', gmail_id: message.gmailId },
      is_read: false,
    },
    { onConflict: 'message_id', ignoreDuplicates: true },
  );
  if (error) {
    await logServerError(`ingest-gmail-replies reply upsert failed: ${error.message}`, {
      action: 'cron.ingest_gmail_replies',
      featureArea: 'crm',
      source: 'cron',
      extra: { gmailId: message.gmailId },
    });
    return false;
  }
  return true;
}

/**
 * Capture inbound mail whose sender matches no coach. Returns true when a row
 * was written.
 *
 * A failure here is logged rather than swallowed: this path exists because
 * inbound signal was disappearing silently, so it must never fail silently.
 */
async function insertUnmatched(
  supabase: ReturnType<typeof createAdminClient>,
  message: InboundGmailMessage,
  fromAddress: string,
  days: number,
): Promise<boolean> {
  const row: UnmatchedInboundInsert = {
    message_id: messageKey(message),
    thread_id: message.threadId,
    // Stored with the sender's ORIGINAL casing on purpose (the migration's
    // COMMENT says so): the case-sensitivity bug above is far easier to
    // recognise in a review queue when the raw casing survives.
    from_address: message.fromAddressRaw ?? fromAddress,
    to_addresses: message.toAddresses,
    subject: message.subject,
    body_text: message.bodyText,
    body_html: message.bodyHtml,
    received_at: message.receivedAt,
    raw_payload: {
      source: 'gmail_poll',
      gmail_id: message.gmailId,
      normalized_from: fromAddress,
      lookback_days: days,
      gmail_message: message.rawPayload,
    },
    reviewed: false,
  };

  // fromUntyped is the repo's centralized escape hatch for tables not yet in
  // the generated Database types (src/lib/supabase/untyped.ts); its `string`
  // fallback arm accepts this table without editing that file. Consider adding
  // 'crm_unmatched_inbound' to the UntypedTable union until `db:types` is
  // regenerated post-apply.
  const { error } = (await fromUntyped(supabase, 'crm_unmatched_inbound').upsert(row, {
    onConflict: 'message_id',
    ignoreDuplicates: true,
  })) as { error: { message: string } | null };

  if (error) {
    await logServerError(`ingest-gmail-replies unmatched capture failed: ${error.message}`, {
      action: 'cron.ingest_gmail_replies',
      featureArea: 'crm',
      source: 'cron',
      extra: { gmailId: message.gmailId, fromAddress },
    });
    return false;
  }
  return true;
}

/**
 * Dedupe key. Prefer the RFC Message-ID (stable across mailboxes and across a
 * re-ingest); fall back to the Gmail id, which is at least stable within this
 * mailbox. Both tables enforce UNIQUE on it.
 */
function messageKey(message: InboundGmailMessage): string {
  return message.messageIdHeader ?? `gmail:${message.gmailId}`;
}

/**
 * Build the 200 for a run that did no work because the integration is not
 * usable, and raise a throttled alert.
 *
 * WHY STILL A 200. recordJobRun marks a run 'failed' only when the handler
 * throws or resolves a >=400 Response, and either would make the cron platform
 * retry a condition that only a human in Google Workspace Admin can clear. So
 * the HTTP contract stays 200 and the degradation is expressed where it can be
 * seen without causing retries:
 *
 *   - `skipped` + `detail` in the body. job-log.ts's extractOutcomeMetadata()
 *     lifts both into background_job_logs.metadata, so the cron board can tell
 *     "ran and did work" from "ran and did nothing", which a bare 'completed'
 *     could not.
 *   - a throttled logServerError at `warning`, which lands in admin_events and
 *     Sentry. This is the part that was missing: the old route returned
 *     {ok:true, skipped:'not-armed'} and nothing anywhere ever said so, which
 *     is how six weeks of green checkmarks hid an integration that had never
 *     ingested a single message.
 */
async function degradedResponse(reason: DegradedReason, detail: string): Promise<NextResponse> {
  await reportDegraded(reason, detail);
  return NextResponse.json({ ok: true, degraded: true, skipped: reason, detail });
}

/** Alert at most once per UTC day per reason. Never throws. */
async function reportDegraded(reason: DegradedReason, detail: string): Promise<void> {
  try {
    // Layer 1: in-process, guards against a burst of manual re-triggers landing
    // on one warm instance before any of them has written its job-log row.
    if (!shouldEmit(`cron.${JOB_TYPE}.${reason}`, DEGRADED_BURST_WINDOW_MS)) return;
    // Layer 2: durable. Cron invocations are cold starts, so layer 1's map is
    // empty on essentially every scheduled run and cannot deliver a daily rule
    // on its own.
    if (await alreadyAlertedToday(reason)) return;

    await logServerError(
      `ingest-gmail-replies is degraded (${reason}) — inbound coach replies are NOT being captured. ${detail}`,
      {
        action: 'cron.ingest_gmail_replies',
        featureArea: 'crm',
        source: 'cron',
        errorCode: `ingest_gmail_replies.${reason}`,
        extra: { reason },
      },
      'warning',
    );
  } catch {
    // Alerting must never fail the cron. A dropped alert is recoverable; a
    // failed run that stops ingesting mail is not.
  }
}

/**
 * True when an earlier run TODAY (UTC) already reported the same degraded
 * reason — the throttle that keeps a 24x/day cron from filing 24 alerts.
 *
 * background_job_logs is the store because it is the only cross-invocation
 * memory available without new schema, and recordJobRun already writes
 * `metadata.skipped` there for exactly this route (job-log.ts documents
 * ingest-gmail-replies as its motivating example). Keying on the calendar day
 * rather than a rolling 24h window matters: a rolling window seeded by the
 * first alert would be re-armed by every subsequent degraded run and suppress
 * the alert forever, which is the bug being fixed, not a fix for it.
 *
 * The current run's own row is written after this handler returns, so it can
 * never suppress its own alert.
 */
async function alreadyAlertedToday(reason: DegradedReason): Promise<boolean> {
  try {
    const now = new Date();
    const startOfUtcDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();

    const admin = createAdminClient();
    const { data } = await admin
      .from('background_job_logs')
      .select('metadata')
      .eq('job_type', JOB_TYPE)
      .gte('started_at', startOfUtcDay)
      .order('started_at', { ascending: false })
      .limit(50);

    return (data ?? []).some((row) => skippedReasonOf(row.metadata) === reason);
  } catch {
    // Unreadable job log => let the alert through. Over-reporting a real
    // outage beats staying silent about one.
    return false;
  }
}

/** Read `metadata.skipped` off a background_job_logs row, or null. */
function skippedReasonOf(metadata: Json | null): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = metadata.skipped;
  return typeof value === 'string' ? value : null;
}
