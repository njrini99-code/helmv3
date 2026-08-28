/**
 * Triage, run on demand.
 *
 * Reads the last N hours from ALL THREE sources — `admin_events`, plus the
 * correlated Sentry/Supabase/Vercel signals the reliability collector writes
 * to `background_job_logs.reliability-snapshot` — groups them by cause, and
 * prints the plan. The decisions live in `src/lib/admin/triage-engine.ts`,
 * which is pure; this file is I/O and formatting only.
 *
 *   npm run triage                    # 72h, DRY RUN, human-readable
 *   npm run triage -- --hours 24      # narrower window
 *   npm run triage -- --json          # machine-readable, for a routine
 *   npm run triage -- --apply         # write: close what is provably closeable
 *   npm run triage -- --input dump.json   # run against a saved dump, no DB
 *
 * DRY RUN IS THE DEFAULT and `--apply` is the only thing that writes. That is
 * deliberate: this reads a SHARED PRODUCTION database serving live users, and
 * a triage tool whose first accidental invocation resolves incidents is worse
 * than no tool.
 *
 * `--input` exists so the plan can be produced and reviewed WITHOUT holding a
 * service-role key — the same reason the engine is pure. Dump once, iterate on
 * the plan offline, apply deliberately.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRowsResult } from '../src/lib/supabase/fetch-all-rows';
import type { Database } from '../src/lib/types/database';
import {
  buildTriagePlan,
  type TriageCandidate,
  type SourceHealth,
  type TriagePlan,
  type TriageGroup,
} from '../src/lib/admin/triage-engine';
import type { IncidentSeverity } from '../src/lib/admin/incident-grouping';

interface Args {
  hours: number;
  json: boolean;
  apply: boolean;
  input: string | null;
  dump: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const hoursRaw = get('--hours');
  const hours = hoursRaw ? Number(hoursRaw) : 72;
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error(`--hours must be a positive number, got ${hoursRaw}`);
  }
  return {
    hours,
    json: argv.includes('--json'),
    apply: argv.includes('--apply'),
    input: get('--input'),
    dump: get('--dump'),
  };
}

/** What a dump holds — exactly the engine's inputs, nothing derived. */
interface TriageDump {
  candidates: TriageCandidate[];
  sourceHealth: SourceHealth[];
  windowHours: number;
  collectedAt: string;
}

interface AdminEventRow {
  fingerprint: string | null;
  title: string | null;
  message: string | null;
  severity: string | null;
  source: string | null;
  feature: string | null;
  url: string | null;
  metadata: unknown;
  created_at: string | null;
  id: string;
}

interface AnalysisRow {
  fingerprint: string | null;
  metadata: unknown;
  created_at: string | null;
  id: string;
}

const SEVERITIES = new Set(['critical', 'error', 'warning', 'info']);
function asSeverity(value: unknown): IncidentSeverity {
  const s = typeof value === 'string' ? value.toLowerCase() : '';
  return (SEVERITIES.has(s) ? s : 'error') as IncidentSeverity;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

type Admin = SupabaseClient<Database>;

/**
 * The CLI builds its own client rather than importing `createAdminClient`.
 *
 * That helper calls `Sentry.instrumentSupabaseClient`, which only exists once
 * the Next.js Sentry SDK has initialised — in a bare `tsx` process it is
 * `undefined` and the whole script dies on
 * `Sentry.instrumentSupabaseClient is not a function` before reading a single
 * row. Same credentials, same `Database` typing, same read-only intent; it
 * simply does not drag a framework runtime into a command-line tool.
 */
function createTriageClient(): Admin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || /placeholder\.supabase\.co/i.test(url)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing or a placeholder.');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing.');
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Source 1 — `admin_events`. Unresolved errors in the window, one candidate
 * per fingerprint, carrying whatever analysis already exists for it.
 *
 * `event_type = 'error'` excludes `rca_analysis` rows, which are stored in
 * this same table under the fingerprint they analyse — without the filter an
 * analysis counts as an occurrence of the thing it analyses.
 */
