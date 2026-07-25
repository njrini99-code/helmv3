'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Enums, Tables } from '@/lib/types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { sendOpsAlert } from '@/lib/admin/digest/transport';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { CommonSchemas } from '@/lib/validation/server-action-validator';

async function captureRequestContext() {
  const h = await headers();
  return {
    ip: capped(
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip'),
      100,
    ),
    userAgent: capped(h.get('user-agent'), MAX_HEADER_VALUE),
    referer: capped(h.get('referer'), MAX_HEADER_VALUE),
    country: capped(h.get('x-vercel-ip-country'), 8),
    city: capped(h.get('x-vercel-ip-city'), 120),
  };
}

/**
 * Server action to handle demo request submissions from the landing page.
 * Saves the request to demo_requests and keeps the crm_coaches mirror in sync.
 */

export interface DemoRequestResult {
  success: boolean;
  error?: string;
}

/**
 * Which marketing surface captured the lead. The form is mounted in three
 * places (RequestDemoModal, PricingView, MobileNav) and the row used to record
 * none of them, so there was no way to tell which surface actually converts.
 * Persisted to demo_requests.source.
 */
export type DemoRequestSource = 'landing' | 'pricing' | 'mobile_nav';

export interface DemoRequestDetails {
  /** Requester's name, from the landing modal. */
  name?: string;
  /** Program / school, from the landing modal. Persisted as organization. */
  school?: string;
  /** Optional phone number. No current caller collects one; the column is real. */
  phone?: string;
  /** Optional free-text note from the requester. Same — column is real, unwired. */
  message?: string;
  /** Which marketing surface captured the lead (defaults to 'landing'). */
  source?: DemoRequestSource;
}

/**
 * Attribution columns added by
 * supabase/migrations/20260724000000_crm_inbound_signal_capture.sql.
 *
 * `Database` is generated from the *deployed* schema, so it does not carry
 * these until that migration is applied and `db:types` re-runs. Declaring the
 * shape here keeps the insert payload fully typed — a typo'd column name or a
 * wrong value type is still a compile error — rather than reaching for `any`.
 *
 * postgrest-js additionally rejects any key it can't find in the generated
 * Insert type (`RejectExcessProperties`), so the payload is widened back with a
 * single assertion at the `.insert()` boundary. The extra keys are still sent
 * to PostgREST exactly as written; only the compile-time view is narrowed.
 *
 * Once typegen catches up, delete this interface, the
 * DemoRequestInsertWithAttribution alias and that one assertion.
 */
interface PendingDemoRequestAttribution {
  source: string;
  referer: string | null;
  ip: string | null;
  user_agent: string | null;
  country: string | null;
  city: string | null;
  crm_coach_id: string | null;
}

type CoachStatus = Enums['coach_status'];
type CrmCoachUpdate = Tables['crm_coaches']['Update'];
type DemoRequestInsert = Tables['demo_requests']['Insert'];
type DemoRequestInsertWithAttribution = DemoRequestInsert & PendingDemoRequestAttribution;

/**
 * Header values are attacker-controlled — a forged user-agent or referer can be
 * arbitrarily long — and the attribution columns are unbounded `text`, so cap
 * everything we persist from the request context. The limit sits far above any
 * real-world value, so nothing legitimate is ever truncated.
 */
const MAX_HEADER_VALUE = 1000;

/**
 * crm_coaches.notes is the running history an admin actually reads, and a coach
 * who keeps requesting demos would otherwise grow it without bound. Keep the
 * most recent slice and mark the cut, so a truncated first line is never
 * mistaken for the original note.
 */
const CRM_NOTES_MAX = 4000;

