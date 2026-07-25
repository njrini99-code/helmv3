/**
 * recover-crm-inbound-signals.ts — one-time, MANUAL recovery pass over ~6 weeks
 * of CRM inbound signal that was either mis-recorded or never recorded at all.
 *
 * ## Why this exists
 *
 * Three separate capture bugs (fixed in the application code that ships with
 * this script) left the CRM with historical data that is wrong in two
 * different directions at once:
 *
 *   TOO MANY signals — corporate email-security appliances follow every link in
 *   our outreach before the recipient ever sees the message. Measured on
 *   production: 1,133 of 1,218 recorded link clicks (93%) fired under 2 minutes
 *   after delivery, and 178 of 220 `golf_demo_sessions` rows fired under 2
 *   minutes after that coach's send timestamp. The demo-invite email carries an
 *   auto-submitting gate link, so a scanner following it manufactured a
 *   *complete* fake session — name, email and school included. Every "220 coaches
 *   toured the product" style number in the CRM is therefore mostly machines.
 *
 *   TOO FEW signals — 170 `email_events` rows are `email.opened`/`email.clicked`
 *   with `contact_log_id IS NULL`. A null coach short-circuited the entire
 *   automations block, so those events produced no status change, no task and no
 *   enrollment. Separately `crm_coaches.last_email_event_at` /
 *   `last_email_event_type` froze at 2026-06-25 while `email_events` kept
 *   receiving traffic (christopher.jones@lr.edu has a NULL
 *   `last_email_event_type` despite 5 recorded opens), and a handful of
 *   addresses show genuine engagement with no `crm_coaches` row at all.
 *
 * Classification is delegated wholesale to `src/lib/crm/engagement-quality.ts`.
 * Read that module's header before changing anything here. The one-line version:
 * **latency is the primary discriminator and user-agent matching is not
 * trustworthy**, because the scanners spoof real browser UA strings (79 sessions
 * shared one `Chrome/142.0.7...` UA across 49 distinct IPs). This script never
 * makes its own bot judgement; it only feeds timestamps to the classifier.
 *
 * ## Safety posture
 *
 *   * DRY RUN BY DEFAULT. Nothing is written without an explicit `--apply`.
 *   * NOT wired into any cron, npm script, or CI job. It is run by hand, once,
 *     by a human who has read the dry-run output.
 *   * Idempotent. Every pass re-derives its target set from current state and
 *     skips rows that already carry the recovered value, so a re-run after a
 *     partial failure is safe.
 *   * Reversible. A copy-pasteable rollback block sits directly below this
 *     comment for the Pass 4 writes, and every `--apply` run additionally emits
 *     an exact per-row rollback `.sql` file (see `--out-dir`).
 *   * Requires migration `20260724000000_crm_inbound_signal_capture.sql` to be
 *     applied first — a preflight check fails loudly with that instruction
 *     rather than letting PostgREST return a confusing "column does not exist".
 *
 * ## Run
 *
 *   npx tsx scripts/recover-crm-inbound-signals.ts                  # dry run, all passes
 *   npx tsx scripts/recover-crm-inbound-signals.ts --only=1         # dry run, one pass
 *   npx tsx scripts/recover-crm-inbound-signals.ts --apply          # write
 *   npx tsx scripts/recover-crm-inbound-signals.ts --apply --only=1,2
 *
 * Flags:
 *   --apply                write. Without it the script changes nothing.
 *                          `--confirm` is accepted as an alias, matching the
 *                          house convention used by the other backfills.
 *   --only=1,2,3           run a subset of passes (default: 1,2,3,4,5). Passes
 *                          are independent — each re-derives what it needs — so
 *                          any subset in any order produces the same result.
 *   --allow-mirror-clear   let Pass 3 write NULL over a non-NULL mirror value.
 *                          OFF by default: see the Pass 3 notes.
 *   --assume-division=D3   division to use in Pass 5 when a brand-new coach's
 *                          division cannot be inferred from a same-domain
 *                          sibling. Without it those rows are reported and
 *                          SKIPPED rather than guessed.
 *   --out-dir=<path>       where the rollback .sql is written on --apply
 *                          (default: output/crm-signal-recovery).
 *
 * Requires env (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

// ============================================================================
// ROLLBACK — copy-pasteable SQL for the Pass 4 / Pass 5 CRM writes
// ============================================================================
//
// Run these in the Supabase SQL editor to undo the coach-facing writes. They are
// scoped entirely by the recovery tag, so they cannot touch a coach this script
// did not tag. Run them top to bottom.
//
// -- 1. Inspect first. Never roll back blind.
// SELECT id, name, email, school, status, next_follow_up_at, source, tags
// FROM public.crm_coaches
// WHERE tags @> ARRAY['missed-signal-2026-07']::text[]
// ORDER BY school, name;
//
// -- 2. Pass 5 — coaches this script CREATED (source = 'recovered').
// --    Archive rather than delete, so a real inbound lead is never destroyed by
// --    a rollback. Swap in the DELETE below only if you are certain.
// UPDATE public.crm_coaches
// SET is_archived = true, archived_at = now()
// WHERE source = 'recovered'
//   AND tags @> ARRAY['missed-signal-2026-07']::text[];
//
// -- DELETE FROM public.crm_coaches
// -- WHERE source = 'recovered'
// --   AND tags @> ARRAY['missed-signal-2026-07']::text[];
//
// -- 3. Pass 4 — next_follow_up_at. Exact ONLY if nobody has scheduled a
// --    follow-up by hand since the run; the script only ever sets this column
// --    when it was NULL or already in the past, so clearing it restores the
// --    "nothing scheduled" state for every row it touched.
// UPDATE public.crm_coaches
// SET next_follow_up_at = NULL
// WHERE tags @> ARRAY['missed-signal-2026-07']::text[]
//   AND source IS DISTINCT FROM 'recovered';
//
// -- 4. Pass 4 — status. NOT exactly reversible from SQL alone: 'engaged' is a
// --    legitimate pre-existing value, so this statement cannot tell a coach the
// --    script promoted from one who was already engaged. Use the generated
// --    per-row rollback file (printed at the end of every --apply run) for an
// --    exact restore. The statement below is the coarse fallback and will also
// --    demote coaches who were engaged before the run — read the file instead.
// -- UPDATE public.crm_coaches
// -- SET status = 'contacted'
// -- WHERE status = 'engaged'
// --   AND tags @> ARRAY['missed-signal-2026-07']::text[];
//
// -- 5. Pass 4 — the tag itself. Always exact: the tag did not exist before this
// --    script ran, so removing it is a clean revert. Do this LAST, since every
// --    statement above is scoped by it.
// UPDATE public.crm_coaches
// SET tags = array_remove(tags, 'missed-signal-2026-07')
// WHERE tags @> ARRAY['missed-signal-2026-07']::text[];
//
// Passes 1–3 write to golf_demo_sessions.traffic_quality / quality_reason /
// crm_coach_id, email_events.coach_id, and the crm_coaches mirror columns. Those
// are per-row value restores with no shared predicate to scope them, so there is
// no useful hand-written block — use the generated rollback file.
// ============================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  classifyEngagement,
  countsAsHumanEngagement,
  flagAutomatedByIpFanOut,
  FANOUT_MIN_DISTINCT_IPS,
  FANOUT_WINDOW_MS,
  type EngagementClassification,
} from '../src/lib/crm/engagement-quality';

loadEnv({ path: '.env.local' });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Tag stamped on every coach with recovered human engagement, so the whole
 * cohort is one saved-filter away in the CRM and one predicate away in SQL.
 * Month-stamped because this is a one-off remediation of a specific incident,
 * not a permanent classification — a future incident gets its own tag rather
 * than diluting this one.
 */
const RECOVERY_TAG = 'missed-signal-2026-07';

/** `crm_coaches.source` for rows Pass 5 creates. */
const RECOVERED_SOURCE = 'recovered';

/**
 * Status ladder, mirrored from `STATUS_CONFIG` in
 * `src/app/golf/admin/crm/crm-config.tsx` (that file is a .tsx carrying JSX and
 * lucide-react imports, so a node script cannot import it). Kept as ranks
 * because the only thing this script needs from the ladder is "is the proposed
 * status strictly higher than what is already there".
 */
const STATUS_RANK: Record<string, number> = {
  new_lead: 1,
  contacted: 2,
  engaged: 3,
  proposal: 4,
  won: 5,
  lost: 6,
  nurture: 7,
};

