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
import { verifyEmailDeliverability } from '@/lib/crm/email-verify';
import { checkDomainAuth, type DomainAuthResult } from '@/lib/crm/domain-auth-check';
import { mergeTags, type Recipient } from '@/lib/crm/merge-tags';

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

// Auto warm-up ramp: a brand-new sending mailbox must not blast its full cap on
// day one (the classic outbound-spam trip). The effective daily cap ramps from 5
// to the configured ceiling over ~3 weeks, keyed off the FIRST Gmail-API send in
// the log — so warm-up is enforced automatically instead of relying on someone
// lowering GMAIL_DAILY_CAP by hand each week.
async function effectiveDailyCap(client: AnySupabase): Promise<number> {
  let ramp = DEFAULT_DAILY_CAP;
  try {
    const { data } = await client
      .from('crm_contact_log')
      .select('contact_date')
      .eq('metadata->>channel', 'gmail_api')
      .order('contact_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!data?.contact_date) {
      ramp = 5; // day 0 — never sent before
    } else {
      const days = Math.floor((Date.now() - Date.parse(data.contact_date)) / 864e5);
      if (days < 7) ramp = 5;
      else if (days < 14) ramp = 15;
      else if (days < 21) ramp = 30;
    }
  } catch {
    /* on error, fall back to the configured ceiling (no extra restriction) */
  }
  return Math.min(DEFAULT_DAILY_CAP, ramp);
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

export async function getGmailSendStatus(): Promise<{ configured: boolean }> {
  // Admin-gated for consistency with the send actions. Non-admins simply see the
  // feature as unconfigured (the UI catches + keeps the compose-link flow).
  try {
    await requireAdmin();
  } catch {
    return { configured: false };
  }
  return { configured: isGmailSendConfigured() };
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
) {
  const nowIso = new Date().toISOString();
  try {
    const { error } = await client.from('crm_contact_log').insert({
      coach_id: coach.id,
      contact_type: 'email',
      subject,
      notes: 'Sent via Gmail (direct)',
      created_by: userId,
      metadata: { channel: 'gmail_api', gmail_message_id: gmailId },
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
    // has to cover single sends too. Uses the auto warm-up ramp.
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

    const { id } = await sendGmailEmail({ to: coach.email, subject: input.subject, text: input.body });
    await recordGmailTouch(supabase, user.id, coach, input.subject, id);
    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
      .select('subject, body')
      .eq('id', input.templateId)
      .maybeSingle();
    if (!tpl?.subject || !tpl?.body) return { ok: false, ...empty, error: 'Template not found' };

    const dailyCap = await effectiveDailyCap(supabase); // auto warm-up ramp
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
      .limit(2000);

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

    // One per school — explicit primary preferred, else head-most (priority order).
    const bySchool = new Map<string, BatchCoach>();
    for (const c of candidates) {
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
      const body = mergeTags(tpl.body, recipient);
      try {
        const { id } = await sendGmailEmail({ to: c.email!, subject, text: body });
        await recordGmailTouch(supabase, user.id, c, subject, id);
        sent++;
        details.push({ name: c.name, school: c.school, status: 'sent' });
      } catch (err) {
        failed++;
        details.push({ name: c.name, school: c.school, status: 'failed', reason: err instanceof Error ? err.message : String(err) });
      }
      if (i < targets.length - 1) await sleep(jitterGapMs()); // jittered pace for deliverability
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true, sent, skipped, failed, capped: sentToday + sent >= dailyCap, details };
  } catch (err) {
    return { ok: false, ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
