import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { shouldEmit } from '@/lib/admin/emit-throttle';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import {
  classifyInboundAutomation,
  extractBouncedRecipients,
  isGmailReadConfigured,
  listInboundMessages,
  listSentMessages,
  readContactLogGmailId,
  resolveLookbackWindow,
  type InboundAutomationReason,
  type InboundGmailMessage,
  type SentGmailMessage,
} from '@/lib/crm/gmail-read';
import type { Json } from '@/lib/types';
import { describeError } from '@/lib/utils/describe-error';

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
// FOUR MORE FIXES (2026-08-01) — the campaign it needed to see was
// structurally invisible to it, and bounces were being thrown away:
//
//   1. WIDENED BACKFILL CEILING. `?days=` was clamped to [1, 30], which
//      cannot reach the March start of the campaign from today. The ceiling
//      (MAX_LOOKBACK_DAYS in gmail-read.ts) is now 365 — the scheduled tick's
//      DEFAULT_LOOKBACK_DAYS stays 7, so this run's own schedule and cost are
//      unchanged. Recover a missed window by hand:
//        curl -H "Authorization: Bearer $CRON_SECRET" \
//             'https://<host>/api/cron/ingest-gmail-replies?days=180'
//      A very wide window may still need several narrower requests inside the
//      120s maxDuration — watch for a 504 rather than assume a 200 means done.
//   2. ALL-MAIL SEARCH. The query was `in:inbox -from:me newer_than:Nd`,
//      which misses anything archived, labelled, or filtered. It no longer
//      scopes to Inbox — see listInboundMessages's query comment.
//   3. BOUNCE SUPPRESSION. `null_return_path` / `failed_recipients` messages
//      used to just increment a counter and get discarded. They now go
//      through processBounce(): extract the failed address (X-Failed-
//      Recipients, then the RFC 3464 DSN, then a scoped prose fallback),
//      write crm_email_suppressions (reason 'hard_bounce', source 'admin' —
//      mirrors src/app/api/webhooks/resend/route.ts's suppressEmail()), and
//      flip crm_coaches.email_status='bounced'.
//   4. SENT-MAIL SYNC. syncSentMail() reads `in:sent` over the same window
//      and backfills crm_contact_log (contact_type 'email') for any 1:1 send
//      made straight from the Gmail UI that never went through the app's
//      compose flow — without a contact_log row a coach's reply has nothing
//      to attribute against. Idempotent via metadata.gmail_message_id (see
//      readContactLogGmailId in gmail-read.ts) — the same key the app's own
//      compose-send path (crm-gmail-send.ts) already stamps, so a message
//      sent through the app is never double-logged here.
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

      // Drop machine mail (bounces, vacation responders, no-reply blasts)
      // BEFORE anything is written. Without this the new unmatched table fills
      // with noise and stops being read, which would recreate the original
      // "nobody sees inbound signal" failure by a different route.
      const automatedByReason = new Map<InboundAutomationReason, number>();
      let automated = 0;
      let unparseableSender = 0;
      const human: InboundGmailMessage[] = [];
      const bounces: InboundGmailMessage[] = [];
      for (const message of inbound) {
        const reason = classifyInboundAutomation(message);
        if (reason) {
          automated++;
          automatedByReason.set(reason, (automatedByReason.get(reason) ?? 0) + 1);
          // Only mail that actually LOOKS like a delivery report enters the
          // bounce path. `null_return_path` alone is far too wide: RFC 3834
          // requires vacation responders to use a null envelope sender too,
          // so every ordinary out-of-office reply from a real coach would
          // land here, extract nothing, and fire the "unparseable bounce"
          // warning. That noise would then drown the signal that warning
          // exists to carry. Require a machine-readable delivery-status part
          // or an explicit failed-recipients header.
          const looksLikeDeliveryReport =
            reason === 'failed_recipients' ||
            Boolean(message.deliveryStatusText) ||
            Boolean(message.failedRecipients);
          if (looksLikeDeliveryReport) {
            bounces.push(message);
          }
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

      let bounceSuppressed = 0;
      let bounceCoachesMarked = 0;
      let bounceExtractionFailed = 0;
      for (let offset = 0; offset < bounces.length; offset += DATABASE_CONCURRENCY) {
        const batch = bounces.slice(offset, offset + DATABASE_CONCURRENCY);
        const outcomes = await Promise.all(batch.map((message) => processBounce(supabase, message)));
        for (const outcome of outcomes) {
          bounceSuppressed += outcome.suppressed;
          bounceCoachesMarked += outcome.coachesMarked;
          if (outcome.recipients === 0) bounceExtractionFailed++;
        }
      }

      const sentSync = await syncSentMail(supabase, days, maxMessages);

      return NextResponse.json({
        ok: true,
        days,
        scanned,
        automated,
        automatedByReason: Object.fromEntries(automatedByReason),
        unparseableSender,
        bounces: {
          detected: bounces.length,
          suppressed: bounceSuppressed,
          coachesMarked: bounceCoachesMarked,
          extractionFailed: bounceExtractionFailed,
        },
        matched,
        inserted,
        // `count` carries the unmatched-capture total because job-log.ts's
        // extractOutcomeMetadata() only lifts a fixed key whitelist
        // (skipped/matched/inserted/sent/processed/count/detail) into
        // background_job_logs.metadata. A key named `unmatched` would render
        // correctly here and then vanish from the cron board.
        count: unmatchedCaptured,
        sentSync: { scanned: sentSync.scanned, matched: sentSync.matched, inserted: sentSync.inserted },
        // Flat aliases: only these two extra numbers, plus everything already
        // whitelisted, survive into background_job_logs.metadata — see the
        // `count` comment above for why that matters.
        sent: sentSync.inserted,
        processed: bounceSuppressed,
        detail: `${days}d window (all-mail): ${scanned} scanned, ${automated} automated (${bounces.length} bounces -> ${bounceSuppressed} suppressed/${bounceCoachesMarked} coaches marked${bounceExtractionFailed ? `, ${bounceExtractionFailed} unrecoverable` : ''}), ${matched} coach-matched (${inserted} new replies), ${unmatchedCaptured} unmatched captured. Sent sync: ${sentSync.scanned} scanned/${sentSync.matched} matched/${sentSync.inserted} logged.`,
      });
    } catch (err) {
      await logServerError(
        `ingest-gmail-replies failed: ${describeError(err)}`,
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

// --- Bounce processing --------------------------------------------------------

interface BounceOutcome { recipients: number; suppressed: number; coachesMarked: number; }

/**
 * Handle one bounce/DSN message: extract the failed address(es), suppress
 * each, flip the matching coach's email_status. Never throws — every write is
 * best-effort/logged, matching insertReply/insertUnmatched's style.
 */
async function processBounce(
  supabase: ReturnType<typeof createAdminClient>,
  message: InboundGmailMessage,
): Promise<BounceOutcome> {
  const recipients = extractBouncedRecipients(message);
  if (recipients.length === 0) {
    await logServerError(
      `ingest-gmail-replies: bounce with no extractable recipient (gmail ${message.gmailId})`,
      { action: 'cron.ingest_gmail_replies', featureArea: 'crm', source: 'cron', extra: { gmailId: message.gmailId } },
      'warning',
    );
    return { recipients: 0, suppressed: 0, coachesMarked: 0 };
  }
  let suppressed = 0;
  let coachesMarked = 0;
  for (const address of recipients) {
    if (await suppressBouncedEmail(supabase, address)) suppressed++;
    if (await markCoachBounced(supabase, address)) coachesMarked++;
  }
  return { recipients: recipients.length, suppressed, coachesMarked };
}

/**
 * Idempotently add a bounced address to crm_email_suppressions. Mirrors
 * src/app/api/webhooks/resend/route.ts's suppressEmail() (check-then-insert;
 * the table's real UNIQUE(email, reason) constraint is the backstop). reason
 * 'hard_bounce' / source 'admin' are both confirmed live values against
 * crm_email_suppressions_reason_check / _source_check — 'admin' is already
 * used by existing rows in this exact table.
 */
async function suppressBouncedEmail(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return false;
  try {
    const { data: existing } = await supabase
      .from('crm_email_suppressions')
      .select('id')
      .eq('email', normalized)
      .eq('reason', 'hard_bounce')
      .maybeSingle();
    if (existing) return false;
    const { error } = await supabase.from('crm_email_suppressions').insert({
      email: normalized,
      reason: 'hard_bounce',
      source: 'admin',
    });
    if (error) throw error;
    return true;
  } catch (err) {
    await logServerError(`ingest-gmail-replies bounce suppression failed for ${normalized}: ${describeError(err)}`, {
      action: 'cron.ingest_gmail_replies', featureArea: 'crm', source: 'cron', extra: { email: normalized },
    });
    return false;
  }
}

/**
 * Flip crm_coaches.email_status='bounced' for a bounced address, case-
 * insensitively (crm_coaches.email is plain text, not citext — confirmed live
 * — so this app-side ilike + exact-compare is required, same shape as
 * resolveCoachIdsByEmail's pass 2 below). Bounces are rare per run so a
 * per-address query (rather than that function's batching) is fine.
 */
async function markCoachBounced(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) return false;
  try {
    const { data: rows } = await supabase
      .from('crm_coaches')
      .select('id, email')
      .ilike('email', escapeLikePattern(normalized))
      .limit(5);
    const match = ((rows ?? []) as CoachEmailRow[]).find((r) => r.email?.toLowerCase() === normalized);
    if (!match) return false;
    const { error } = await supabase
      .from('crm_coaches')
      .update({ email_status: 'bounced', updated_at: new Date().toISOString() })
      .eq('id', match.id);
    if (error) throw error;
    return true;
  } catch (err) {
    await logServerError(`ingest-gmail-replies bounce email_status update failed for ${normalized}: ${describeError(err)}`, {
      action: 'cron.ingest_gmail_replies', featureArea: 'crm', source: 'cron', extra: { email: normalized },
    });
    return false;
  }
}

// --- Sent-mail sync (attribution) --------------------------------------------

/**
 * Backfill crm_contact_log from the mailbox's own Sent folder so a coach
 * reply has a send record to attribute against (item 4). Does NOT recover the
 * April BCC blasts — Gmail never exposes Bcc recipients on the sender's own
 * Sent copy (the To header on those is literally "undisclosed-recipients:;"),
 * which is the documented, structural reason those never matched. This closes
 * the gap for any 1:1 send made straight from the Gmail UI going forward.
 *
 * Idempotent: dedupes on metadata.gmail_message_id via readContactLogGmailId
 * — the SAME key crm-gmail-send.ts's recordGmailTouch() already stamps on
 * every app-sent email, so a message sent through the app is never
 * double-logged here, and re-running this cron is a no-op for rows it
 * already wrote.
 */
async function syncSentMail(
  supabase: ReturnType<typeof createAdminClient>,
  days: number,
  maxMessages: number,
): Promise<{ scanned: number; matched: number; inserted: number }> {
  let sent: SentGmailMessage[];
  try {
    sent = await listSentMessages(days, maxMessages);
  } catch (err) {
    await logServerError(`ingest-gmail-replies sent-mail list failed: ${describeError(err)}`, {
      action: 'cron.ingest_gmail_replies', featureArea: 'crm', source: 'cron',
    });
    return { scanned: 0, matched: 0, inserted: 0 };
  }
  if (sent.length === 0) return { scanned: 0, matched: 0, inserted: 0 };

  const recipients = Array.from(new Set(sent.flatMap((m) => m.toAddresses)));
  const coachByEmail = await resolveCoachIdsByEmail(supabase, recipients);

  const candidateIds = sent
    .filter((m) => m.toAddresses.some((a) => coachByEmail.has(a)))
    .map((m) => m.gmailId);
  const existingKeys = await existingGmailContactLogKeys(supabase, candidateIds);

  let matched = 0;
  let inserted = 0;
  for (let offset = 0; offset < sent.length; offset += DATABASE_CONCURRENCY) {
    const batch = sent.slice(offset, offset + DATABASE_CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (message) => {
        // EVERY matching recipient gets a row, not just the first. One
        // message addressed to three coaches is three sends; logging only
        // coach A leaves B and C with no send record, and because the dedupe
        // key includes the gmail id, later runs would skip the message
        // entirely and never repair them. Their replies would then have
        // nothing to attribute against — precisely the failure this sync
        // exists to close.
        const coachIds = Array.from(
          new Set(
            message.toAddresses
              .map((a) => coachByEmail.get(a))
              .filter((id): id is string => Boolean(id)),
          ),
        );
        if (coachIds.length === 0) return { matched: 0, inserted: 0 };

        let wrote = 0;
        for (const coachId of coachIds) {
          if (existingKeys.has(`${message.gmailId}::${coachId}`)) continue;
          if (await insertSentContactLog(supabase, message, coachId)) wrote += 1;
        }
        return { matched: coachIds.length, inserted: wrote };
      }),
    );
    for (const o of outcomes) { matched += o.matched; inserted += o.inserted; }
  }
  return { scanned: sent.length, matched, inserted };
}

/**
 * Which (gmail_message_id, coach_id) pairs are already logged.
 *
 * This IS the whole idempotency contract — crm_contact_log has no unique
 * constraint on the gmail id, so nothing downstream catches a wrong answer.
 * Two rules follow from that:
 *
 *  1. FAIL CLOSED. A swallowed error would read as "nothing is logged yet"
 *     and re-insert every message in the window, once per run, forever. We
 *     throw instead so syncSentMail aborts without writing.
 *  2. CHUNK. `candidateIds` can hold up to MAX_MESSAGES ids; supabase-js
 *     puts an `.in()` list in the query string, and ~500 ids is roughly
 *     10 KB — past the usual 8 KB URL/header limit at the gateway. A 414
 *     would have hit rule 1 anyway, but chunking stops it happening at all.
 *     Each chunk is bounded well under PostgREST's 1000-row cap.
 */
async function existingGmailContactLogKeys(
  supabase: ReturnType<typeof createAdminClient>,
  gmailIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (gmailIds.length === 0) return out;

  const CHUNK = 50;
  for (let i = 0; i < gmailIds.length; i += CHUNK) {
    const chunk = gmailIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('crm_contact_log')
      .select('coach_id, metadata')
      .in('metadata->>gmail_message_id', chunk)
      .range(0, 999);

    if (error) {
      throw new Error(
        `sent-sync dedupe lookup failed (${chunk.length} ids): ${error.message}. ` +
          'Aborting without writing — re-inserting would duplicate contact-log rows.',
      );
    }

    for (const row of data ?? []) {
      const id = readContactLogGmailId(row.metadata);
      if (id && row.coach_id) out.add(`${id}::${row.coach_id}`);
    }
  }
  return out;
}

/** Insert one sent-mail contact-log row. created_by intentionally omitted
 *  (nullable FK — this write has no human actor, unlike recordGmailTouch's
 *  app-triggered send). contact_date is the ACTUAL send time so a wide
 *  backfill lands with correct history instead of "now". */
async function insertSentContactLog(
  supabase: ReturnType<typeof createAdminClient>,
  message: SentGmailMessage,
  coachId: string,
): Promise<boolean> {
  const { error } = await supabase.from('crm_contact_log').insert({
    coach_id: coachId,
    contact_type: 'email',
    subject: message.subject,
    notes: 'Synced from Gmail Sent (ingest-gmail-replies)',
    contact_date: message.sentAt,
    metadata: { channel: 'gmail_api', gmail_message_id: message.gmailId, source: 'gmail_sent_sync' },
  });
  if (error) {
    await logServerError(`ingest-gmail-replies sent-mail contact-log insert failed: ${error.message}`, {
      action: 'cron.ingest_gmail_replies', featureArea: 'crm', source: 'cron',
      extra: { gmailId: message.gmailId, coachId },
    });
    return false;
  }
  return true;
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