async function collectAdminEvents(
  admin: Admin,
  since: string,
): Promise<{ candidates: TriageCandidate[]; health: SourceHealth }> {
  // PAGINATED, not `.limit(2000)`.
  //
  // PostgREST truncates every response at 1000 rows (supabase/config.toml
  // `max_rows`), so a larger limit does not fail — it silently returns 1000.
  // For THIS script that is the worst possible failure: triage would read a
  // truncated window, find nothing unanalysed in it, and report a clean board.
  // A monitor reporting health from a partial read is the exact thing the
  // engine exists to prevent, and CI's row-cap check caught it here before it
  // ever ran that way.
  //
  // `.order('created_at')` alone is not a stable page key — ties would let
  // rows drift across page boundaries — so `id` breaks the tie.
  const { data, error } = await fetchAllRowsResult<AdminEventRow>((from, to) =>
    admin
      .from('admin_events')
      .select('fingerprint, title, message, severity, source, feature, url, metadata, created_at, id')
      .eq('event_type', 'error')
      .eq('resolved', false)
      .not('fingerprint', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  );

  if (error) {
    // A source that could not be READ is never reported as zero problems.
    return {
      candidates: [],
      health: { source: 'admin_events', status: 'blind', reason: error.message },
    };
  }

  const { data: analyses, error: analysesError } = await fetchAllRowsResult<AnalysisRow>(
    (from, to) =>
      admin
        .from('admin_events')
        .select('fingerprint, metadata, created_at, id')
        .eq('event_type', 'rca_analysis')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
  );

  if (analysesError) {
    return {
      candidates: [],
      health: { source: 'admin_events', status: 'blind', reason: analysesError.message },
    };
  }

  // Newest analysis per fingerprint wins — the query is newest-first, so the
  // first write for a key is the one to keep.
  const fixByFingerprint = new Map<string, string>();
  for (const row of analyses ?? []) {
    const fp = str(row.fingerprint);
    if (!fp || fixByFingerprint.has(fp)) continue;
    const meta = row.metadata as Record<string, unknown> | null;
    const fix = str(meta?.suggestedFix);
    if (fix) fixByFingerprint.set(fp, fix);
  }

  const byFingerprint = new Map<string, TriageCandidate>();
  for (const row of data ?? []) {
    const fp = str(row.fingerprint);
    if (!fp) continue;
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};
    const createdAt = row.created_at ?? since;
    const existing = byFingerprint.get(fp);
    if (existing) {
      existing.occurrences += 1;
      if (createdAt < existing.firstSeen) existing.firstSeen = createdAt;
      if (createdAt > existing.lastSeen) existing.lastSeen = createdAt;
      continue;
    }
    byFingerprint.set(fp, {
      key: fp,
      origin: 'admin_events',
      title: str(row.title) ?? str(row.message) ?? 'Untitled',
      message: str(row.message),
      route: str(row.url) ?? str(meta.route),
      severity: asSeverity(row.severity),
      errorCode: str(meta.errorCode) ?? str(meta.code),
      feature: str(row.feature),
      action: str(meta.action),
      source: str(row.source),
      occurrences: 1,
      firstSeen: createdAt,
      lastSeen: createdAt,
      seenBy: ['admin_events'],
      evidenceUrl: null,
      existingAnalysisFix: fixByFingerprint.get(fp) ?? null,
    });
  }

  return {
    candidates: [...byFingerprint.values()],
    health: { source: 'admin_events', status: 'ok', reason: null },
  };
}

/**
 * Sources 2–4 — Sentry, Supabase and Vercel, via the correlated snapshot the
 * reliability collector already produces every 3 hours.
 *
 * Not re-collected here on purpose: `runReliabilityCollection` owns talking to
 * those three, and a second implementation of "what did Sentry say" would be a
 * second thing to drift from the tab an operator actually reads.
 */
