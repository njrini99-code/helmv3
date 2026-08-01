'use server';

// ============================================================================
// CRM GMAIL SEND — send cold outreach directly through the Workspace mailbox
// (Gmail API), NOT Resend. One-click per coach + a paced, capped batch.
// ============================================================================
//
// Deliverability-first by design:
//   • true text/plain, 1:1, personalized (mergeTags) — Primary-inbox shape
//   • suppression-list + email_status checks before every send
//   • the batch is PACED (delay between sends) and hard-capped per day, because
//     burst sending from a real mailbox is the #1 way to trip Google's outbound
//     spam detection / get the Workspace throttled
//   • inert until configured (service-account env) — see gmail-send.ts
//
// Every send logs a crm_contact_log row (metadata.channel='gmail_api') and flips
// new_lead -> contacted, exactly like the manual Gmail-compose path.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isGmailSendConfigured, sendGmailEmail } from '@/lib/crm/gmail-send';
import { htmlToText } from '@/lib/crm/html-to-text';
import { verifyEmailDeliverability } from '@/lib/crm/email-verify';
import { checkDomainAuth, type DomainAuthResult } from '@/lib/crm/domain-auth-check';
import { mergeTags, type Recipient } from '@/lib/crm/merge-tags';
import { applyUnsubTag } from '@/lib/crm/unsubscribe-token';
import { buildListUnsubscribeHeaders } from '@/lib/crm/outreach-headers';
import { describeError } from '@/lib/utils/describe-error';
import { logServerError, logServerException } from '@/lib/server-error-logger';

const CRM_REVALIDATE_PATH = '/golf/admin/crm';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const DEFAULT_DAILY_CAP = Number(process.env.GMAIL_DAILY_CAP ?? '50');
const MAX_PER_CALL = 15; // serverless-timeout-safe with pacing
// Randomized pacing between sends — a fixed gap is itself a machine-like
// signal, so we jitter each gap to look human and dodge burst/cadence detection.
const SEND_GAP_MIN_MS = 2000;
const SEND_GAP_MAX_MS = 6000;
const jitterGapMs = () => SEND_GAP_MIN_MS + Math.floor(Math.random() * (SEND_GAP_MAX_MS - SEND_GAP_MIN_MS));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Founder-set 2026-07-20: the old auto warm-up ramp (5 → 10 → full cap over the
// first 2 days, keyed off the first-ever Gmail-API send in the log) was stale
// logic — the mailbox (admin@helmsportslabs.com) has been sending for weeks and
// was still getting stuck re-ramping at 10/day. Just run the configured cap
// (env GMAIL_DAILY_CAP, default 50). Kept as an async function taking the same
// client shape so every call site (single send + batch send) is unchanged if a
// per-mailbox ceiling needs to come back later.
async function effectiveDailyCap(_client: AnySupabase): Promise<number> {
  return DEFAULT_DAILY_CAP;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single<{ role: string }>();
  if (!profile || profile.role !== 'admin') throw new Error('Forbidden');
  return { supabase: supabase as AnySupabase, user };
}

export async function getGmailSendStatus(): Promise<{ configured: boolean; sentToday?: number; dailyCap?: number }> {
  // Admin-gated for consistency with the send actions. Non-admins simply see the
  // feature as unconfigured (the UI catches + keeps the compose-link flow).
  let supabase: AnySupabase;
  try {
    ({ supabase } = await requireAdmin());
  } catch {
    return { configured: false };
  }
  if (!isGmailSendConfigured()) return { configured: false };
  // Usage surfaced next to "Direct send" (e.g. "N of 50 sent today") — same
  // count query sendNextBatchViaGmail gates the batch on, and the same cap
  // sendCoachViaGmail / sendNextBatchViaGmail enforce, so the number shown
  // always matches what the send actions would actually allow.
  const [sentToday, dailyCap] = await Promise.all([
    countSentToday(supabase),
    effectiveDailyCap(supabase),
  ]);
  return { configured: true, sentToday, dailyCap };
}

/**
 * SPF/DKIM/DMARC self-check for the sending domain (derived from GMAIL_SEND_AS,
 * else HELM_DOMAIN). Admin-gated; returns {checked:false} for non-admins or when
 * no domain is configured. Powers the "email auth" indicator next to direct send.
 */
export async function getDomainAuthStatus(): Promise<{ checked: boolean; result?: DomainAuthResult }> {
  try {
    await requireAdmin();
  } catch {
    return { checked: false };
  }
  const sendAs = process.env.GMAIL_SEND_AS ?? '';
  const domain = sendAs.includes('@') ? sendAs.split('@')[1]! : (process.env.HELM_DOMAIN ?? '');
  if (!domain) return { checked: false };
  try {
    return { checked: true, result: await checkDomainAuth(domain) };
  } catch {
    return { checked: false };
  }
}

// Count of today's Gmail-API sends, for the daily cap.
async function countSentToday(client: AnySupabase): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count } = await client
    .from('crm_contact_log')
    .select('id', { count: 'exact', head: true })
    .eq('metadata->>channel', 'gmail_api')
    .gte('contact_date', start.toISOString());
  return count ?? 0;
}