/**
 * The status recovered engagement justifies. Per
 * `src/app/golf/admin/crm/components/automations/AutomationsSeed.ts`, 'engaged'
 * means "opened or clicked our email" — it does NOT mean replied. That is
 * exactly what a recovered open/click/tour is evidence of, so it is the correct
 * and the highest defensible promotion target.
 */
const PROMOTION_STATUS = 'engaged';

/** Matches `AUTO_FOLLOWUP_DAYS.contacted` in crm-config.tsx. */
const FOLLOW_UP_DAYS = 3;

/** Expectations from the production measurement, printed for sanity-checking. */
const EXPECTED = {
  sessionsTotal: 220,
  sessionsAutomated: 178,
  sessionsHuman: 16,
  sessionsHumanPeopleMin: 10,
  sessionsHumanPeopleMax: 16,
  orphanEngagementEvents: 170,
  addressesWithoutCoach: 5,
} as const;

/** Event types that represent engagement rather than delivery mechanics. */
const ENGAGEMENT_EVENT_TYPES = ['email.opened', 'email.clicked'];

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const ARGV = process.argv.slice(2);

function flagValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = ARGV.find((arg) => arg.startsWith(prefix));
  return hit === undefined ? null : hit.slice(prefix.length);
}

const KNOWN_BOOLEAN_FLAGS = ['--apply', '--confirm', '--allow-mirror-clear', '--help'];
const KNOWN_VALUE_FLAGS = ['only', 'assume-division', 'out-dir'];

// A typo'd `--apply` degrades safely to a dry run, but a typo'd `--only=` would
// silently run every pass. Reject anything unrecognised rather than guess.
for (const arg of ARGV) {
  const isKnownBoolean = KNOWN_BOOLEAN_FLAGS.includes(arg);
  const isKnownValue = KNOWN_VALUE_FLAGS.some((name) => arg.startsWith(`--${name}=`));
  if (!isKnownBoolean && !isKnownValue) {
    console.error(`Unrecognised argument: ${arg}`);
    console.error(`Known flags: ${[...KNOWN_BOOLEAN_FLAGS, ...KNOWN_VALUE_FLAGS.map((n) => `--${n}=…`)].join(' ')}`);
    process.exit(2);
  }
}

const APPLY = ARGV.includes('--apply') || ARGV.includes('--confirm');
const ALLOW_MIRROR_CLEAR = ARGV.includes('--allow-mirror-clear');
const ASSUME_DIVISION = flagValue('assume-division');
const OUT_DIR = flagValue('out-dir') ?? join('output', 'crm-signal-recovery');

const ALL_PASSES = [1, 2, 3, 4, 5] as const;
const onlyRaw = flagValue('only');
const SELECTED_PASSES = new Set<number>(
  onlyRaw === null
    ? ALL_PASSES
    : onlyRaw
        .split(',')
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((n) => Number.isInteger(n)),
);

if (SELECTED_PASSES.size === 0) {
  console.error(`--only did not name any valid pass. Valid passes: ${ALL_PASSES.join(', ')}`);
  process.exit(2);
}
for (const pass of SELECTED_PASSES) {
  if (!(ALL_PASSES as readonly number[]).includes(pass)) {
    console.error(`--only names unknown pass ${pass}. Valid passes: ${ALL_PASSES.join(', ')}`);
    process.exit(2);
  }
}

/** One clock for the whole run, so every derived timestamp is consistent. */
const RUN_AT = new Date();

// ---------------------------------------------------------------------------
// Row shapes
//
// The client is intentionally untyped (`createClient` without the `Database`
// generic, matching scripts/backfill-qualifier-round-tags.ts) and rows are
// narrowed per query with `.returns<T[]>()`. That is not laziness: the columns
// this script reads and writes were added by migration
// 20260724000000_crm_inbound_signal_capture.sql and do not exist in
// src/lib/types/database.ts until someone re-runs `npm run db:types`, so a typed
// client would fail to compile against the very schema this script targets.
// ---------------------------------------------------------------------------

interface CoachRow {
  id: string;
  name: string;
  email: string | null;
  school: string;
  conference: string | null;
  division: string;
  program: string;
  status: string;
  source: string | null;
  tags: string[] | null;
  is_archived: boolean | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  last_email_event_at: string | null;
  last_email_event_type: string | null;
}

interface DemoSessionRow {
  id: string;
  name: string;
  email: string;
  school: string | null;
  ip: string | null;
  user_agent: string | null;
  referrer: string | null;
  entered_at: string;
  traffic_quality: string | null;
  quality_reason: string | null;
  crm_coach_id: string | null;
}

interface EmailEventRow {
  id: string;
  resend_message_id: string;
  event_type: string;
  recipient_email: string | null;
  occurred_at: string;
  contact_log_id: string | null;
  coach_id: string | null;
}

interface EmailRow {
  resend_message_id: string;
  to_addresses: string[] | null;
  sent_at: string | null;
  delivered_at: string | null;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** Page past PostgREST's 1000-row default cap, with a stable order. */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Lower-case + trim, or null. Every address join in this script goes through
 * here: the Gmail ingest bug that lost six weeks of replies was precisely a
 * case-sensitive `.in('email', senders)` against a lower-cased map, so an
 * address is never compared in its raw form anywhere below.
 */
function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function emailDomain(address: string): string | null {
  const at = address.lastIndexOf('@');
  if (at < 0 || at === address.length - 1) return null;
  return address.slice(at + 1);
}

/** Human-readable duration for the quality_reason strings and the diffs. */
function formatDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);
  if (abs < 1000) return `${sign}${abs}ms`;
  if (abs < 60_000) return `${sign}${(abs / 1000).toFixed(1)}s`;
  if (abs < 3_600_000) return `${sign}${(abs / 60_000).toFixed(1)}m`;
  if (abs < 86_400_000) return `${sign}${(abs / 3_600_000).toFixed(1)}h`;
  return `${sign}${(abs / 86_400_000).toFixed(1)}d`;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function isoOrNull(value: string | null): string {
  return value ?? 'null';
}

