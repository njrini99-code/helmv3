/**
 * Security posture of the Supabase observability surface - brief 60 and 61.
 *
 * Static, read-only, no network, no database. Every check reads a file in
 * this repository and reports what it found. Where a claim genuinely needs
 * the live catalog (does production actually have these grants), the check
 * reports NOT_CONFIGURED without a credential rather than guessing - a
 * migration existing is not evidence the grant is live (shipping.md trap G8).
 *
 * Verdicts:
 *   PASS            established from the repository
 *   FAIL            established and false -> the runner exits non-zero
 *   NOT_CONFIGURED  needs a credential this process does not have
 *
 * NOTE ON WORDING: the SQL clause inside CREATE FUNCTION is the language's
 * own and appears in the migrations verbatim. This file says "definer-rights"
 * in its prose, per the repo convention that keeps the uppercase two-word
 * phrase out of narrative text.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The migrations this observability program adds. */
const OBSERVABILITY_MIGRATION_PREFIXES = ['202609031800', '202609031801', '202609031802', '202609031803', '202609031900', '202609031901', '202609031902', '202609031903'];

/**
 * The ONE pre-existing endpoint that accepts unauthenticated client-supplied
 * error payloads. Brief 61 forbids CREATING a generic browser error-ingest
 * endpoint; this one predates the whole program (it writes `error_logs` /
 * `admin_events`, not any observability table added here). It is allow-listed
 * with its measured per-control status so the guard fails on a NEW one while
 * the existing gap stays visible instead of being silently blessed.
 */
const KNOWN_INGEST_ROUTES = new Set(['src/app/api/log-error/route.ts']);