// Shared post-send bookkeeping: contact-log row + new_lead -> contacted flip.
//
// CRITICAL: by the time this runs the email has ALREADY been sent, so this must
// NEVER throw — a bookkeeping hiccup must not flip a real send to "failed" (that
// would invite a double-send). Each write is best-effort and logged on failure.
// The status flip is what dedups the batch, so we attempt it even if the
// contact-log insert failed (and vice versa).
async function recordGmailTouch(
  client: AnySupabase,
  userId: string,
  coach: { id: string; status: string | null },
  subject: string,
  gmailId: string,
  templateId?: string | null,
) {
  const nowIso = new Date().toISOString();
  try {
    const { error } = await client.from('crm_contact_log').insert({
      coach_id: coach.id,
      contact_type: 'email',
      subject,
      notes: 'Sent via Gmail (direct)',
      created_by: userId,
      metadata: {
        channel: 'gmail_api',
        gmail_message_id: gmailId,
        // Stamp the template on every send so usage is reconstructable from the
        // log (usage_count alone is a lossy counter that history showed nobody
        // was incrementing on this path).
        // snake_case key — the canonical form the bulk route, the historical
        // backfill, and get_crm_template_performance's join all use.
        ...(templateId ? { template_id: templateId } : {}),
      },
    });
    if (error) throw error;
  } catch (err) {
    console.error('[crm] gmail recordGmailTouch: contact-log insert failed:', err);
  }
  try {
    const updates: Record<string, unknown> = { last_contacted_at: nowIso, updated_at: nowIso };
    if (coach.status === 'new_lead') updates.status = 'contacted';
    const { error } = await client.from('crm_coaches').update(updates).eq('id', coach.id);
    if (error) throw error;
  } catch (err) {
    console.error('[crm] gmail recordGmailTouch: status flip failed:', err);
  }
}

/**
 * Increment a template's usage_count by the number of emails actually sent and
 * stamp last_used_at. Best-effort — a failed bump never fails the send.
 */