/** Single-quote escaping for the generated rollback file. */
function sqlLiteral(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlTextArray(value: string[] | null): string {
  if (value === null) return 'NULL';
  if (value.length === 0) return `'{}'::text[]`;
  return `ARRAY[${value.map((entry) => sqlLiteral(entry)).join(', ')}]::text[]`;
}

/**
 * Exact per-row undo statements, accumulated across passes and written to disk
 * at the end of an `--apply` run. The hand-written block at the top of this file
 * covers the tag/status/follow-up writes coarsely; this covers everything
 * exactly, including the Pass 3 mirror overwrites, which have no shared
 * predicate to scope a hand-written revert by.
 */
const rollbackStatements: string[] = [];

function recordRollback(statement: string): void {
  rollbackStatements.push(statement);
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function banner(): void {
  const line = '='.repeat(78);
  console.log(line);
  if (APPLY) {
    console.log('  *** APPLY MODE — THIS RUN WILL WRITE TO THE PRODUCTION DATABASE ***');
    console.log('  Rollback: the SQL block at the top of this file, plus the exact');
    console.log('  per-row rollback file written to ' + OUT_DIR + ' at the end.');
  } else {
    console.log('  *** DRY RUN — NOTHING WILL BE WRITTEN. Re-run with --apply to write. ***');
    console.log('  Every line below is what WOULD change, derived from live data.');
  }
  console.log(line);
  console.log(`  passes:              ${[...SELECTED_PASSES].sort((a, b) => a - b).join(', ')}`);
  console.log(`  run at:              ${RUN_AT.toISOString()}`);
  console.log(`  recovery tag:        ${RECOVERY_TAG}`);
  console.log(`  mirror clearing:     ${ALLOW_MIRROR_CLEAR ? 'ENABLED (--allow-mirror-clear)' : 'disabled (default)'}`);
  console.log(`  assumed division:    ${ASSUME_DIVISION ?? 'none — un-inferrable Pass 5 rows are skipped'}`);
  console.log(line);
  console.log('');
}

function section(title: string): void {
  console.log('');
  console.log('-'.repeat(78));
  console.log(title);
  console.log('-'.repeat(78));
}

/** Aligned two-column count table used by the per-pass and final summaries. */
function printCounts(title: string, counts: ReadonlyArray<readonly [string, number | string]>): void {
  console.log('');
  console.log(`  ${title}`);
  const width = counts.reduce((max, [label]) => Math.max(max, label.length), 0);
  for (const [label, value] of counts) {
    console.log(`    ${label.padEnd(width)}  ${String(value).padStart(7)}`);
  }
}

/** `[DRY] would …` / `✓ …`, so a diff line reads the same in both modes. */
function actionPrefix(): string {
  return APPLY ? '  ✓' : '  [DRY]';
}

function verb(word: string): string {
  return APPLY ? word : `would ${word}`;
}

// ---------------------------------------------------------------------------
// Classification plumbing
// ---------------------------------------------------------------------------

/**
 * Render a classifier verdict as the free-text `quality_reason` the migration
 * asks for: enough to re-audit a row later without re-running the classifier.
 *
 * Prefixed `backfill:` so a reader can tell a historically-reclassified row from
 * one the live write path classified at insert time. The two use the same
 * classifier but not the same reference timestamp — see the Pass 1 notes.
 */
function describeVerdict(
  classification: EngagementClassification,
  referenceLabel: string,
): string {
  const latency = classification.latencyMs === null ? null : formatDuration(classification.latencyMs);
  const confidence = classification.confidence.toFixed(2);
  // Bound before the switch: inside `default` the classifier's union is narrowed
  // to `never`, and reading `.reason` off `never` is a type error.
  const reason: string = classification.reason;

  switch (classification.reason) {
    case 'prefetch_latency':
      return `backfill: fired ${latency} after ${referenceLabel} — machine speed, not human (conf ${confidence})`;
    case 'automation_user_agent':
      return `backfill: user-agent self-declared as a non-browser client${latency === null ? '' : ` (${latency} after ${referenceLabel})`} (conf ${confidence})`;
    case 'ip_fan_out':
      return `backfill: identical user-agent seen from >= ${FANOUT_MIN_DISTINCT_IPS} distinct IPs within ${formatDuration(FANOUT_WINDOW_MS)} — distributed scanner fleet (conf ${confidence})`;
    case 'ambiguous_latency':
      return `backfill: fired ${latency} after ${referenceLabel} — soft band, probably human but not certain (conf ${confidence})`;
    case 'human_latency':
      return `backfill: fired ${latency} after ${referenceLabel} — no measured scanner waited this long (conf ${confidence})`;
    case 'invalid_timestamp':
      return 'backfill: event timestamp absent or unparseable — nothing to measure';
    case 'missing_reference_timestamp':
      return `backfill: no ${referenceLabel} for this address, so latency is unmeasurable — deliberately NOT assumed human`;
    case 'event_precedes_reference':
      return `backfill: event predates ${referenceLabel} by ${latency === null ? 'an unknown amount' : formatDuration(Math.abs(classification.latencyMs ?? 0))} — mis-joined reference or clock skew`;
    default:
      // Exhaustive today; a future reason code lands here instead of crashing.
      return `backfill: ${reason} (conf ${confidence})`;
  }
}

interface Classified<T> {
  readonly row: T;
  readonly classification: EngagementClassification;
  /** True when the batch IP fan-out check overrode the per-event latency verdict. */
  readonly fanOutOverride: boolean;
  /** What the latency check said before any fan-out override, for the audit line. */
  readonly latencyVerdict: EngagementClassification['verdict'];
}

function tallyVerdicts<T>(items: ReadonlyArray<Classified<T>>): Record<string, number> {
  const counts: Record<string, number> = { automated: 0, likely_human: 0, unknown: 0 };
  for (const item of items) {
    counts[item.classification.verdict] = (counts[item.classification.verdict] ?? 0) + 1;
  }
  return counts;
}

function tallyReasons<T>(items: ReadonlyArray<Classified<T>>): Array<readonly [string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = `${item.classification.verdict} / ${item.classification.reason}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---------------------------------------------------------------------------
// Supabase client + preflight
// ---------------------------------------------------------------------------

function adminClient(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (expected in .env.local)');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Fail with the actual instruction rather than letting PostgREST surface
 * `column "traffic_quality" does not exist` from four call sites at once.
 */
async function preflight(sb: SupabaseClient): Promise<void> {
  const required: Array<readonly [string, string]> = [
    ['golf_demo_sessions', 'traffic_quality'],
    ['golf_demo_sessions', 'quality_reason'],
    ['golf_demo_sessions', 'crm_coach_id'],
    ['email_events', 'coach_id'],
  ];

  const missing: string[] = [];
  for (const [table, column] of required) {
    const { error } = await sb.from(table).select(column).limit(1);
    if (error) missing.push(`${table}.${column} (${error.message})`);
  }

  if (missing.length > 0) {
    console.error('Preflight failed — the capture migration has not been applied to this database.');
    console.error('');
    for (const entry of missing) console.error(`  missing: ${entry}`);
    console.error('');
    console.error('Apply supabase/migrations/20260724000000_crm_inbound_signal_capture.sql first,');
    console.error('then re-run this script.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Loaders
//
// Memoized, because Pass 4 and Pass 5 both need the evidence Passes 1 and 3
// derive, and `--only=4` must still work. Every pass therefore asks a loader for
// what it needs instead of receiving it from an earlier pass — which is also why
// pass order and pass subsetting cannot change any outcome.
// ---------------------------------------------------------------------------

interface CoachIndex {
  readonly all: CoachRow[];
  readonly byId: Map<string, CoachRow>;
  /** Keyed by lower-cased email. First row wins; collisions are reported. */
  readonly byEmail: Map<string, CoachRow>;
  /** Lower-cased addresses held by more than one coach row. */
  readonly duplicateEmails: string[];
  /** Lower-cased domain -> a coach row from that domain, for Pass 5 inference. */
  readonly byDomain: Map<string, CoachRow>;
}

let coachIndexCache: CoachIndex | null = null;

async function loadCoaches(sb: SupabaseClient): Promise<CoachIndex> {
  if (coachIndexCache !== null) return coachIndexCache;

  const all = await fetchAllRows<CoachRow>((from, to) =>
    sb
      .from('crm_coaches')
      .select(
        'id, name, email, school, conference, division, program, status, source, tags, is_archived, last_contacted_at, next_follow_up_at, last_email_event_at, last_email_event_type',
      )
      .order('id', { ascending: true })
      .range(from, to)
      .returns<CoachRow[]>(),
  );

  const byId = new Map<string, CoachRow>();
  const byEmail = new Map<string, CoachRow>();
  const byDomain = new Map<string, CoachRow>();
  const duplicateEmails = new Set<string>();

  for (const coach of all) {
    byId.set(coach.id, coach);

    const email = normalizeEmail(coach.email);
    if (email === null) continue;

    if (byEmail.has(email)) {
      duplicateEmails.add(email);
    } else {
      byEmail.set(email, coach);
    }

    const domain = emailDomain(email);
    // Prefer a non-archived sibling as the domain exemplar — Pass 5 copies
    // school/division/conference off it, and an archived row is more likely to
    // carry stale program metadata.
    if (domain !== null && (!byDomain.has(domain) || coach.is_archived !== true)) {
      const existing = byDomain.get(domain);
      if (existing === undefined || existing.is_archived === true) byDomain.set(domain, coach);
    }
  }

  coachIndexCache = { all, byId, byEmail, duplicateEmails: [...duplicateEmails].sort(), byDomain };
  return coachIndexCache;
}

let sessionCache: Array<Classified<DemoSessionRow>> | null = null;

/**
 * Load and classify every `golf_demo_sessions` row.
 *
 * Reference timestamp is that coach's `crm_coaches.last_contacted_at`. Two
 * honest caveats a reader must know, because they shape the output:
 *
 *   1. `last_contacted_at` is the coach's MOST RECENT outreach, not necessarily
 *      the send that produced this particular session. When it postdates the
 *      session the classifier returns 'unknown' / 'event_precedes_reference'
 *      rather than inventing a latency — deliberately, per the module contract.
 *      Those rows are reported separately below and are recoverable later from
 *      crm_contact_log if per-send attribution is ever wired up.
 *   2. A session whose address has no coach row has no reference at all, so it
 *      lands on 'unknown'. It can still be pulled to 'automated' by the IP
 *      fan-out check, which is exactly the case fan-out exists for.
 */
async function loadClassifiedSessions(sb: SupabaseClient): Promise<Array<Classified<DemoSessionRow>>> {
  if (sessionCache !== null) return sessionCache;

  const coaches = await loadCoaches(sb);

  const sessions = await fetchAllRows<DemoSessionRow>((from, to) =>
    sb
      .from('golf_demo_sessions')
      .select('id, name, email, school, ip, user_agent, referrer, entered_at, traffic_quality, quality_reason, crm_coach_id')
      .order('entered_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<DemoSessionRow[]>(),
  );

  // Batch signal first: one UA across many IPs inside an hour. This is the only
  // thing that catches the measured spoofed-Chrome fleet (79 sessions, 1 UA, 49
  // IPs), because those rows frequently have no usable reference timestamp and
  // latency alone would leave every one of them 'unknown'.
  const fanOut = flagAutomatedByIpFanOut(
    sessions.map((session) => ({
      id: session.id,
      occurredAt: session.entered_at,
      userAgent: session.user_agent,
      ip: session.ip,
    })),
  );

  sessionCache = sessions.map((session) => {
    const email = normalizeEmail(session.email);
    const coach = email === null ? undefined : coaches.byEmail.get(email);

    const latencyClassification = classifyEngagement({
      occurredAt: session.entered_at,
      referenceAt: coach?.last_contacted_at ?? null,
      userAgent: session.user_agent,
      ip: session.ip,
    });

    const fanOutClassification = fanOut.get(session.id);
    const classification = fanOutClassification ?? latencyClassification;

    return {
      row: session,
      classification,
      fanOutOverride: fanOutClassification !== undefined && latencyClassification.verdict !== 'automated',
      latencyVerdict: latencyClassification.verdict,
    };
  });

  return sessionCache;
}

interface ClassifiedEmailEvent {
  readonly row: EmailEventRow;
  readonly classification: EngagementClassification;
  /** Address the event was delivered to, lower-cased. */
  readonly recipient: string | null;
  /** Coach resolved from `coach_id` if set, else from the recipient address. */
  readonly coach: CoachRow | null;
  /** True when the coach came from the address rather than a stored `coach_id`. */
  readonly resolvedFromAddress: boolean;
}

let emailEventCache: ClassifiedEmailEvent[] | null = null;

/**
 * Load and classify every `email_events` row, resolving each to a coach and to
 * its delivery reference.
 *
 * Reference is `emails.delivered_at` falling back to `emails.sent_at` — the same
 * pair the live webhook path uses, so a historical verdict and a live verdict
 * for the same event agree.
 */
async function loadClassifiedEmailEvents(sb: SupabaseClient): Promise<ClassifiedEmailEvent[]> {
  if (emailEventCache !== null) return emailEventCache;

  const coaches = await loadCoaches(sb);

  const events = await fetchAllRows<EmailEventRow>((from, to) =>
    sb
      .from('email_events')
      .select('id, resend_message_id, event_type, recipient_email, occurred_at, contact_log_id, coach_id')
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
      .returns<EmailEventRow[]>(),
  );

  const emails = await fetchAllRows<EmailRow>((from, to) =>
    sb
      .from('emails')
      .select('resend_message_id, to_addresses, sent_at, delivered_at')
      .order('resend_message_id', { ascending: true })
      .range(from, to)
      .returns<EmailRow[]>(),
  );

  const emailByMessageId = new Map<string, EmailRow>();
  for (const email of emails) emailByMessageId.set(email.resend_message_id, email);

  emailEventCache = events.map((event) => {
    const email = emailByMessageId.get(event.resend_message_id);

    // `recipient_email` is nullable on this table; fall back to the send's first
    // recipient. Without this fallback a chunk of the orphaned rows stay
    // unresolvable for no good reason — the address is right there on `emails`.
    const recipient =
      normalizeEmail(event.recipient_email) ?? normalizeEmail(email?.to_addresses?.[0] ?? null);

    const storedCoach = event.coach_id === null ? undefined : coaches.byId.get(event.coach_id);
    const addressCoach = recipient === null ? undefined : coaches.byEmail.get(recipient);
    const coach = storedCoach ?? addressCoach ?? null;

    const classification = classifyEngagement({
      occurredAt: event.occurred_at,
      referenceAt: email?.delivered_at ?? email?.sent_at ?? null,
      // No user-agent is stored on email_events. Passing null is correct: the
      // classifier treats a missing UA as no signal rather than as a hit.
      userAgent: null,
    });

    return {
      row: event,
      classification,
      recipient,
      coach,
      resolvedFromAddress: storedCoach === undefined && addressCoach !== undefined,
    };
  });

  return emailEventCache;
}

// ---------------------------------------------------------------------------
// Final summary accumulator
// ---------------------------------------------------------------------------

const summaryRows: Array<readonly [string, number | string]> = [];

function summarize(label: string, value: number | string): void {
  summaryRows.push([label, value]);
}

/** Non-fatal problems worth a human's attention, printed together at the end. */
const warnings: string[] = [];

function warn(message: string): void {
  warnings.push(message);
  console.log(`  ⚠ ${message}`);
}

// ---------------------------------------------------------------------------
// PASS 1 — reclassify golf_demo_sessions
// ---------------------------------------------------------------------------

async function pass1(sb: SupabaseClient): Promise<void> {
  section('PASS 1 — golf_demo_sessions traffic quality (scanner prefetch vs. real tours)');

  const coaches = await loadCoaches(sb);
  const classified = await loadClassifiedSessions(sb);

  console.log(`  Loaded ${classified.length} session(s) (measurement expected ${EXPECTED.sessionsTotal}).`);
  console.log(`  Reference timestamp per row: that coach's crm_coaches.last_contacted_at.`);
  console.log('');

  let written = 0;
  let alreadyCorrect = 0;
  let coachLinked = 0;
  let errors = 0;

  for (const item of classified) {
    const session = item.row;
    const email = normalizeEmail(session.email);
    const coach = email === null ? undefined : coaches.byEmail.get(email);

    const nextQuality = item.classification.verdict;
    const nextReason = describeVerdict(item.classification, 'crm_coaches.last_contacted_at');
    // Purely additive: an existing link is never repointed, only a null filled.
    const nextCoachId = session.crm_coach_id ?? coach?.id ?? null;

    const qualityUnchanged = session.traffic_quality === nextQuality;
    const reasonUnchanged = session.quality_reason === nextReason;
    const coachUnchanged = session.crm_coach_id === nextCoachId;

    if (qualityUnchanged && reasonUnchanged && coachUnchanged) {
      alreadyCorrect += 1;
      continue;
    }

    const label =
      `session ${shortId(session.id)} ${session.entered_at.slice(0, 19)} ` +
      `${(email ?? '(no email)').padEnd(34)} ${(session.school ?? '—').slice(0, 24)}`;

    console.log(`${actionPrefix()} ${verb('set')} ${label}`);
    console.log(
      `        traffic_quality: ${isoOrNull(session.traffic_quality).padEnd(13)} → ${nextQuality}`,
    );
    console.log(`        quality_reason:  ${nextReason}`);
    if (!coachUnchanged) {
      console.log(
        `        crm_coach_id:    ${isoOrNull(session.crm_coach_id)} → ${nextCoachId ?? 'null'}` +
          (coach === undefined ? '' : `  (${coach.name} — ${coach.school})`),
      );
      coachLinked += 1;
    }
    if (item.fanOutOverride) {
      // Loudly surfaced: fan-out is the one place a batch signal overrules the
      // per-row latency verdict, and it is the check most likely to be retuned.
      console.log(
        `        ↑ IP FAN-OUT OVERRIDE — latency alone said '${item.latencyVerdict}'; ` +
          `the shared user-agent appeared from >= ${FANOUT_MIN_DISTINCT_IPS} distinct IPs`,
      );
    }

    if (APPLY) {
      const { error } = await sb
        .from('golf_demo_sessions')
        .update({
          traffic_quality: nextQuality,
          quality_reason: nextReason,
          crm_coach_id: nextCoachId,
        })
        .eq('id', session.id);

      if (error) {
        warn(`session ${shortId(session.id)}: update failed — ${error.message}`);
        errors += 1;
        continue;
      }

      recordRollback(
        `UPDATE public.golf_demo_sessions SET traffic_quality = ${sqlLiteral(session.traffic_quality)}, ` +
          `quality_reason = ${sqlLiteral(session.quality_reason)}, ` +
          `crm_coach_id = ${sqlLiteral(session.crm_coach_id)} WHERE id = ${sqlLiteral(session.id)};`,
      );
    }

    written += 1;
  }

  // --- Distribution, for sanity-checking against the production measurement ---
  const verdicts = tallyVerdicts(classified);
  const automated = verdicts.automated ?? 0;
  const human = verdicts.likely_human ?? 0;
  const unknown = verdicts.unknown ?? 0;

  const humanPeople = new Set<string>();
  for (const item of classified) {
    if (!countsAsHumanEngagement(item.classification)) continue;
    const email = normalizeEmail(item.row.email);
    if (email !== null) humanPeople.add(email);
  }

  printCounts('Verdict distribution', [
    ['automated', automated],
    ['likely_human', human],
    ['unknown', unknown],
    ['— total', classified.length],
    ['distinct people behind likely_human', humanPeople.size],
  ]);

  printCounts('Reason breakdown', tallyReasons(classified));

  console.log('');
  console.log('  Sanity check against the production measurement:');
  console.log(
    `    automated            ${String(automated).padStart(4)}  expected ~${EXPECTED.sessionsAutomated}  ` +
      (Math.abs(automated - EXPECTED.sessionsAutomated) <= 15 ? 'OK' : 'INVESTIGATE'),
  );
  console.log(
    `    likely_human         ${String(human).padStart(4)}  expected ~${EXPECTED.sessionsHuman}  ` +
      (Math.abs(human - EXPECTED.sessionsHuman) <= 10 ? 'OK' : 'INVESTIGATE'),
  );
  console.log(
    `    distinct people      ${String(humanPeople.size).padStart(4)}  expected ${EXPECTED.sessionsHumanPeopleMin}-${EXPECTED.sessionsHumanPeopleMax}  ` +
      (humanPeople.size >= EXPECTED.sessionsHumanPeopleMin && humanPeople.size <= EXPECTED.sessionsHumanPeopleMax
        ? 'OK'
        : 'INVESTIGATE'),
  );

  if (Math.abs(automated - EXPECTED.sessionsAutomated) > 15) {
    warn(
      `Pass 1 automated count (${automated}) is far from the measured ${EXPECTED.sessionsAutomated}. ` +
        'Most likely cause: last_contacted_at has moved since the measurement, so more rows ' +
        "fall into 'unknown' / event_precedes_reference. Check the reason breakdown before applying.",
    );
  }
  if (unknown > classified.length / 2) {
    warn(
      `${unknown} of ${classified.length} sessions are 'unknown' — that usually means most session ` +
        'addresses have no crm_coaches row, or last_contacted_at has been overwritten by later outreach. ' +
        "These rows are stored as 'unknown' rather than guessed, and stay recoverable.",
    );
  }

  summarize('Pass 1 · sessions scanned', classified.length);
  summarize('Pass 1 · verdict automated', automated);
  summarize('Pass 1 · verdict likely_human', human);
  summarize('Pass 1 · verdict unknown', unknown);
  summarize('Pass 1 · distinct humans', humanPeople.size);
  summarize(`Pass 1 · rows ${APPLY ? 'updated' : 'to update'}`, written);
  summarize('Pass 1 · rows already correct', alreadyCorrect);
  summarize(`Pass 1 · crm_coach_id ${APPLY ? 'linked' : 'to link'}`, coachLinked);
  if (errors > 0) summarize('Pass 1 · errors', errors);
  if (errors > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// PASS 2 — attribute orphaned email_events to a coach
// ---------------------------------------------------------------------------

async function pass2(sb: SupabaseClient): Promise<void> {
  section('PASS 2 — email_events.coach_id (engagement that never resolved a contact log)');

  const events = await loadClassifiedEmailEvents(sb);

  // The 170-row figure from the investigation is specifically
  // "contact_log_id IS NULL AND event_type IN (opened, clicked)". coach_id is a
  // brand-new column so every row starts null; both numbers are printed so the
  // known figure stays checkable.
  const missingCoach = events.filter((event) => event.row.coach_id === null);
  const orphanedEngagement = missingCoach.filter(
    (event) => event.row.contact_log_id === null && ENGAGEMENT_EVENT_TYPES.includes(event.row.event_type),
  );

  console.log(`  ${events.length} email_events row(s) total.`);
  console.log(`  ${missingCoach.length} with coach_id IS NULL.`);
  console.log(
    `  ${orphanedEngagement.length} of those are ${ENGAGEMENT_EVENT_TYPES.join('/')} with contact_log_id IS NULL ` +
      `(measurement expected ${EXPECTED.orphanEngagementEvents}).`,
  );
  console.log('  Resolution is by recipient address (falling back to emails.to_addresses[0]),');
  console.log('  compared case-insensitively — the case-sensitive join is what lost these in the first place.');
  console.log('');

  let written = 0;
  let unresolvable = 0;
  let errors = 0;
  const byEventType = new Map<string, number>();
  const unresolvedAddresses = new Set<string>();

  for (const event of missingCoach) {
    if (event.coach === null) {
      unresolvable += 1;
      if (event.recipient !== null) unresolvedAddresses.add(event.recipient);
      continue;
    }

    byEventType.set(event.row.event_type, (byEventType.get(event.row.event_type) ?? 0) + 1);

    console.log(
      `${actionPrefix()} ${verb('attribute')} event ${shortId(event.row.id)} ` +
        `${event.row.occurred_at.slice(0, 19)} ${event.row.event_type.padEnd(16)} ` +
        `${(event.recipient ?? '(no recipient)').padEnd(34)}`,
    );
    console.log(
      `        coach_id: null → ${event.coach.id}  (${event.coach.name} — ${event.coach.school})` +
        `  [verdict ${event.classification.verdict}]`,
    );

    if (APPLY) {
      const { error } = await sb
        .from('email_events')
        .update({ coach_id: event.coach.id })
        // Idempotency guard against a concurrent write between the read above
        // and this update: only fill a still-null column.
        .eq('id', event.row.id)
        .is('coach_id', null);

      if (error) {
        warn(`event ${shortId(event.row.id)}: update failed — ${error.message}`);
        errors += 1;
        continue;
      }

      recordRollback(
        `UPDATE public.email_events SET coach_id = NULL WHERE id = ${sqlLiteral(event.row.id)};`,
      );
    }

    written += 1;
  }

  printCounts(
    `Attributed by event_type`,
    [...byEventType.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );

  printCounts('Totals', [
    ['rows with coach_id IS NULL', missingCoach.length],
    [`resolved (${APPLY ? 'written' : 'would write'})`, written],
    ['unresolvable (no crm_coaches row)', unresolvable],
    ['distinct unresolvable addresses', unresolvedAddresses.size],
  ]);

  if (unresolvedAddresses.size > 0) {
    // Not a failure — these are Pass 5's input. Listed here so the two passes'
    // numbers can be reconciled by eye.
    console.log('');
    console.log('  Addresses with engagement but no crm_coaches row (Pass 5 handles these):');
    for (const address of [...unresolvedAddresses].sort()) {
      console.log(`    ${address}`);
    }
  }

  if (Math.abs(orphanedEngagement.length - EXPECTED.orphanEngagementEvents) > 25) {
    warn(
      `Orphaned engagement count (${orphanedEngagement.length}) is far from the measured ` +
        `${EXPECTED.orphanEngagementEvents}. Confirm no other backfill has already run before applying.`,
    );
  }

  summarize('Pass 2 · events scanned', events.length);
  summarize('Pass 2 · coach_id IS NULL', missingCoach.length);
  summarize('Pass 2 · orphaned opens/clicks', orphanedEngagement.length);
  summarize(`Pass 2 · ${APPLY ? 'attributed' : 'to attribute'}`, written);
  summarize('Pass 2 · unresolvable', unresolvable);
  if (errors > 0) summarize('Pass 2 · errors', errors);
  if (errors > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// PASS 3 — repair the crm_coaches engagement mirror
// ---------------------------------------------------------------------------

/**
 * The mirror answers "when did this coach last engage with us", and it is read
 * by the pipeline views and by the automations that decide who is worth chasing.
 * It froze at 2026-06-25 while `email_events` kept receiving traffic.
 *
 * Which events count: `countsAsHumanEngagement()` only, i.e. 'likely_human'.
 * The brief says "non-automated", and 'likely_human' is a strict subset of that
 * — the difference is 'unknown'. Excluding 'unknown' is deliberate and matches
 * the classifier module's stated contract: an unmeasurable event is not evidence
 * of a buyer, and writing one into the mirror is how a scanner click becomes a
 * "recent engagement" a human then acts on. 'unknown' counts are reported
 * separately so nothing is hidden by the choice.
 */
async function pass3(sb: SupabaseClient): Promise<void> {
  section('PASS 3 — crm_coaches.last_email_event_* mirror (frozen at 2026-06-25)');

  const coaches = await loadCoaches(sb);
  const events = await loadClassifiedEmailEvents(sb);

  interface MirrorTarget {
    at: string;
    type: string;
  }

  const humanLatest = new Map<string, MirrorTarget>();
  const unknownOnly = new Map<string, number>();
  const automatedCounts = new Map<string, number>();

  for (const event of events) {
    if (event.coach === null) continue;
    const coachId = event.coach.id;

    if (event.classification.verdict === 'automated') {
      automatedCounts.set(coachId, (automatedCounts.get(coachId) ?? 0) + 1);
      continue;
    }
    if (!countsAsHumanEngagement(event.classification)) {
      unknownOnly.set(coachId, (unknownOnly.get(coachId) ?? 0) + 1);
      continue;
    }

    const current = humanLatest.get(coachId);
    if (current === undefined || event.row.occurred_at > current.at) {
      humanLatest.set(coachId, { at: event.row.occurred_at, type: event.row.event_type });
    }
  }

  console.log(`  ${coaches.all.length} coach row(s); ${humanLatest.size} have at least one human-classified event.`);
  console.log(`  Counting 'likely_human' only — 'unknown' and 'automated' events never move the mirror.`);
  console.log('');

  let advanced = 0;
  let filled = 0;
  let cleared = 0;
  let clearSuppressed = 0;
  let unchanged = 0;
  let errors = 0;

  for (const coach of coaches.all) {
    const target = humanLatest.get(coach.id) ?? null;
    const nextAt = target?.at ?? null;
    const nextType = target?.type ?? null;

    if (coach.last_email_event_at === nextAt && coach.last_email_event_type === nextType) {
      unchanged += 1;
      continue;
    }

    // Clearing a populated mirror is the only destructive shape this pass can
    // take, and it is exactly what happens to a coach whose entire history is
    // scanner traffic. That is arguably the correct answer, but it deletes the
    // only record of what the CRM used to believe, so it is opt-in.
    const isClear = nextAt === null && coach.last_email_event_at !== null;
    if (isClear && !ALLOW_MIRROR_CLEAR) {
      clearSuppressed += 1;
      console.log(
        `  [skip] coach ${shortId(coach.id)} ${(coach.email ?? coach.name).padEnd(34)} ` +
          `mirror ${isoOrNull(coach.last_email_event_at)} / ${isoOrNull(coach.last_email_event_type)} ` +
          `has NO surviving human event (${automatedCounts.get(coach.id) ?? 0} automated, ` +
          `${unknownOnly.get(coach.id) ?? 0} unknown) — pass --allow-mirror-clear to null it`,
      );
      continue;
    }

    const kind = isClear ? 'clear' : coach.last_email_event_at === null ? 'fill' : 'advance';
    console.log(
      `${actionPrefix()} ${verb(kind)} coach ${shortId(coach.id)} ${(coach.email ?? coach.name).padEnd(34)} ${coach.school.slice(0, 24)}`,
    );
    console.log(
      `        last_email_event_at:   ${isoOrNull(coach.last_email_event_at).padEnd(30)} → ${isoOrNull(nextAt)}`,
    );
    console.log(
      `        last_email_event_type: ${isoOrNull(coach.last_email_event_type).padEnd(30)} → ${isoOrNull(nextType)}`,
    );
    const suppressed = (automatedCounts.get(coach.id) ?? 0) + (unknownOnly.get(coach.id) ?? 0);
    if (suppressed > 0) {
      console.log(
        `        (excluded ${automatedCounts.get(coach.id) ?? 0} automated + ${unknownOnly.get(coach.id) ?? 0} unknown event(s))`,
      );
    }

    if (APPLY) {
      const { error } = await sb
        .from('crm_coaches')
        .update({ last_email_event_at: nextAt, last_email_event_type: nextType })
        .eq('id', coach.id);

      if (error) {
        warn(`coach ${shortId(coach.id)}: mirror update failed — ${error.message}`);
        errors += 1;
        continue;
      }

      recordRollback(
        `UPDATE public.crm_coaches SET last_email_event_at = ${sqlLiteral(coach.last_email_event_at)}, ` +
          `last_email_event_type = ${sqlLiteral(coach.last_email_event_type)} WHERE id = ${sqlLiteral(coach.id)};`,
      );
    }

    if (kind === 'clear') cleared += 1;
    else if (kind === 'fill') filled += 1;
    else advanced += 1;
  }

  printCounts('Mirror changes', [
    [`filled (was NULL)`, filled],
    [`advanced (was stale)`, advanced],
    [`cleared (no human event)`, cleared],
    [`clear suppressed (default)`, clearSuppressed],
    [`already correct`, unchanged],
  ]);

  summarize(`Pass 3 · mirror filled`, filled);
  summarize(`Pass 3 · mirror advanced`, advanced);
  summarize(`Pass 3 · mirror cleared`, cleared);
  summarize(`Pass 3 · clear suppressed`, clearSuppressed);
  if (errors > 0) summarize('Pass 3 · errors', errors);
  if (errors > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Shared evidence model for Passes 4 and 5
// ---------------------------------------------------------------------------

interface HumanEvidence {
  /** Lower-cased address the evidence belongs to. */
  readonly address: string;
  readonly sessionCount: number;
  readonly eventCount: number;
  /** Most recent human-classified engagement, ISO string. */
  readonly latestAt: string;
  /** Best-known display name/school, from the demo-gate capture when present. */
  readonly name: string | null;
  readonly school: string | null;
}

/**
 * Everything that survived classification as a real human touching our stuff,
 * keyed by lower-cased address. Both Pass 4 (tag the ones we know) and Pass 5
 * (create the ones we do not) read this, so the two passes can never disagree
 * about who counts.
 */
async function collectHumanEvidence(sb: SupabaseClient): Promise<Map<string, HumanEvidence>> {
  const sessions = await loadClassifiedSessions(sb);
  const events = await loadClassifiedEmailEvents(sb);

  const draft = new Map<
    string,
    { sessionCount: number; eventCount: number; latestAt: string; name: string | null; school: string | null }
  >();

  const touch = (
    address: string,
    at: string,
    kind: 'session' | 'event',
    name: string | null,
    school: string | null,
  ): void => {
    const existing = draft.get(address);
    if (existing === undefined) {
      draft.set(address, {
        sessionCount: kind === 'session' ? 1 : 0,
        eventCount: kind === 'event' ? 1 : 0,
        latestAt: at,
        name,
        school,
      });
      return;
    }
    if (kind === 'session') existing.sessionCount += 1;
    else existing.eventCount += 1;
    if (at > existing.latestAt) existing.latestAt = at;
    // A demo-gate row carries a self-reported name and school; an email event
    // carries neither. First non-null wins so the gate data is not overwritten.
    existing.name = existing.name ?? name;
    existing.school = existing.school ?? school;
  };

  for (const item of sessions) {
    if (!countsAsHumanEngagement(item.classification)) continue;
    const address = normalizeEmail(item.row.email);
    if (address === null) continue;
    touch(address, item.row.entered_at, 'session', item.row.name?.trim() || null, item.row.school?.trim() || null);
  }

  for (const event of events) {
    if (!countsAsHumanEngagement(event.classification)) continue;
    if (event.recipient === null) continue;
    touch(event.recipient, event.row.occurred_at, 'event', null, null);
  }

  const out = new Map<string, HumanEvidence>();
  for (const [address, value] of draft) out.set(address, { address, ...value });
  return out;
}

// ---------------------------------------------------------------------------
// PASS 4 — surface the recovered humans in the CRM
// ---------------------------------------------------------------------------

async function pass4(sb: SupabaseClient): Promise<void> {
  section('PASS 4 — tag + promote coaches whose real engagement was lost');

  const coaches = await loadCoaches(sb);
  const evidence = await collectHumanEvidence(sb);

  const followUpAt = new Date(RUN_AT.getTime() + FOLLOW_UP_DAYS * 86_400_000).toISOString();

  console.log(`  ${evidence.size} address(es) show human-classified engagement.`);
  console.log(`  Tag: '${RECOVERY_TAG}'.  Promotion ceiling: '${PROMOTION_STATUS}'.  Follow-up: ${followUpAt.slice(0, 10)} (+${FOLLOW_UP_DAYS}d).`);
  console.log(`  Rules: never demote, never touch status 'won', archived coaches get the tag only.`);
  console.log('');

  let tagged = 0;
  let promoted = 0;
  let scheduled = 0;
  let skippedWon = 0;
  let skippedArchived = 0;
  let alreadyDone = 0;
  let noCoachRow = 0;
  let errors = 0;

  for (const [address, item] of [...evidence.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const coach = coaches.byEmail.get(address);
    if (coach === undefined) {
      // Pass 5's territory. Counted here so the two passes reconcile.
      noCoachRow += 1;
      continue;
    }

    // "NEVER touch a coach whose status is 'won'" — read literally: no tag, no
    // status change, no follow-up. A closed-won customer does not need a
    // recovered-lead task, and stamping one would pollute the customer list.
    if (coach.status === 'won') {
      skippedWon += 1;
      console.log(
        `  [skip] coach ${shortId(coach.id)} ${address.padEnd(34)} status='won' — untouched by rule`,
      );
      continue;
    }

    const tags = coach.tags ?? [];
    const needsTag = !tags.includes(RECOVERY_TAG);

    // An archived coach still gets the tag, because the whole point is to make
    // the lost signal findable, but un-archiving and re-working the lead is a
    // human decision this script must not make on its own.
    const archived = coach.is_archived === true;

    const currentRank = STATUS_RANK[coach.status] ?? 0;
    const targetRank = STATUS_RANK[PROMOTION_STATUS] ?? 0;
    const needsPromotion = !archived && currentRank > 0 && currentRank < targetRank;

    const followUpStale =
      coach.next_follow_up_at === null || Date.parse(coach.next_follow_up_at) < RUN_AT.getTime();
    const needsFollowUp = !archived && followUpStale;

    if (!needsTag && !needsPromotion && !needsFollowUp) {
      alreadyDone += 1;
      continue;
    }

    console.log(
      `${actionPrefix()} ${verb('flag')} coach ${shortId(coach.id)} ${address.padEnd(34)} ` +
        `${coach.school.slice(0, 24).padEnd(24)} ${archived ? '[ARCHIVED]' : ''}`,
    );
    console.log(
      `        evidence: ${item.sessionCount} demo tour(s) + ${item.eventCount} email event(s), latest ${item.latestAt.slice(0, 19)}`,
    );
    if (needsTag) {
      console.log(`        tags:              [${tags.join(', ')}] → [${[...tags, RECOVERY_TAG].join(', ')}]`);
    }
    if (needsPromotion) {
      console.log(`        status:            ${coach.status} → ${PROMOTION_STATUS}`);
    } else if (!archived && currentRank >= targetRank) {
      console.log(`        status:            ${coach.status} (rank ${currentRank} >= ${targetRank}) — left alone, never demote`);
    }
    if (needsFollowUp) {
      console.log(`        next_follow_up_at: ${isoOrNull(coach.next_follow_up_at)} → ${followUpAt}`);
    }
    if (archived) {
      skippedArchived += 1;
      console.log('        (archived — tag only; un-archiving is a human decision)');
    }

    if (APPLY) {
      // Read-modify-write on the tags array: PostgREST has no array_append, and
      // this is a one-shot manual script with no concurrent writer to race.
      const update: Record<string, unknown> = {};
      if (needsTag) update.tags = [...tags, RECOVERY_TAG];
      if (needsPromotion) update.status = PROMOTION_STATUS;
      if (needsFollowUp) update.next_follow_up_at = followUpAt;

      const { error } = await sb.from('crm_coaches').update(update).eq('id', coach.id);

      if (error) {
        warn(`coach ${shortId(coach.id)}: flag update failed — ${error.message}`);
        errors += 1;
        continue;
      }

      recordRollback(
        `UPDATE public.crm_coaches SET tags = ${sqlTextArray(coach.tags)}, ` +
          `status = ${sqlLiteral(coach.status)}::coach_status, ` +
          `next_follow_up_at = ${sqlLiteral(coach.next_follow_up_at)} WHERE id = ${sqlLiteral(coach.id)};`,
      );
    }

    if (needsTag) tagged += 1;
    if (needsPromotion) promoted += 1;
    if (needsFollowUp) scheduled += 1;
  }

  printCounts('Coach flagging', [
    [`tagged '${RECOVERY_TAG}'`, tagged],
    [`promoted to '${PROMOTION_STATUS}'`, promoted],
    ['follow-ups scheduled', scheduled],
    ["skipped — status 'won'", skippedWon],
    ['archived (tag only)', skippedArchived],
    ['already flagged', alreadyDone],
    ['no crm_coaches row (see Pass 5)', noCoachRow],
  ]);

  summarize(`Pass 4 · ${APPLY ? 'tagged' : 'to tag'}`, tagged);
  summarize(`Pass 4 · ${APPLY ? 'promoted' : 'to promote'}`, promoted);
  summarize(`Pass 4 · follow-ups ${APPLY ? 'set' : 'to set'}`, scheduled);
  summarize("Pass 4 · skipped 'won'", skippedWon);
  if (errors > 0) summarize('Pass 4 · errors', errors);
  if (errors > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// PASS 5 — create coach rows for engaged addresses that have none
// ---------------------------------------------------------------------------

/**
 * `public.ncaa_division` labels, mirrored so `--assume-division` can be rejected
 * at the CLI instead of by a Postgres enum error halfway through the pass.
 * Source of truth: `Database['public']['Enums']['ncaa_division']`.
 */
const NCAA_DIVISIONS = ['D1', 'D2', 'D3', 'NAIA', 'JUCO', 'JUCO_D1', 'JUCO_D2', 'JUCO_D3', 'CCCAA'];

/** Turn `wgruse@guilford.edu` into `Wgruse` — a placeholder, not a real name. */
function nameFromAddress(address: string): string {
  const local = address.split('@')[0] ?? address;
  const cleaned = local.replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
  if (cleaned.length === 0) return address;
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** `guilford.edu` -> `Guilford`, used only when nothing better is available. */
function schoolFromDomain(domain: string): string {
  const stem = domain.replace(/\.(edu|com|org|net)$/i, '').split('.').slice(-1)[0] ?? domain;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

async function pass5(sb: SupabaseClient): Promise<void> {
  section('PASS 5 — engaged addresses with no crm_coaches row');

  const coaches = await loadCoaches(sb);
  const evidence = await collectHumanEvidence(sb);

  const followUpAt = new Date(RUN_AT.getTime() + FOLLOW_UP_DAYS * 86_400_000).toISOString();

  if (ASSUME_DIVISION !== null && !NCAA_DIVISIONS.includes(ASSUME_DIVISION)) {
    console.error(`--assume-division=${ASSUME_DIVISION} is not an ncaa_division. Valid: ${NCAA_DIVISIONS.join(', ')}`);
    process.exit(2);
  }

  const missing = [...evidence.values()]
    .filter((item) => !coaches.byEmail.has(item.address))
    .sort((a, b) => a.address.localeCompare(b.address));

  console.log(`  ${missing.length} address(es) engaged for real but have no crm_coaches row.`);
  console.log(`  Measured expectation: ${EXPECTED.addressesWithoutCoach} (including wgruse@guilford.edu).`);
  console.log(`  New rows: status='new_lead', source='${RECOVERED_SOURCE}', tags=['${RECOVERY_TAG}'].`);
  console.log('');

  if (missing.length === 0) {
    console.log('  Nothing to create.');
  }

  let created = 0;
  let skippedNoDivision = 0;
  let errors = 0;

  for (const item of missing) {
    const domain = emailDomain(item.address);
    const sibling = domain === null ? undefined : coaches.byDomain.get(domain);

    // `crm_coaches.division` is NOT NULL with no default, so a row cannot be
    // created without one. In order of trust: a real coach at the same school,
    // then an explicit operator override, then nothing — and "nothing" means we
    // report the address and skip it rather than guess a division into the CRM.
    const division = sibling?.division ?? ASSUME_DIVISION;

    // The demo gate captures a self-reported name/school; prefer it, then the
    // same-domain sibling's school, then a domain-derived placeholder.
    const name = item.name ?? sibling?.name ?? nameFromAddress(item.address);
    const school =
      item.school ?? sibling?.school ?? (domain === null ? item.address : schoolFromDomain(domain));

    console.log(
      `${actionPrefix()} ${verb('create')} coach for ${item.address}`,
    );
    console.log(
      `        evidence:          ${item.sessionCount} demo tour(s) + ${item.eventCount} email event(s), latest ${item.latestAt.slice(0, 19)}`,
    );
    console.log(`        name:              (none) → ${name}${item.name === null ? '  [derived]' : ''}`);
    console.log(`        school:            (none) → ${school}${item.school === null ? '  [derived]' : ''}`);
    console.log(
      `        division:          (none) → ${division ?? 'UNKNOWN'}` +
        (sibling !== undefined
          ? `  [from ${sibling.email ?? shortId(sibling.id)} @ same domain]`
          : ASSUME_DIVISION !== null
            ? '  [--assume-division]'
            : ''),
    );

    if (division === null) {
      skippedNoDivision += 1;
      console.log('        SKIPPED — division is NOT NULL and could not be inferred.');
      console.log('        Re-run with --assume-division=D3 (or create this coach by hand).');
      warn(`${item.address}: no crm_coaches row and no inferrable division — not created`);
      console.log('');
      continue;
    }

    console.log(`        status:            (none) → new_lead`);
    console.log(`        source:            (none) → ${RECOVERED_SOURCE}`);
    console.log(`        tags:              (none) → [${RECOVERY_TAG}]`);
    console.log(`        next_follow_up_at: (none) → ${followUpAt}`);
    console.log(`        conference:        (none) → ${sibling?.conference ?? 'NULL'}`);
    console.log('');

    if (APPLY) {
      // `program` is deliberately omitted: the column has a database default and
      // an email address carries no signal about mens/womens/both. Better a
      // default a human can correct than a coin-flip presented as fact.
      const { data, error } = await sb
        .from('crm_coaches')
        .insert({
          name,
          email: item.address,
          school,
          division,
          conference: sibling?.conference ?? null,
          status: 'new_lead',
          source: RECOVERED_SOURCE,
          tags: [RECOVERY_TAG],
          next_follow_up_at: followUpAt,
          notes:
            `Created by scripts/recover-crm-inbound-signals.ts on ${RUN_AT.toISOString().slice(0, 10)}. ` +
            `Engaged with outreach (${item.sessionCount} demo tour(s), ${item.eventCount} email event(s), ` +
            `latest ${item.latestAt}) but had no CRM record — the signal was lost by the capture bugs ` +
            `fixed alongside this script. Name/school/division may be derived; verify before outreach.`,
        })
        .select('id')
        .returns<Array<{ id: string }>>();

      const createdId = data?.[0]?.id ?? null;
      if (error || createdId === null) {
        warn(`${item.address}: insert failed — ${error?.message ?? 'no row returned'}`);
        errors += 1;
        continue;
      }

      // Safe to hard-delete on rollback: the row did not exist before this run,
      // so nothing can reference it yet.
      recordRollback(`DELETE FROM public.crm_coaches WHERE id = ${sqlLiteral(createdId)};`);
      console.log(`        → created ${shortId(createdId)}`);
    }

    created += 1;
  }

  printCounts('New coach rows', [
    [APPLY ? 'created' : 'would create', created],
    ['skipped — no division', skippedNoDivision],
    ['expected (measured)', EXPECTED.addressesWithoutCoach],
  ]);

  if (missing.length !== EXPECTED.addressesWithoutCoach) {
    console.log('');
    console.log(
      `  NOTE: found ${missing.length}, measurement expected ${EXPECTED.addressesWithoutCoach}. ` +
        'Not necessarily wrong — the CRM has changed since the measurement — but eyeball the list above.',
    );
  }

  summarize(`Pass 5 · coaches ${APPLY ? 'created' : 'to create'}`, created);
  if (skippedNoDivision > 0) summarize('Pass 5 · skipped (no division)', skippedNoDivision);
  if (errors > 0) summarize('Pass 5 · errors', errors);
  if (errors > 0) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Rollback file
// ---------------------------------------------------------------------------

/**
 * The block at the top of this file is the coarse, hand-written undo. This is
 * the exact one: a per-row `UPDATE`/`DELETE` restoring the literal prior value
 * of every column this run touched, in reverse order of application.
 */
function writeRollbackFile(): string | null {
  if (!APPLY) {
    console.log('');
    console.log(
      `  Dry run: ${rollbackStatements.length} rollback statement(s) would be written to ${OUT_DIR}/.`,
    );
    return null;
  }

  if (rollbackStatements.length === 0) {
    console.log('');
    console.log('  Nothing was written, so there is no rollback file to emit.');
    return null;
  }

  const stamp = RUN_AT.toISOString().replace(/[:.]/g, '-');
  const path = join(OUT_DIR, `crm-signal-recovery-rollback-${stamp}.sql`);

  const header = [
    '-- Exact rollback for scripts/recover-crm-inbound-signals.ts',
    `-- Run at: ${RUN_AT.toISOString()}`,
    `-- Passes:  ${[...SELECTED_PASSES].sort((a, b) => a - b).join(', ')}`,
    `-- Statements: ${rollbackStatements.length}`,
    '--',
    '-- Every statement restores one row to its exact pre-run value. Wrap the',
    '-- whole file in a transaction and run it in one go:',
    '--',
    '--   BEGIN;',
    '--   \\i <this file>',
    '--   -- verify, then:',
    '--   COMMIT;   -- or ROLLBACK;',
    '--',
    '-- Statements are emitted in application order; reversing them is not',
    '-- required because each one targets a distinct row and column set.',
    '',
  ].join('\n');

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path, `${header}${rollbackStatements.join('\n')}\n`, 'utf8');

  console.log('');
  console.log(`  Rollback file: ${path}  (${rollbackStatements.length} statement(s))`);
  return path;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (ARGV.includes('--help')) {
    console.log('See the header of this file for full documentation.');
    console.log('');
    console.log('  npx tsx scripts/recover-crm-inbound-signals.ts                 # dry run, all passes');
    console.log('  npx tsx scripts/recover-crm-inbound-signals.ts --only=1         # dry run, one pass');
    console.log('  npx tsx scripts/recover-crm-inbound-signals.ts --apply          # WRITE');
    console.log('');
    console.log('  --apply | --confirm     actually write (default is dry run)');
    console.log('  --only=1,2,3            run a subset of passes (default: 1,2,3,4,5)');
    console.log('  --allow-mirror-clear    let Pass 3 NULL out a mirror with no human event');
    console.log(`  --assume-division=D3    division for Pass 5 rows with no same-domain sibling`);
    console.log(`  --out-dir=path          where to write the rollback file (default ${OUT_DIR})`);
    return;
  }

  banner();

  const sb = adminClient();
  await preflight(sb);

  // Fixed order. Passes are independent — each loads what it needs — so the
  // order is for readability, not correctness, and `--only` cannot break it.
  if (SELECTED_PASSES.has(1)) await pass1(sb);
  if (SELECTED_PASSES.has(2)) await pass2(sb);
  if (SELECTED_PASSES.has(3)) await pass3(sb);
  if (SELECTED_PASSES.has(4)) await pass4(sb);
  if (SELECTED_PASSES.has(5)) await pass5(sb);

  section(APPLY ? 'SUMMARY — APPLIED' : 'SUMMARY — DRY RUN (nothing was written)');

  if (summaryRows.length === 0) {
    console.log('  No passes produced any countable change.');
  } else {
    printCounts(APPLY ? 'Changes written' : 'Changes that WOULD be written', summaryRows);
  }

  if (warnings.length > 0) {
    console.log('');
    console.log(`  ${warnings.length} warning(s) — these need a human:`);
    for (const message of warnings) console.log(`    ⚠ ${message}`);
  }

  writeRollbackFile();

  console.log('');
  if (APPLY) {
    console.log('  Done. Re-run without --apply to confirm the passes are now no-ops');
    console.log('  (they are idempotent, so a second dry run should report zero changes).');
  } else {
    console.log('  Dry run complete. NOTHING was written.');
    console.log('  Check the Pass 1 distribution against the expected ~178 automated / ~16 human');
    console.log('  before re-running with --apply.');
  }
  console.log('');
}

main().catch((error: unknown) => {
  console.error('');
  console.error('recover-crm-inbound-signals failed:');
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