function read(relPath) {
  const p = join(REPO_ROOT, relPath);
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

/**
 * Source with comments removed. Same lesson the certification matrix learned
 * the hard way: a check that matches prose is not reading behaviour. The CRM
 * calendar route mentions `error_logs` only in a comment about NOT flooding
 * it, and was flagged as an error-ingest endpoint because of that sentence.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Does this route REFUSE an unauthenticated caller? Brief 61 is about a
 * PUBLIC arbitrary ingest endpoint; a route that 401s without a session is
 * not one, however much error-shaped data it accepts.
 */
function enforcesAuth(source) {
  if (/requireSuperAdmin\s*\(|requireCronAuth\s*\(/.test(source)) return true;
  // A `!user` / `!session` guard that returns 401 close by. The window is
  // deliberately small so an unrelated 401 elsewhere in the file cannot
  // vouch for a guard that is not there.
  return /if\s*\(\s*!\s*(user|session)\s*\)[\s\S]{0,300}?401/.test(source);
}

/** Whitespace-collapsed source, so a multi-line SQL signature matches. */
function flatten(sql) {
  return sql.replace(/\s+/g, ' ');
}

function walk(dir, out = []) {
  const abs = join(REPO_ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    const rel = join(dir, entry);
    const full = join(REPO_ROOT, rel);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(rel, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

function check(id, title, verdict, detail, evidence) {
  return { id, title, verdict, detail, ...(evidence !== undefined ? { evidence } : {}) };
}

function verdictOf(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function observabilityMigrations() {
  const dir = 'supabase/migrations';
  return readdirSync(join(REPO_ROOT, dir))
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => OBSERVABILITY_MIGRATION_PREFIXES.some((p) => f.startsWith(p)))
    .map((f) => ({ file: join(dir, f), sql: readFileSync(join(REPO_ROOT, dir, f), 'utf-8') }));
}

// ---------------------------------------------------------------------------
// 1. Every new observability table is private
// ---------------------------------------------------------------------------

function tablesArePrivate(migrations) {
  const problems = [];
  const tables = [];

  for (const { file, sql } of migrations) {
    const flat = flatten(sql);
    for (const m of sql.matchAll(/create table if not exists\s+(helm_debug\.[a-z0-9_]+)/gi)) {
      tables.push({ table: m[1], file });
    }
    const createsTable = /create table if not exists\s+helm_debug\./i.test(sql);
    if (!createsTable) continue;

    // The schema itself must be closed to PUBLIC in the same migration that
    // adds a table to it - a table is only as private as its schema.
    if (!/revoke all on schema helm_debug from public/i.test(flat)) {
      problems.push(`${file}: adds a helm_debug table without revoking the schema from public`);
    }
    if (!/revoke all on all tables in schema helm_debug from public/i.test(flat)) {
      problems.push(`${file}: adds a helm_debug table without revoking table privileges from public`);
    }
    // No direct grant to a browser-reachable role, on anything.
    for (const m of flat.matchAll(/grant\s+[^;]*?\son\s+(?:table\s+)?helm_debug\.[a-z0-9_]+\s+to\s+([^;]+);/gi)) {
      if (/\b(anon|authenticated|public)\b/i.test(m[1])) {
        problems.push(`${file}: grants a helm_debug table to ${m[1].trim()}`);
      }
    }
    for (const m of flat.matchAll(/grant\s+usage\s+on\s+schema\s+helm_debug\s+to\s+([^;]+);/gi)) {
      if (/\b(anon|authenticated|public)\b/i.test(m[1])) {
        problems.push(`${file}: grants helm_debug schema USAGE to ${m[1].trim()}`);
      }
    }
  }

  return check(
    'tables_private',
    'Every new observability table is private (no anon, no authenticated)',
    problems.length === 0 && tables.length > 0 ? 'PASS' : tables.length === 0 ? 'FAIL' : 'FAIL',
    problems.length === 0
      ? `${tables.length} table(s) in helm_debug, schema revoked from public, no direct grant to anon/authenticated/public`
      : problems.join('; '),
    { tables: tables.map((t) => t.table) },
  );
}

// ---------------------------------------------------------------------------
// 2 + 3. Facades: definer-rights with a fixed search_path, service-role-only
// ---------------------------------------------------------------------------

function facadesAreLockedDown(migrations) {
  const problems = [];
  const functions = [];

  for (const { file, sql } of migrations) {
    const flat = flatten(sql);
    for (const m of sql.matchAll(/create or replace function\s+public\.([a-z0-9_]+)\s*\(/gi)) {
      const name = m[1];
      functions.push({ name, file });

      // The body between this CREATE and the next statement terminator.
      const start = m.index ?? 0;
      const body = sql.slice(start, start + 4000);
      if (!/set\s+search_path\s*=/i.test(body)) {
        problems.push(`${file}: public.${name} has no fixed search_path`);
      }
      const revoked = new RegExp(
        `revoke execute on function public\\.${name}\\s*\\([^)]*\\)\\s*from\\s+([^;]+);`,
        'i',
      ).exec(flat);
      if (!revoked) {
        problems.push(`${file}: public.${name} never revokes EXECUTE`);
      } else if (!/\bpublic\b/i.test(revoked[1]) || !/\banon\b/i.test(revoked[1]) || !/\bauthenticated\b/i.test(revoked[1])) {
        problems.push(`${file}: public.${name} revokes EXECUTE from "${revoked[1].trim()}" - must cover public, anon and authenticated`);
      }
      const granted = new RegExp(
        `grant execute on function public\\.${name}\\s*\\([^)]*\\)\\s*to\\s+([^;]+);`,
        'i',
      ).exec(flat);
      if (!granted) {
        problems.push(`${file}: public.${name} never grants EXECUTE to service_role`);
      } else if (/\b(anon|authenticated|public)\b/i.test(granted[1])) {
        problems.push(`${file}: public.${name} grants EXECUTE to ${granted[1].trim()}`);
      }
    }
  }

  return check(
    'facades_service_role_only',
    'Every facade is service-role-only with a fixed search_path',
    verdictOf(problems.length === 0 && functions.length > 0),
    problems.length === 0
      ? `${functions.length} facade(s), each with a fixed search_path, EXECUTE revoked from public/anon/authenticated and granted only to service_role`
      : problems.join('; '),
    { functions: functions.map((f) => `public.${f.name}`) },
  );
}

// ---------------------------------------------------------------------------
// 4. Bridge routes are admin-gated
// ---------------------------------------------------------------------------

const OBSERVABILITY_READERS = [
  'fetchTelemetryHealth',
  'fetchDatabaseErrors',
  'fetchDatabaseMissionControl',
  'fetchQueryPerformance',
  'fetchTableHealth',
  'fetchLockIncidents',
  'fetchJobsHealth',
  // The RPC names too, so a COLLECTOR route that calls a facade directly
  // (rather than through a fetch* reader) is held to its own cron gate. A
  // check that only knew the readers would have declared the whole surface
  // gated on the strength of one admin page.
  'helm_debug_db_health_snapshot',
  'record_db_health_sample',
  'helm_debug_stat_statements_snapshot',
  'record_db_stat_snapshot',
  'helm_debug_db_lock_snapshot',
  'record_db_lock_incident',
  'helm_debug_db_table_snapshot',
  'record_db_table_sample',
  'helm_debug_prune_observability',
  'helm_debug_read_observability_sizes',
];

function bridgeRoutesAreGated() {
  const problems = [];
  const gated = [];

  const surfaces = walk('src/app').filter(
    (f) => (f.endsWith('page.tsx') || f.endsWith('route.ts')) && !f.includes('__tests__'),
  );

  for (const file of surfaces) {
    const source = read(file) ?? '';
    if (!OBSERVABILITY_READERS.some((r) => source.includes(r))) continue;

    const isCron = file.includes('/api/cron/');
    const adminGated = /requireSuperAdmin\s*\(/.test(source);
    const cronGated = /requireCronAuth\s*\(/.test(source);

    if (isCron ? cronGated : adminGated) {
      gated.push(`${file} (${isCron ? 'cron secret' : 'super admin'})`);
    } else {
      problems.push(`${file}: reads observability data with no ${isCron ? 'cron' : 'super-admin'} gate`);
    }
  }

  return check(
    'bridge_routes_admin_gated',
    'Every surface reading observability data is admin- or cron-gated',
    problems.length === 0 && gated.length > 0 ? 'PASS' : gated.length === 0 ? 'FAIL' : 'FAIL',
    problems.length === 0
      ? `${gated.length} surface(s) gated: ${gated.join(', ')}`
      : problems.join('; '),
  );
}

// ---------------------------------------------------------------------------
// 5. No server-only observability module is reachable from a client component
// ---------------------------------------------------------------------------

function serverOnlyModulesNotClientReachable() {
  const problems = [];

  // The server-only half of the observability surface, read from the files
  // themselves rather than from a hand-kept list that would rot.
  const serverOnly = walk('src/lib/observability')
    .filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && !f.includes('__fixtures__'))
    .filter((f) => /^import 'server-only';/m.test(read(f) ?? ''))
    .map((f) => f.replace(/^src\//, '@/').replace(/\.ts$/, ''));

  const clientFiles = [...walk('src/app'), ...walk('src/components'), ...walk('src/hooks')]
    .filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('__tests__'))
    .filter((f) => /^['"]use client['"]/m.test(read(f) ?? ''));

  for (const file of clientFiles) {
    const source = read(file) ?? '';
    for (const mod of serverOnly) {
      if (source.includes(mod)) {
        problems.push(`${file} ('use client') imports ${mod}`);
      }
    }
  }

  return check(
    'no_server_only_module_in_client',
    "No server-only observability module is reachable from a 'use client' component",
    verdictOf(problems.length === 0),
    problems.length === 0
      ? `${serverOnly.length} server-only module(s) checked against ${clientFiles.length} client component(s); none imported`
      : problems.join('; '),
    { serverOnlyModules: serverOnly },
  );
}

// ---------------------------------------------------------------------------
// 6. Brief 61 - no generic browser error-ingest endpoint
// ---------------------------------------------------------------------------

/** The six controls brief 61 requires IF such an endpoint ever exists. */
function ingestControls(source) {
  return {
    auth: enforcesAuth(source),
    schemaValidation: /typeof\s+\w+\.\w+\s*===\s*'string'/.test(source) || /safeParse|zod/.test(source),
    allowList: /ALLOW_?LIST|allowlist|allowedFields/i.test(source),
    rateLimit: /checkRateLimit|rateLimit/i.test(source),
    dedupe: /fingerprint|buildIncidentSignature/i.test(source),
    sizeLimit: /\.length\s*<=\s*\d{3,}|slice\(0,\s*\d{3,}\)|maxBytes|MAX_BODY/i.test(source),
  };
}

function noGenericBrowserIngest() {
  const routes = walk('src/app/api').filter((f) => f.endsWith('route.ts'));
  const candidates = [];

  for (const file of routes) {
    const raw = read(file) ?? '';
    const source = stripComments(raw);
    if (!/export\s+async\s+function\s+POST/.test(source)) continue;
    // "Generic browser error ingest" = a POST that (a) persists a
    // client-supplied error report and (b) accepts an UNAUTHENTICATED
    // caller. All three signals together, so an ordinary authenticated
    // product POST is not swept in - two were, before the auth clause and
    // the comment stripping were added.
    const takesErrorReport = /error_logs|admin_events|errorReport|stack_trace/i.test(source);
    const clientSupplied = /request\.(json|text)\(\)/.test(source);
    if (takesErrorReport && clientSupplied && !enforcesAuth(source)) candidates.push(file);
  }

  const unknown = candidates.filter((f) => !KNOWN_INGEST_ROUTES.has(f));
  const known = candidates.filter((f) => KNOWN_INGEST_ROUTES.has(f));

  const controlReport = known.map((f) => ({ route: f, controls: ingestControls(read(f) ?? '') }));

  return check(
    'no_new_generic_browser_ingest',
    'Brief 61 - no NEW generic browser error-ingest endpoint',
    verdictOf(unknown.length === 0),
    unknown.length === 0
      ? `no new ingest endpoint; ${known.length} pre-existing route allow-listed with its controls measured below`
      : `NEW ingest endpoint(s) with no brief-61 review: ${unknown.join(', ')}`,
    { preExisting: controlReport },
  );
}

/**
 * The pre-existing route's controls, reported as their own row so a gap is
 * visible rather than hidden inside an allow-list. This is deliberately NOT
 * a FAIL: brief 61 governs endpoints this program creates, and this one
 * predates it. Reporting it as a finding is the honest treatment - silently
 * blessing it is not, and failing the build on it would be scope this track
 * was not asked to change.
 */
function preExistingIngestControls() {
  const rows = [];
  for (const file of KNOWN_INGEST_ROUTES) {
    const source = read(file);
    if (source === null) continue;
    const controls = ingestControls(source);
    const missing = Object.entries(controls)
      .filter(([, present]) => !present)
      .map(([name]) => name);
    rows.push({ file, controls, missing });
  }
  const anyMissing = rows.some((r) => r.missing.length > 0);
  return check(
    'pre_existing_ingest_controls',
    'Pre-existing browser ingest route - per-control status (finding, not a gate)',
    anyMissing ? 'FINDING' : 'PASS',
    rows
      .map((r) => `${r.file}: missing ${r.missing.length === 0 ? 'nothing' : r.missing.join(', ')}`)
      .join('; '),
    { rows },
  );
}

// ---------------------------------------------------------------------------
// 7. Live catalog - needs a credential
// ---------------------------------------------------------------------------

function liveCatalogVerification() {
  const hasToken = Boolean(process.env.SUPABASE_ACCESS_TOKEN?.trim());
  return check(
    'live_catalog_grants',
    'The LIVE catalog matches what the migrations declare',
    hasToken ? 'NOT_CONFIGURED' : 'NOT_CONFIGURED',
    hasToken
      ? 'a credential is present, but this script performs no network call by design - run the read-only catalog query manually and record it in docs/observability/'
      : 'SUPABASE_ACCESS_TOKEN is not set; a migration existing is not evidence the grant is live (every migration in this program is HELD and unapplied)',
  );
}

export function runSecurityPosture() {
  const migrations = observabilityMigrations();
  return [
    tablesArePrivate(migrations),
    facadesAreLockedDown(migrations),
    bridgeRoutesAreGated(),
    serverOnlyModulesNotClientReachable(),
    noGenericBrowserIngest(),
    preExistingIngestControls(),
    liveCatalogVerification(),
  ];
}

/** Exits non-zero only on a real FAIL. FINDING and NOT_CONFIGURED do not. */
export function summarizeSecurityPosture(checks) {
  const fail = checks.filter((c) => c.verdict === 'FAIL').length;
  return {
    checks,
    pass: checks.filter((c) => c.verdict === 'PASS').length,
    fail,
    findings: checks.filter((c) => c.verdict === 'FINDING').length,
    notConfigured: checks.filter((c) => c.verdict === 'NOT_CONFIGURED').length,
    ok: fail === 0,
  };
}

export const __testing = { flatten, stripComments, enforcesAuth, ingestControls, KNOWN_INGEST_ROUTES, REPO_ROOT, relative };