/** Trim, drop empties, and cap — used for every free-text value we persist. */
function capped(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * Canonical form of a visitor-typed address: trimmed and lowercased.
 *
 * Applied ONCE at the top of submitDemoRequest so every downstream write —
 * the crm_coaches lookup, the crm_coaches insert, the demo_requests insert and
 * every log line — sees the same value. Mail domains are case-insensitive and
 * effectively every real provider treats the local-part that way too, so
 * `Coach@Example.edu` and `coach@example.edu` are one mailbox and must produce
 * one lead, not two.
 *
 * This is the STORE half of the fix. Normalising what we write stops NEW
 * mixed-case rows from appearing, but it cannot match the mixed-case rows
 * already sitting in crm_coaches from CSV imports — that is what the
 * case-insensitive lookup in findCoachByEmail() is for. Both halves are needed.
 */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Neutralise LIKE metacharacters so an address is matched literally.
 * `_` is legal and common in email local-parts (`john_smith@x.edu`) and would
 * otherwise act as a single-character wildcard. Correctness does not depend on
 * this — findCoachByEmail re-verifies every hit by exact compare — but without
 * it a lookup can pull unrelated rows and lose the real one behind the limit.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function appendCrmNote(existing: string | null, line: string): string {
  const merged = existing?.trim() ? `${existing.trim()}\n${line}` : line;
  if (merged.length <= CRM_NOTES_MAX) return merged;
  return `…(earlier notes truncated)\n${merged.slice(-CRM_NOTES_MAX)}`;
}

/**
 * crm_coaches.status is a progress ladder — new_lead → contacted → engaged →
 * proposal → won — plus two off-ladder resting states, 'lost' and 'nurture'.
 * A fresh inbound demo request is a live buying signal, so it re-opens a
 * resting row back to 'new_lead'. It must never drag a coach who is already
 * further along backwards, and 'won' is never touched at all.
 *
 * Returns null when the current status should be left exactly as it is.
 */
function reopenedStatusForRepeatRequest(current: CoachStatus | null): CoachStatus | null {
  if (!current) return 'new_lead';
  return current === 'lost' || current === 'nurture' ? 'new_lead' : null;
}

/** The crm_coaches columns syncCrmCoachForRequest reads back. */
interface ExistingCoachRow {
  id: string;
  name: string | null;
  school: string | null;
  phone: string | null;
  notes: string | null;
  status: CoachStatus | null;
  email: string | null;
}

/**
 * Find the crm_coaches row for `email`, CASE-INSENSITIVELY. `email` must
 * already be normalized (lowercased) by normalizeEmail().
 *
 * WHY TWO PASSES. crm_coaches.email keeps whatever casing its import CSV had,
 * so a plain `.eq('email', email)` compares a lowercase needle against
 * mixed-case hay and misses every coach stored as, say,
 * `Christopher.Jones@LR.edu`. That miss is not benign: syncCrmCoachForRequest
 * then takes its create branch and inserts a SECOND coach row for a coach we
 * already have, so the repeat request still leaves no trace on the real row —
 * the exact failure this function was rewritten to fix, reintroduced through a
 * different door. Two submissions of one address typed with different casing
 * would likewise create two rows nothing ever merges.
 *
 *   pass 1  `.eq()` on the normalized value. Indexed, and covers the rows
 *           already stored lowercase (the overwhelming majority).
 *   pass 2  only if pass 1 missed: one `.ilike()`, with every hit re-verified
 *           by an exact lowercase compare. That re-check is the real guarantee
 *           — a stray LIKE wildcard can widen the fetch but can never produce a
 *           wrong match, which matters because `email` is visitor-supplied.
 *
 * Mirrors resolveCoachIdsByEmail() in the ingest-gmail-replies cron, which
 * solves the identical problem for inbound mail. Three call sites now carry a
 * local escapeLikePattern (here, the cron, both demo-access twins) — worth
 * lifting into a shared crm helper once these land together.
 */
async function findCoachByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ row: ExistingCoachRow | null; failed: boolean }> {
  // The column list is repeated as a literal in both passes on purpose:
  // postgrest-js derives the row type from the select STRING LITERAL, so
  // hoisting it into a `const` would erase the inferred shape.

  // nosemgrep: coderabbit.semgrep.helmv3-server-action-missing-auth-check -- anonymous public action; service-role scope is limited to this fixed-shape crm_coaches lead upsert
  const { data: exact, error: exactError } = await admin
    .from('crm_coaches')
    .select('id, name, school, phone, notes, status, email')
    .eq('email', email)
    .maybeSingle();

  if (exactError) {
    await logServerError(`CRM coach lookup failed for demo request: ${JSON.stringify(exactError)}`, {
      action: 'demo_request.findCoachByEmail',
      errorCode: exactError.code,
      metadata: { email },
    });
    return { row: null, failed: true };
  }
  if (exact) return { row: exact as ExistingCoachRow, failed: false };

  // nosemgrep: coderabbit.semgrep.helmv3-server-action-missing-auth-check -- see above; case-insensitive retry over the same fixed-shape lookup
  const { data: fuzzy, error: fuzzyError } = await admin
    .from('crm_coaches')
    .select('id, name, school, phone, notes, status, email')
    .ilike('email', escapeLikePattern(email))
    .limit(5);

  if (fuzzyError) {
    await logServerError(
      `CRM coach case-insensitive lookup failed for demo request: ${JSON.stringify(fuzzyError)}`,
      {
        action: 'demo_request.findCoachByEmail',
        errorCode: fuzzyError.code,
        metadata: { email },
      },
    );
    return { row: null, failed: true };
  }

  const verified = ((fuzzy ?? []) as ExistingCoachRow[]).find(
    (row) => row.email?.toLowerCase() === email,
  );
  return { row: verified ?? null, failed: false };
}