async function bumpTemplateUsage(client: AnySupabase, templateId: string, sentCount: number) {
  if (!templateId || sentCount <= 0) return;
  try {
    const { data: tpl } = await client
      .from('crm_email_templates')
      .select('usage_count')
      .eq('id', templateId)
      .maybeSingle();
    const { error } = await client
      .from('crm_email_templates')
      .update({
        usage_count: ((tpl?.usage_count as number | null) ?? 0) + sentCount,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', templateId);
    if (error) throw error;
  } catch (err) {
    console.error('[crm] gmail bumpTemplateUsage failed:', err);
  }
}

/**
 * Map a template body + format to the Gmail send parts. An html-format body
 * goes out as multipart/alternative (derived text fallback + the html
 * document); anything else stays the deliverability-optimal bare text/plain.
 * Without this, an html template's markup was sent as literal text — the
 * "raw <!DOCTYPE html> in the prospect's inbox" bug.
 */
function toSendParts(body: string, format: string | null | undefined): { text: string; html?: string } {
  const isHtml = format === 'html' || /^\s*(<!DOCTYPE|<html)/i.test(body);
  if (!isHtml) return { text: body };
  return { text: htmlToText(body), html: body };
}

async function isSuppressed(client: AnySupabase, email: string): Promise<boolean> {
  // NOTE: crm_email_suppressions is UNIQUE(email, reason) — one address can have
  // MULTIPLE rows (e.g. hard_bounce + complained). .maybeSingle() would ERROR on
  // 2+ rows and report the address as NOT suppressed — the exact opposite of
  // what we want for a multiply-suppressed (most-do-not-contact) address. Use a
  // limited list + presence check instead.
  const { data } = await client
    .from('crm_email_suppressions')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// Persist a verification failure so a dead address is only ever attempted once
// (the send gate skips any non-'valid' email_status). Best-effort.
async function markUndeliverable(client: AnySupabase, coachId: string) {
  try {
    await client
      .from('crm_coaches')
      .update({ email_status: 'unknown', updated_at: new Date().toISOString() })
      .eq('id', coachId);
  } catch (err) {
    console.error('[crm] gmail markUndeliverable failed:', err);
  }
}

/**
 * Send ONE coach directly via Gmail. The client passes the already-merged
 * subject + body (it has the armed template). Returns ok/error; never throws to
 * the client.
 */
export async function sendCoachViaGmail(input: {
  coach_id: string;
  subject: string;
  body: string;
  /** Format of the armed template ('html' bodies go out multipart). Bodies that
   *  look like an HTML document are sent multipart even without this flag. */
  format?: string | null;
  /** Template the body was merged from — stamped into the contact log and
   *  counted toward the template's usage. */
  template_id?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!isGmailSendConfigured()) return { ok: false, error: 'Gmail send not configured' };
    const { supabase, user } = await requireAdmin();

    const { data: coach } = await supabase
      .from('crm_coaches')
      .select('id, name, email, email_status, status')
      .eq('id', input.coach_id)
      .maybeSingle();
    if (!coach?.email) return { ok: false, error: 'No email on file' };
    if (coach.email_status && coach.email_status !== 'valid') {
      return { ok: false, error: `Skipped (${coach.email_status})` };
    }
    if (await isSuppressed(supabase, coach.email)) {
      return { ok: false, error: 'Skipped (on do-not-contact list)' };
    }
    // Honor the same daily cap as the batch — rapid manual clicks burst from the
    // warmed mailbox exactly like a batch would, so the Workspace-throttle guard
    // has to cover single sends too. Uses the configured cap (no ramp).
    const dailyCap = await effectiveDailyCap(supabase);
    if (await countSentToday(supabase) >= dailyCap) {
      return { ok: false, error: `Daily Gmail send cap (${dailyCap}) reached` };
    }
    // Anti-bounce: confirm the address is deliverable before sending. A failure
    // persists as 'unknown' so it's skipped on every future attempt.
    const verdict = await verifyEmailDeliverability(coach.email);
    if (!verdict.deliverable) {
      await markUndeliverable(supabase, coach.id);
      return { ok: false, error: `Skipped (undeliverable: ${verdict.reason})` };
    }

    const parts = toSendParts(applyUnsubTag(input.body, coach.id), input.format);
    // One-click unsubscribe headers ride on EVERY Gmail send — CAN-SPAM's
    // opt-out mechanism must not depend on the template body carrying
    // {unsubscribe_url} (most plain templates don't).
    const { id } = await sendGmailEmail({
      to: coach.email,
      subject: input.subject,
      extraHeaders: buildListUnsubscribeHeaders(coach.id),
      ...parts,
    });
    await recordGmailTouch(supabase, user.id, coach, input.subject, id, input.template_id);
    if (input.template_id) await bumpTemplateUsage(supabase, input.template_id, 1);
    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true };
  } catch (err) {
    await logServerException(err, {
      action: 'crm_gmail_send.sendCoachViaGmail',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
      metadata: { coachId: input.coach_id, subject: input.subject },
    });
    return { ok: false, error: describeError(err) };
  }
}

const HEAD_ROLES = new Set(['head_coach', 'director', 'associate_head_coach']);
function isDecisionMaker(c: { role_level: string | null; is_primary_contact: boolean | null }): boolean {
  const r = (c.role_level ?? '').toLowerCase();
  if (r === 'assistant_coach' || r === 'volunteer') return false;
  if (HEAD_ROLES.has(r)) return true;
  return c.is_primary_contact === true;
}

interface BatchCoach {
  id: string; name: string; email: string | null; email_status: string | null;
  status: string | null; school: string; role_level: string | null;
  is_primary_contact: boolean | null; last_contacted_at: string | null;
  conference: string | null; division: string | null; title: string | null;
}

/**
 * Send the next batch directly via Gmail — head/primary decision-maker, ONE per
 * school, new_lead, valid email, not recently contacted, not suppressed. Paced
 * and hard-capped per day. Returns a summary; safe to re-run.
 */
export async function sendNextBatchViaGmail(input: {
  limit?: number;
  templateId: string;
}): Promise<{ ok: boolean; sent: number; skipped: number; failed: number; capped?: boolean; error?: string; details: Array<{ name: string; school: string; status: 'sent' | 'failed'; reason?: string }> }> {
  const empty = { sent: 0, skipped: 0, failed: 0, details: [] as Array<{ name: string; school: string; status: 'sent' | 'failed'; reason?: string }> };
  try {
    if (!isGmailSendConfigured()) return { ok: false, ...empty, error: 'Gmail send not configured' };
    const { supabase, user } = await requireAdmin();

    const { data: tpl } = await supabase
      .from('crm_email_templates')
      .select('subject, body, format')
      .eq('id', input.templateId)
      .maybeSingle();
    if (!tpl?.subject || !tpl?.body) return { ok: false, ...empty, error: 'Template not found' };

    const dailyCap = await effectiveDailyCap(supabase); // configured cap (no ramp)
    const sentToday = await countSentToday(supabase);
    const remaining = Math.max(0, dailyCap - sentToday);
    if (remaining === 0) return { ok: true, ...empty, capped: true };
    const limit = Math.min(input.limit ?? 10, MAX_PER_CALL, remaining);

    // Candidate decision-makers: new_lead, has email. Fetch a generous slice and
    // dedupe to one-per-school + drop suppressed/recently-contacted in JS.
    const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data: rows } = await supabase
      .from('crm_coaches')
      .select('id, name, email, email_status, status, school, role_level, is_primary_contact, last_contacted_at, conference, division, title')
      .eq('status', 'new_lead')
      .not('email', 'is', null)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('priority', { ascending: false })
      // 1000 is PostgREST's hard cap — asking for more returns 1000 anyway.
      // Ordered by priority desc, and only ~10 survive dedupe + suppression,
      // so one page is a generous candidate pool.
      .limit(1000);

    // Authoritative anti-double-send: exclude any coach we ALREADY sent to via
    // Gmail in the last 7 days, keyed off crm_contact_log (the record of the
    // actual send) rather than the mutable crm_coaches.status. This closes the
    // re-send window where a post-send status flip silently failed but the email
    // went out — without it that coach stays new_lead and gets contacted again.
    const recentlySent = new Set<string>();
    const { data: recentLog } = await supabase
      .from('crm_contact_log')
      .select('coach_id')
      .eq('metadata->>channel', 'gmail_api')
      .gte('contact_date', sevenDaysAgo);
    for (const r of (recentLog ?? []) as Array<{ coach_id: string }>) {
      if (r.coach_id) recentlySent.add(r.coach_id);
    }

    const candidates = ((rows ?? []) as BatchCoach[]).filter(
      (c) => c.email && (c.email_status === 'valid' || !c.email_status) && isDecisionMaker(c)
        && (!c.last_contacted_at || c.last_contacted_at < sevenDaysAgo)
        && !recentlySent.has(c.id),
    );

    // Mutually-exclusive channels: a coach already being worked by an ACTIVE
    // Resend sequence enrollment must NOT also be queued in this manual/direct
    // Gmail batch (mirrors TodayQueue's manual worklist, which hides any school
    // with an active enrollment for the same reason). Batched in chunks of 500
    // — same chunk size as getCoachSequenceEnrollmentStatuses in
    // crm-sequences.ts — so this stays a handful of queries, never one per coach.
    const activeEnrolledIds = new Set<string>();
    for (let i = 0; i < candidates.length; i += 500) {
      const chunk = candidates.slice(i, i + 500).map((c) => c.id);
      const { data: enrollRows } = await supabase
        .from('crm_sequence_enrollments')
        .select('coach_id')
        .eq('status', 'active')
        .in('coach_id', chunk);
      for (const r of (enrollRows ?? []) as Array<{ coach_id: string }>) {
        activeEnrolledIds.add(r.coach_id);
      }
    }
    const eligibleCandidates = candidates.filter((c) => !activeEnrolledIds.has(c.id));

    // One per school — explicit primary preferred, else head-most (priority order).
    const bySchool = new Map<string, BatchCoach>();
    for (const c of eligibleCandidates) {
      const key = (c.school ?? '').trim().toLowerCase();
      if (!key) continue;
      const cur = bySchool.get(key);
      if (!cur || (c.is_primary_contact && !cur.is_primary_contact)) bySchool.set(key, c);
    }
    const targets = Array.from(bySchool.values()).slice(0, limit);

    let sent = 0, skipped = 0, failed = 0;
    const details: Array<{ name: string; school: string; status: 'sent' | 'failed'; reason?: string }> = [];
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i]!;
      if (await isSuppressed(supabase, c.email!)) { skipped++; continue; }
      // Anti-bounce: verify deliverability; persist + skip dead addresses.
      const verdict = await verifyEmailDeliverability(c.email!);
      if (!verdict.deliverable) { await markUndeliverable(supabase, c.id); skipped++; continue; }
      const recipient: Recipient = {
        id: c.id, email: c.email!, name: c.name,
        title: c.title, school: c.school, conference: c.conference,
        division: c.division, program: null, team_size: null, current_software: null,
      };
      const subject = mergeTags(tpl.subject, recipient);
      const body = applyUnsubTag(mergeTags(tpl.body, recipient), c.id);
      const parts = toSendParts(body, tpl.format);
      try {
        const { id } = await sendGmailEmail({
          to: c.email!,
          subject,
          extraHeaders: buildListUnsubscribeHeaders(c.id),
          ...parts,
        });
        await recordGmailTouch(supabase, user.id, c, subject, id, input.templateId);
        sent++;
        details.push({ name: c.name, school: c.school, status: 'sent' });
      } catch (err) {
        // Per-recipient failures are rolled up into ONE log after the loop
        // (below) rather than logged here — a bad batch would otherwise spam
        // one admin_events row per recipient.
        failed++;
        details.push({ name: c.name, school: c.school, status: 'failed', reason: describeError(err) });
      }
      if (i < targets.length - 1) await sleep(jitterGapMs()); // jittered pace for deliverability
    }

    if (failed > 0) {
      await logServerError(
        `[crm-gmail-send] sendNextBatchViaGmail: ${failed} of ${targets.length} sends failed`,
        {
          action: 'crm_gmail_send.sendNextBatchViaGmail',
          source: 'server_action',
          sport: 'golf',
          featureArea: 'crm',
          metadata: {
            templateId: input.templateId,
            sentCount: sent,
            skippedCount: skipped,
            failedCount: failed,
            samples: details.filter((d) => d.status === 'failed').slice(0, 5),
          },
        },
      );
    }

    await bumpTemplateUsage(supabase, input.templateId, sent);
    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true, sent, skipped, failed, capped: sentToday + sent >= dailyCap, details };
  } catch (err) {
    await logServerException(err, {
      action: 'crm_gmail_send.sendNextBatchViaGmail',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
      metadata: { templateId: input.templateId, limit: input.limit },
    });
    return { ok: false, ...empty, error: describeError(err) };
  }
}