async function collectReliabilitySignals(
  admin: Admin,
  since: string,
  fixByKey: ReadonlyMap<string, string>,
): Promise<{ candidates: TriageCandidate[]; health: SourceHealth[] }> {
  const { data, error } = await admin
    .from('background_job_logs')
    .select('metadata, started_at')
    .eq('job_type', 'reliability-snapshot')
    .order('started_at', { ascending: false })
    .limit(1);

  if (error) {
    return {
      candidates: [],
      health: [
        { source: 'sentry', status: 'blind', reason: error.message },
        { source: 'supabase', status: 'blind', reason: error.message },
        { source: 'vercel', status: 'blind', reason: error.message },
      ],
    };
  }

  const snapshot = data?.[0]?.metadata as Record<string, unknown> | undefined;
  if (!snapshot) {
    // No snapshot at all is not "three healthy sources found nothing" — it is
    // three sources nobody has looked at.
    return {
      candidates: [],
      health: [
        { source: 'sentry', status: 'blind', reason: 'no reliability-snapshot row on record' },
        { source: 'supabase', status: 'blind', reason: 'no reliability-snapshot row on record' },
        { source: 'vercel', status: 'blind', reason: 'no reliability-snapshot row on record' },
      ],
    };
  }

  const health: SourceHealth[] = (Array.isArray(snapshot.sources) ? snapshot.sources : []).map(
    (raw) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const status = str(s.status);
      return {
        source: str(s.source) ?? 'unknown',
        status: status === 'ok' || status === 'degraded' ? status : 'blind',
        reason: str(s.reason),
      };
    },
  );

  const signals = Array.isArray(snapshot.signals) ? snapshot.signals : [];
  const candidates: TriageCandidate[] = [];
  for (const raw of signals) {
    const s = (raw ?? {}) as Record<string, unknown>;
    const signature = str(s.signature);
    if (!signature) continue;
    const lastSeen = str(s.lastSeen);
    // Same window as `admin_events`, applied here rather than at the source:
    // the snapshot is a rolling correlation and carries signals older than the
    // triage window.
    if (lastSeen && lastSeen < since) continue;
    const sources = Array.isArray(s.sources) ? s.sources.map(String) : [];
    const evidence = Array.isArray(s.evidence) ? s.evidence : [];
    const firstEvidence = (evidence[0] ?? {}) as Record<string, unknown>;
    const key = `rel:${signature}`;
    candidates.push({
      key,
      origin: (sources[0] === 'supabase' || sources[0] === 'vercel' ? sources[0] : 'sentry'),
      title: str(s.title) ?? str(s.summary) ?? 'Untitled signal',
      message: str(s.summary) ?? str(s.title),
      route: str(s.route),
      severity: asSeverity(s.severity),
      errorCode: str(s.errorCode),
      feature: str(s.featureId),
      action: null,
      source: null,
      occurrences: Number(s.count) || 1,
      firstSeen: str(s.firstSeen) ?? lastSeen ?? since,
      lastSeen: lastSeen ?? since,
      seenBy: sources,
      evidenceUrl: str(firstEvidence.ref),
      existingAnalysisFix: fixByKey.get(key) ?? null,
    });
  }

  return { candidates, health };
}