interface CrmCoachSyncInput {
  email: string;
  name: string | null;
  school: string | null;
  phone: string | null;
  source: DemoRequestSource;
  submittedAt: string;
}

/**
 * Create-or-touch the crm_coaches convenience row for this request and return
 * its id, so the demo_requests row can carry the link.
 *
 * Landing-page visitors are anonymous and crm_coaches RLS is admin-only, so the
 * lookup + write must run as service role — under the visitor session both
 * silently RLS-fail and no lead row is ever created.
 *
 * This used to bail out entirely whenever the email already existed, which
 * meant a repeat request from a *known* coach left no coach-level trace at all:
 * the only evidence was a second demo_requests row nobody was watching. Now the
 * existing row is touched instead, which is what actually puts the coach back
 * in front of a human.
 *
 * Never throws — the lead itself is what matters and the coach row is a
 * convenience. Returns null when the coach could not be resolved.
 */
async function syncCrmCoachForRequest(input: CrmCoachSyncInput): Promise<string | null> {
  const { email, name, school, phone, source, submittedAt } = input;

  const noteLine = [
    `${submittedAt.slice(0, 10)} — demo request from the ${source} surface`,
    school ? `Program: ${school}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  try {
    const admin = createAdminClient();
    // `email` arrives normalized (see normalizeEmail at the call site), and the
    // lookup is case-insensitive so a coach already stored with import casing
    // is TOUCHED rather than duplicated.
    const { row: existing, failed } = await findCoachByEmail(admin, email);

    // A failed lookup must not fall through to the create branch — that would
    // insert a duplicate coach row on every transient CRM error.
    if (failed) return null;

    if (!existing) {
      // nosemgrep: coderabbit.semgrep.helmv3-server-action-missing-auth-check -- see above; values are derived server-side from the validated email only
      const { data: created, error: coachError } = await admin
        .from('crm_coaches')
        .insert({
          // crm_coaches.name and .school are NOT NULL, so the placeholders stay.
          // demo_requests keeps the honest nulls — see the insert below.
          name: name || email.split('@')[0] || 'Unknown',
          email,
          phone,
          school: school || email.split('@')[1]?.split('.')[0] || 'Unknown',
          conference: 'Unknown',
          division: 'D3',
          program: 'both',
          status: 'new_lead',
          source: 'website',
          notes: noteLine,
          next_follow_up_at: submittedAt,
        })
        .select('id')
        .maybeSingle();

      if (coachError) {
        await logServerError(
          `CRM coach creation failed for demo request: ${JSON.stringify(coachError)}`,
          { action: 'demo_request.syncCrmCoach', errorCode: coachError.code, metadata: { email } },
        );
        return null;
      }
      return created?.id ?? null;
    }

    const patch: CrmCoachUpdate = {
      notes: appendCrmNote(existing.notes, noteLine),
      // A live inbound request outranks whatever cadence was previously
      // scheduled — pull the follow-up forward instead of leaving a date weeks
      // out on a coach who just raised their hand.
      next_follow_up_at: submittedAt,
      updated_at: submittedAt,
    };

    const reopened = reopenedStatusForRepeatRequest(existing.status);
    if (reopened) patch.status = reopened;

    // Backfill the placeholders the create path stamps once the visitor finally
    // gives us a real value — but never overwrite a real one we already hold.
    if (name && (!existing.name || existing.name === 'Unknown')) patch.name = name;
    if (school && (!existing.school || existing.school === 'Unknown')) patch.school = school;
    if (phone && !existing.phone) patch.phone = phone;

    // nosemgrep: coderabbit.semgrep.helmv3-server-action-missing-auth-check -- see above; service-role scope is limited to this fixed-shape crm_coaches lead touch
    const { error: updateError } = await admin
      .from('crm_coaches')
      .update(patch)
      .eq('id', existing.id);

    if (updateError) {
      await logServerError(
        `CRM coach touch failed for demo request: ${JSON.stringify(updateError)}`,
        {
          action: 'demo_request.syncCrmCoach',
          errorCode: updateError.code,
          metadata: { email, coachId: existing.id },
        },
      );
    }

    // The link is still correct even when the touch failed — the row exists.
    return existing.id;
  } catch (coachError) {
    await logServerError(
      `CRM coach sync threw for demo request: ${coachError instanceof Error ? coachError.message : JSON.stringify(coachError)}`,
      { action: 'demo_request.syncCrmCoach', metadata: { email } },
    );
    return null;
  }
}

export async function submitDemoRequest(
  rawEmail: string,
  details?: DemoRequestDetails,
): Promise<DemoRequestResult> {
  // Canonicalize BEFORE validating, so a pasted address with stray whitespace
  // ("  Coach@Example.edu ") is accepted, and so the single `email` used from
  // here down — CRM lookup, CRM insert, demo_requests insert, logs, ops alert —
  // is the same canonical string everywhere.
  const parsedEmail = CommonSchemas.email.safeParse(rawEmail ?? '');
  if (!parsedEmail.success) {
    return { success: false, error: 'Please enter a valid email address' };
  }
  const email = normalizeEmail(parsedEmail.data);

  // Cap free-text lengths — these flow into CRM rows and the ops alert.
  const name = capped(details?.name, 120);
  const school = capped(details?.school, 160);
  const phone = capped(details?.phone, 40);
  const message = capped(details?.message, 2000);
  const source: DemoRequestSource = details?.source ?? 'landing';

  const requestContext = await captureRequestContext();

  try {
    // This anonymous action writes through the service-role client after its
    // public lead insert. Budget it before either write so a bot cannot turn
    // the CRM into an unbounded row-creation endpoint. Separate IP and mailbox
    // budgets stop both one client cycling aliases and one address cycling
    // networks. They are independent, so do both checks concurrently.
    const [ipRate, emailRate] = await Promise.all([
      checkRateLimit(`demo-request:ip:${requestContext.ip ?? 'unknown'}`, RATE_LIMITS.DEMO_REQUEST),
      checkRateLimit(`demo-request:email:${email}`, RATE_LIMITS.DEMO_REQUEST),
    ]);
    if (!ipRate.allowed || !emailRate.allowed) {
      return {
        success: false,
        error: 'Too many requests. Please wait a few minutes and try again.',
      };
    }

    const submittedAt = new Date().toISOString();

    // Resolve the CRM coach FIRST so demo_requests can carry the link in the
    // same INSERT. demo_requests is written with the visitor's anonymous
    // session, which is granted INSERT and nothing else — there is no id to
    // read back through RETURNING and no UPDATE available to patch the link on
    // afterwards, so this is the only ordering where one statement carries
    // both. syncCrmCoachForRequest never throws: a CRM outage degrades to
    // crm_coach_id = null and the lead still lands.
    const crmCoachId = await syncCrmCoachForRequest({
      email,
      name,
      school,
      phone,
      source,
      submittedAt,
    });

    const supabase = await createClient();

    // The structured columns are the source of truth. `notes` keeps the same
    // human-readable sentence it always had purely for backwards compatibility
    // with the admin views already rendering it — nothing new should read it.
    const demoRequestRow: DemoRequestInsertWithAttribution = {
      email,
      interest_type: 'other',
      status: 'pending',
      name,
      organization: school,
      phone,
      message,
      source,
      referer: requestContext.referer,
      ip: requestContext.ip,
      user_agent: requestContext.userAgent,
      country: requestContext.country,
      city: requestContext.city,
      crm_coach_id: crmCoachId,
      notes: [
        `Submitted from ${source} page`,
        name ? `Name: ${name}` : null,
        school ? `Program: ${school}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    };

    // Save to demo_requests table.
    // interest_type CHECK allows: baseball_coach | baseball_player | golf_coach
    //   | golf_player | organization | other → use 'other' for landing-page leads.
    // status CHECK allows: pending | contacted | scheduled | completed | declined.
    // The `as` only widens back to the generated Insert type — see
    // PendingDemoRequestAttribution above for why it is needed and when to drop it.
    // nosemgrep: coderabbit.semgrep.helmv3-server-action-missing-auth-check -- public landing-page capture form; callers are anonymous by design, RLS allows anon INSERT only
    const { error } = await supabase.from('demo_requests').insert(demoRequestRow as DemoRequestInsert);

    if (error) {
      // Supabase PostgrestError is a plain object — String(err) yields "[object Object]".
      // Stringify the whole shape so code/details/hint actually reach the log.
      await logServerError(
        `Failed to save demo request: ${JSON.stringify(error)}`,
        {
          action: 'demo_request.submitDemoRequest',
          errorCode: error.code,
          errorHint: error.hint,
          errorDetails: error.details,
          metadata: { email, source, crmCoachId, ...requestContext },
        },
      );
      return { success: false, error: 'Something went wrong. Please try again.' };
    }

    // A hot lead shouldn't wait for someone to open the CRM tab — alert ops
    // immediately. This fires in EVERY environment: gating it on production
    // meant preview and local submissions vanished with no trace anywhere,
    // which is exactly how a broken capture form ships unnoticed. Non-production
    // subjects carry the environment name so they stay filterable instead of
    // being mistaken for real inbound. sendOpsAlert is fail-soft, so an
    // unconfigured environment simply skips.
    const vercelEnv = process.env.VERCEL_ENV ?? null;
    const envLabel = vercelEnv ?? process.env.NODE_ENV ?? 'development';
    const subjectPrefix = vercelEnv === 'production' ? '' : `[${envLabel}] `;

    try {
      await sendOpsAlert({
        subject: `${subjectPrefix}New demo request — ${school ? `${school} (${email})` : email}`,
        text: [
          `${name ? `${name} <${email}>` : email} just requested a demo from the ${source} page.`,
          school ? `Program: ${school}` : null,
          phone ? `Phone: ${phone}` : null,
          message ? `Message: ${message}` : null,
          requestContext.country
            ? `From: ${[requestContext.city, requestContext.country].filter(Boolean).join(', ')}`
            : null,
          '',
          'Inbound leads: https://helmsportslabs.com/golf/admin/crm',
        ]
          .filter((line): line is string => line !== null)
          .join('\n'),
      });
    } catch {
      // Alerting must never break the signup flow.
    }

    // Refresh admin CRM lead lists so a new submission appears immediately.
    revalidatePath('/golf/admin');
    revalidatePath('/baseball/admin');

    return { success: true };
  } catch (error) {
    await logServerError(
      `Failed to save demo request: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
      { action: 'demo_request.submitDemoRequest', metadata: { email, source, ...requestContext } },
    );
    return { success: false, error: 'Something went wrong. Please try again.' };
  }
}