/** Analyses stored for reliability signals, keyed `rel:<signature>`. */
async function collectRelAnalyses(admin: Admin): Promise<Map<string, string>> {
  const { data } = await fetchAllRowsResult<{ fingerprint: string | null; metadata: unknown }>(
    (from, to) =>
      admin
        .from('admin_events')
        .select('fingerprint, metadata, created_at, id')
        .eq('event_type', 'rca_analysis')
        .like('fingerprint', 'rel:%')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
  );
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    const fp = str(row.fingerprint);
    if (!fp || out.has(fp)) continue;
    const fix = str((row.metadata as Record<string, unknown> | null)?.suggestedFix);
    if (fix) out.set(fp, fix);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const BAR = '─'.repeat(78);

function renderGroup(g: TriageGroup, index: number): string {
  const lines: string[] = [];
  const flags = [
    g.corroborated ? `CORROBORATED(${g.origins.join('+')})` : null,
    g.category ? `category=${g.category}` : null,
  ].filter(Boolean);
  lines.push(
    `${String(index + 1).padStart(3)}. [${g.severity.toUpperCase()}] ${g.title}`,
  );
  lines.push(
    `     ${g.occurrences} occurrence${g.occurrences === 1 ? '' : 's'}` +
      ` · ${g.members.length} fingerprint${g.members.length === 1 ? '' : 's'}` +
      ` · last ${g.lastSeen}` +
      (flags.length ? ` · ${flags.join(' · ')}` : ''),
  );
  if (g.route) lines.push(`     route  ${g.route}`);
  if (g.errorCode) lines.push(`     code   ${g.errorCode}`);
  lines.push(`     why    ${g.reason}`);
  if (g.members.length > 1) {
    lines.push(`     keys   ${g.members.map((m) => m.key).join(', ')}`);
  }
  for (const url of g.evidenceUrls.slice(0, 2)) lines.push(`     stack  ${url}`);
  return lines.join('\n');
}

function renderPlan(plan: TriagePlan): string {
  const out: string[] = [];
  out.push(BAR);
  out.push(`TRIAGE — last ${plan.windowHours}h — ${plan.generatedAt}`);
  out.push(BAR);

  out.push('');
  out.push('SOURCES');
  for (const s of plan.sourceHealth) {
    const mark = s.status === 'ok' ? 'ok    ' : s.status === 'degraded' ? 'DEGRADED' : 'BLIND ';
    out.push(`  ${mark} ${s.source}${s.reason ? ` — ${s.reason}` : ''}`);
  }
  if (plan.blindSources.length > 0) {
    out.push('');
    out.push(
      `  !! THIS PLAN IS INCOMPLETE. ${plan.blindSources.join(', ')} could not be read.`,
    );
    out.push('     A source that failed to read is UNKNOWN, not clean.');
  }

  const c = plan.counts;
  out.push('');
  out.push(
    `${c.candidates} candidates → ${c.groups} causes (${c.collapsed} collapsed)` +
      ` · ${c.needsAnalysis} need analysis · ${c.notADefect} closeable` +
      ` · ${c.quietUnrecognised} quiet/unrecognised · ${c.analysed} already analysed` +
      ` · ${c.corroborated} corroborated`,
  );

  out.push('');
  out.push(BAR);
  out.push(`NEEDS ANALYSIS (${plan.queue.length}) — this is the list to act on`);
  out.push(BAR);
  if (plan.queue.length === 0) {
    out.push('  nothing — every actionable cause in the window carries an analysis');
  }
  plan.queue.forEach((g, i) => out.push(renderGroup(g, i)));

  out.push('');
  out.push(BAR);
  out.push(`CLOSEABLE (${plan.closeable.length}) — non-actionable by their own content`);
  out.push(BAR);
  plan.closeable.forEach((g, i) => out.push(renderGroup(g, i)));

  out.push('');
  out.push(BAR);
  out.push(
    `QUIET, UNRECOGNISED (${plan.quiet.length}) — logged at info, matched by no rule.`,
  );
  out.push('  Reported, never auto-closed: "nothing recognised it" is not a verdict.');
  out.push(BAR);
  plan.quiet.forEach((g, i) => out.push(renderGroup(g, i)));

  const analysed = plan.groups.filter((g) => g.verdict === 'analysed');
  out.push('');
  out.push(BAR);
  out.push(`ALREADY ANALYSED (${analysed.length})`);
  out.push(BAR);
  analysed.forEach((g, i) => out.push(renderGroup(g, i)));

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Close what the plan says is closeable — BOTH writes, never just the first.
 *
 * `admin_events.resolved` is per-ROW and only hides what exists now; the next
 * occurrence arrives as a fresh unresolved row with no memory anything was
 * ever decided. `admin_auto_resolve_error_fingerprint` is what makes a
 * recurrence read as a REGRESSION instead of a new bug, and it refuses to
 * downgrade a human's `manual` resolution. Measured 2026-08-27: 12
 * fingerprints resolved with the bare UPDATE alone and the ledger held zero
 * rows.
 */
async function applyPlan(admin: Admin, plan: TriagePlan): Promise<void> {
  let rowsResolved = 0;
  let ledgerRecorded = 0;
  let ledgerDeclined = 0;

  for (const group of plan.closeable) {
    for (const member of group.members) {
      // Reliability signals have no admin_events rows to flip — ledger only.
      if (member.origin === 'admin_events') {
        const { error, count } = await admin
          .from('admin_events')
          .update({ resolved: true, resolved_at: new Date().toISOString() }, { count: 'exact' })
          .eq('fingerprint', member.key)
          .eq('event_type', 'error')
          .eq('resolved', false);
        if (error) {
          console.error(`  resolve ${member.key} FAILED: ${error.message}`);
          continue;
        }
        rowsResolved += count ?? 0;
      }

      const { data, error: rpcError } = await admin.rpc('admin_auto_resolve_error_fingerprint', {
        p_fingerprint: member.key,
        p_last_seen_at: member.lastSeen,
        p_fixed_in_sha: null,
        p_note: `triage: ${group.reason}`.slice(0, 500),
      });
      if (rpcError) {
        console.error(`  ledger ${member.key} FAILED: ${rpcError.message}`);
        continue;
      }
      if (data === true) ledgerRecorded += 1;
      else ledgerDeclined += 1;
    }
  }

  console.log('');
  console.log(BAR);
  console.log(
    `APPLIED — ${rowsResolved} admin_events rows resolved, ` +
      `${ledgerRecorded} ledger rows recorded, ` +
      `${ledgerDeclined} declined (a human had already resolved them — the RPC working)`,
  );
  console.log(BAR);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const since = new Date(now.getTime() - args.hours * 3600_000).toISOString();

  let candidates: TriageCandidate[];
  let sourceHealth: SourceHealth[];

  if (args.input) {
    const dump = JSON.parse(readFileSync(args.input, 'utf-8')) as TriageDump;
    candidates = dump.candidates;
    sourceHealth = dump.sourceHealth;
    console.log(`# input: ${args.input} (collected ${dump.collectedAt})`);
  } else {
    const admin = createTriageClient();
    const relAnalyses = await collectRelAnalyses(admin);
    const [events, reliability] = await Promise.all([
      collectAdminEvents(admin, since),
      collectReliabilitySignals(admin, since, relAnalyses),
    ]);
    candidates = [...events.candidates, ...reliability.candidates];
    sourceHealth = [events.health, ...reliability.health];
  }

  if (args.dump) {
    const dump: TriageDump = {
      candidates,
      sourceHealth,
      windowHours: args.hours,
      collectedAt: now.toISOString(),
    };
    writeFileSync(args.dump, JSON.stringify(dump, null, 2));
    console.log(`# dumped ${candidates.length} candidates → ${args.dump}`);
  }

  const plan = buildTriagePlan({ candidates, sourceHealth, windowHours: args.hours, now });

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(renderPlan(plan));
  }

  if (args.apply) {
    if (args.input) {
      throw new Error('--apply cannot be combined with --input: apply must write against the same live state it read.');
    }
    await applyPlan(createTriageClient(), plan);
  } else {
    console.log('');
    console.log('# DRY RUN — nothing was written. Re-run with --apply to close the closeable set.');
  }
}

main().catch((err) => {
  console.error('run-triage failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
