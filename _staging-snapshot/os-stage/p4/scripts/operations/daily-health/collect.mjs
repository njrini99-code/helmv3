#!/usr/bin/env node
// daily-health/collect.mjs — read-only observability collector for the
// GolfHelm Engineering OS (spec §23: docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md).
//
// Reads Helm Bridge (admin_events), Sentry (optional), Vercel (production
// identity), and GitHub Actions CI (latest main runs). NEVER mutates
// anything — no writes to admin_events, no Sentry issue updates, no Vercel
// deploy/promote calls, no repo writes. Outputs one normalized JSON document
// to stdout (or --out <path>).
//
//   node scripts/operations/daily-health/collect.mjs
//   node scripts/operations/daily-health/collect.mjs --from 2026-08-20T00:00:00Z --to 2026-08-21T00:00:00Z
//   node scripts/operations/daily-health/collect.mjs --out /tmp/health.json
//
// HOUSE RULE (spec §42 / campaign house rules): a source being unreadable is
// reported as unreadable, NEVER as healthy or zero. Every `sources.*` entry
// carries a `status` of 'ok' | 'unconfigured' | 'error' (Helm Bridge's own
// AdminFetchResult vocabulary — src/lib/admin/fetch-result.ts) plus a `note`
// string a human can read without re-deriving the failure. A missing source
// must never silently collapse a signals[] count to 0.
//
// FEATURE MAPPING (deliberately minimal — see mapFeatureId below): this
// script does NOT attempt to reconcile memory/registry.yml's ~19 coarse
// feature ids against feature-registry.ts's 86 fine-grained FeatureKeys.
// The P0 registry audit (os-audit-registry.md §3b) found the two vocabularies
// disagree on file ownership for every id that shares a spelling — building
// a second, ad hoc mapping here would either duplicate or contradict the
// dedicated reconciliation tool the campaign already scoped to Phase 5
// (scripts/knowledge/check-registry-consistency.mjs). Passing the raw
// `admin_events.feature` value through unmapped is the honest choice: it is
// already the canonical FeatureKey the app itself wrote at the observation
// site (feature-registry.ts is the source of truth for that column), and a
// human/Phase-5 tool can resolve it against memory/registry.yml later. Only
// a genuinely NULL feature column degrades to the literal string 'unmapped'.
//
// This file is written as importable, unit-testable pure functions
// (aggregateByFingerprint, mapFeatureId, classifySignal, buildOutput, ...)
// plus thin impure I/O wrappers, so src/test/operations/daily-health-collect.test.ts
// can exercise the logic with zero network/DB access.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');

const DEFAULT_WINDOW_HOURS = 24;
const BRIDGE_PAGE_SIZE = 1000; // PostgREST's hard cap — see incident-feed.ts's documented trap.
const BRIDGE_MAX_PAGES = 50; // 50k rows ceiling for one collection run; truncation is reported, not hidden.
const SENTRY_MAX_PAGES = 5; // Deliberately smaller than sentry-api.ts's MAX_PAGES=20 — this is a
// scheduled batch job, not a page render; a daily sweep does not need
// 1,000 issues of headroom, and a smaller ceiling keeps one bad org from
// stalling a cron. truncated:true is reported exactly like sentry-api.ts does.
const REGRESSION_LOOKBACK_DAYS = 90; // Mirrors incident-feed.ts's queryPriorResolutions window.

// ---------------------------------------------------------------------------
// argv / window
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const out = { from: null, to: null, out: null, pretty: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') out.from = argv[++i] ?? null;
    else if (a === '--to') out.to = argv[++i] ?? null;
    else if (a === '--out') out.out = argv[++i] ?? null;
    else if (a === '--compact') out.pretty = false;
  }
  return out;
}

/** Pure — resolves the collection window. Defaults to the trailing 24h. */
export function resolveWindow({ from, to } = {}, now = new Date()) {
  const toDate = to ? new Date(to) : now;
  if (Number.isNaN(toDate.getTime())) {
    throw new Error(`--to is not a valid date: ${to}`);
  }
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - DEFAULT_WINDOW_HOURS * 3600_000);
  if (Number.isNaN(fromDate.getTime())) {
    throw new Error(`--from is not a valid date: ${from}`);
  }
  const hours = Math.round((toDate.getTime() - fromDate.getTime()) / 3600_000);
  return { from: fromDate.toISOString(), to: toDate.toISOString(), hours };
}

// ---------------------------------------------------------------------------
// Feature mapping (see file-header note — deliberately minimal)
// ---------------------------------------------------------------------------

/** Pure. `null`/`undefined`/`''` all mean "the emitter never tagged a feature" — 'unmapped', not a guess. */
export function mapFeatureId(rawFeature) {
  const trimmed = typeof rawFeature === 'string' ? rawFeature.trim() : '';
  return trimmed.length > 0 ? trimmed : 'unmapped';
}

// ---------------------------------------------------------------------------
// Bridge (admin_events) — normalize + aggregate
// ---------------------------------------------------------------------------

/**
 * Pure. One admin_events row -> one pre-aggregation signal draft.
 * `fingerprint` falls back to a per-row synthetic id rather than being
 * dropped — an event with no fingerprint is still a real event, and
 * silently excluding it would understate the count exactly when the
 * fingerprinting itself might be the bug.
 */
export function normalizeBridgeRow(row) {
  const fingerprint =
    typeof row.fingerprint === 'string' && row.fingerprint.length > 0
      ? row.fingerprint
      : `no-fingerprint:${row.id}`;
  return {
    fingerprint,
    feature_id: mapFeatureId(row.feature),
    severity: row.severity ?? 'error',
    created_at: row.created_at,
    title: row.title ?? null,
    source: 'bridge',
  };
}

/**
 * Pure. Groups normalized Bridge rows by fingerprint into one signal per
 * fingerprint — count, first_seen/last_seen, and the highest-severity title
 * as the representative sample. This is the dedupe half of spec §18: many
 * admin_events rows for the same fingerprint collapse to one signal here,
 * before classification and long before any incident/PR decision.
 */
const SEVERITY_RANK = { critical: 3, error: 2, warning: 1, info: 0 };

export function aggregateByFingerprint(normalizedRows, source = 'bridge') {
  const byFp = new Map();
  for (const row of normalizedRows) {
    const existing = byFp.get(row.fingerprint);
    if (!existing) {
      byFp.set(row.fingerprint, {
        fingerprint: row.fingerprint,
        feature_id: row.feature_id,
        source,
        count: 1,
        first_seen: row.created_at,
        last_seen: row.created_at,
        severity: row.severity,
        sample_title: row.title,
      });
      continue;
    }
    existing.count += 1;
    if (row.created_at < existing.first_seen) existing.first_seen = row.created_at;
    if (row.created_at > existing.last_seen) {
      existing.last_seen = row.created_at;
    }
    const rank = SEVERITY_RANK[row.severity] ?? 0;
    const existingRank = SEVERITY_RANK[existing.severity] ?? 0;
    if (rank > existingRank) {
      existing.severity = row.severity;
      existing.sample_title = row.title;
    }
  }
  return Array.from(byFp.values());
}

// ---------------------------------------------------------------------------
// Classification (new | recurring | resolved-recur)
// ---------------------------------------------------------------------------

/**
 * Pure. `priorIndex` is `Map<fingerprint, 'open' | 'resolved'> | null`.
 * `null` means "no history was available to check" (memory/incidents/ does
 * not exist yet, or a fingerprint's file couldn't be parsed) — every
 * signal then classifies 'new' AND the caller must say so explicitly
 * (see buildOutput's classification_basis), never silently pretend the
 * history check happened.
 */
export function classifySignal(signal, priorIndex) {
  if (!priorIndex) return 'new';
  const status = priorIndex.get(signal.fingerprint);
  if (!status) return 'new';
  return status === 'resolved' ? 'resolved-recur' : 'recurring';
}

/**
 * Read-only. Scans memory/incidents/<feature>/INC-*.md front matter for a
 * `fingerprint:` and `status:` line. Returns `null` (not an empty Map) when
 * memory/incidents/ does not exist yet — Phase 1/2 of this campaign have not
 * necessarily run before this collector does, and "no directory" must not
 * be conflated with "directory exists, zero incidents recorded".
 */
export function loadIncidentIndex(repoRoot = REPO_ROOT) {
  const incidentsDir = join(repoRoot, 'memory', 'incidents');
  if (!existsSync(incidentsDir)) return null;

  const index = new Map();
  let featureDirs;
  try {
    featureDirs = readdirSync(incidentsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const dirent of featureDirs) {
    if (!dirent.isDirectory()) continue;
    const featureDir = join(incidentsDir, dirent.name);
    let files;
    try {
      files = readdirSync(featureDir).filter((f) => /^INC-.*\.md$/.test(f));
    } catch {
      continue;
    }
    for (const file of files) {
      let text;
      try {
        text = readFileSync(join(featureDir, file), 'utf8');
      } catch {
        continue;
      }
      const fpMatch = text.match(/^fingerprint:\s*(.+)$/m);
      const statusMatch = text.match(/^status:\s*(.+)$/m);
      if (!fpMatch) continue;
      const fingerprint = fpMatch[1].trim();
      const rawStatus = (statusMatch?.[1] ?? '').trim().toLowerCase();
      const status = rawStatus === 'resolved' || rawStatus === 'closed' ? 'resolved' : 'open';
      index.set(fingerprint, status);
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Bridge I/O (impure)
// ---------------------------------------------------------------------------

async function fetchBridgeRows(supabase, window) {
  const rows = [];
  let truncated = false;
  for (let page = 0; page < BRIDGE_MAX_PAGES; page++) {
    const from = page * BRIDGE_PAGE_SIZE;
    const to = from + BRIDGE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('admin_events')
      .select('id, fingerprint, feature, severity, created_at, title, source, sport')
      .eq('event_type', 'error')
      .eq('resolved', false)
      .gte('created_at', window.from)
      .lte('created_at', window.to)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < BRIDGE_PAGE_SIZE) break;
    if (page === BRIDGE_MAX_PAGES - 1) truncated = true;
  }
  return { rows, truncated };
}

async function collectBridge(window, repoRoot) {
  // `quiet: true` — dotenv 17 otherwise prints an "injected env" tip to
  // STDOUT (not stderr), which would land inside this script's own JSON
  // output the moment a caller captures it (report.mjs does exactly that).
  loadEnv({ path: join(repoRoot, '.env.local'), quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return {
      status: 'unconfigured',
      note: 'bridge: skipped (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)',
      signals: [],
      raw_count: null,
    };
  }

  let createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch (err) {
    return {
      status: 'error',
      note: `bridge: @supabase/supabase-js unavailable — ${err instanceof Error ? err.message : String(err)}`,
      signals: [],
      raw_count: null,
    };
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { rows, truncated } = await fetchBridgeRows(supabase, window);
    const normalized = rows.map(normalizeBridgeRow);
    const signals = aggregateByFingerprint(normalized, 'bridge');
    return {
      status: 'ok',
      note: truncated
        ? `bridge: truncated at ${BRIDGE_MAX_PAGES * BRIDGE_PAGE_SIZE} rows — window likely holds more`
        : null,
      signals,
      raw_count: rows.length,
      truncated,
    };
  } catch (err) {
    // A thrown query error becomes an HONEST 'error' status, never a
    // swallowed empty array read as "0 incidents today" — see
    // incident-feed.ts's own comment on exactly this failure mode.
    return {
      status: 'error',
      note: `bridge: query failed — ${err instanceof Error ? err.message : String(err)}`,
      signals: [],
      raw_count: null,
    };
  }
}

/**
 * Read-only. Mirrors incident-feed.ts's queryPriorResolutions, but standalone
 * (no 'server-only' Next import) and scoped to only the fingerprints this
 * run actually saw.
 */
async function fetchPriorResolutions(supabase, fingerprints) {
  const latest = new Map();
  if (fingerprints.length === 0) return latest;
  const since = new Date(Date.now() - REGRESSION_LOOKBACK_DAYS * 24 * 3600_000).toISOString();
  const CHUNK_SIZE = 200;
  for (let i = 0; i < fingerprints.length; i += CHUNK_SIZE) {
    const chunk = fingerprints.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('admin_events')
      .select('fingerprint, resolved_at')
      .eq('resolved', true)
      .not('resolved_by', 'is', null)
      .in('fingerprint', chunk)
      .gte('resolved_at', since)
      .order('resolved_at', { ascending: false });
    if (error) continue; // best-effort enrichment; classification still falls back honestly.
    for (const row of data ?? []) {
      if (!row.fingerprint || !row.resolved_at) continue;
      if (!latest.has(row.fingerprint)) latest.set(row.fingerprint, row.resolved_at);
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Sentry I/O (impure, optional)
// ---------------------------------------------------------------------------

function usableSecret(value) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length < 10) return null;
  if (/^(your-|replace-|changeme|todo|example)/i.test(trimmed)) return null;
  return trimmed;
}

/** Pure. One Sentry list-endpoint issue -> a normalized signal. */
export function normalizeSentryIssue(issue) {
  return {
    fingerprint: issue.id, // Sentry's own issue id IS the stable grouping key at this API surface.
    // feature_id is always 'unmapped' for Sentry-origin signals: the LIST
    // endpoint does not return per-issue tags (documented in
    // src/lib/admin/sentry-api.ts's fetchSentryFeatureCounts spike note). A
    // per-feature fan-out could recover this but costs one Sentry call PER
    // registry feature per run — not worth the rate-limit risk for a daily
    // batch job until something downstream actually needs it. Noted as a
    // gap, not guessed around.
    feature_id: 'unmapped',
    source: 'sentry',
    count: issue.count ?? 1,
    first_seen: issue.firstSeen,
    last_seen: issue.lastSeen,
    severity: issue.level === 'fatal' ? 'critical' : issue.level,
    sample_title: issue.title,
    permalink: issue.permalink ?? null,
  };
}

async function collectSentry(window) {
  const token = usableSecret(process.env.SENTRY_READ_TOKEN) ?? usableSecret(process.env.SENTRY_AUTH_TOKEN);
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  if (!token || !org || !project) {
    return { status: 'unconfigured', note: 'sentry: skipped (no token)', signals: [] };
  }

  try {
    const issues = [];
    let cursor = null;
    for (let page = 0; page < SENTRY_MAX_PAGES; page++) {
      const params = new URLSearchParams({
        query: 'is:unresolved',
        limit: '100',
        sort: 'freq',
        statsPeriod: '24h',
        project: '-1',
      });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`https://sentry.io/api/0/organizations/${org}/issues/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        return { status: 'error', note: `sentry: issues fetch failed (${res.status})`, signals: [] };
      }
      const body = await res.json();
      issues.push(...body);
      const link = res.headers.get('link');
      const next = link
        ?.split(',')
        .find((part) => part.includes('rel="next"') && part.includes('results="true"'));
      cursor = next?.match(/cursor="([^"]+)"/)?.[1] ?? null;
      if (!cursor) break;
    }

    const since = Date.parse(window.from);
    const inWindow = issues.filter((i) => Date.parse(i.lastSeen) >= since);
    const signals = inWindow.map(normalizeSentryIssue);
    return {
      status: 'ok',
      note: cursor ? `sentry: truncated at ${SENTRY_MAX_PAGES} pages — org likely has more unresolved issues` : null,
      signals,
      raw_count: issues.length,
      truncated: cursor !== null,
    };
  } catch (err) {
    return { status: 'error', note: `sentry: fetch threw — ${err instanceof Error ? err.message : String(err)}`, signals: [] };
  }
}

// ---------------------------------------------------------------------------
// CI (GitHub Actions on main) — impure, read-only via `gh`
// ---------------------------------------------------------------------------

function collectCi(repoRoot) {
  // Hardcoded rather than gh's `{owner}/{repo}` auto-detection: that
  // substitution requires cwd to be inside a git checkout with an `origin`
  // remote gh recognizes, which is not guaranteed for every context this
  // script might run from (e.g. a detached worktree). Overridable for a
  // fork/rename via GH_REPO_SLUG so this isn't a silent hardcode trap.
  const repoSlug = process.env.GH_REPO_SLUG?.trim() || 'njrini99-code/helmv3';
  try {
    const out = execFileSync(
      'gh',
      [
        'api',
        `repos/${repoSlug}/actions/runs?branch=main&per_page=5`,
        '--jq',
        '[.workflow_runs[] | {name, status, conclusion, head_sha, run_started_at, html_url}]',
      ],
      { cwd: repoRoot, encoding: 'utf8', timeout: 20_000 },
    );
    const runs = JSON.parse(out);
    return { status: 'ok', note: null, runs };
  } catch (err) {
    // `gh` missing, unauthenticated, or the API call failing are all the
    // same honest outcome here: we do not know CI state, and must not
    // report it as green.
    return {
      status: 'error',
      note: `ci: gh api failed — ${err instanceof Error ? err.message : String(err)}`,
      runs: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Production identity — impure, read-only via `vercel inspect` + ledger fallback
// ---------------------------------------------------------------------------

function readOrgIdFromVercelProject(repoRoot) {
  try {
    const raw = readFileSync(join(repoRoot, '.vercel', 'project.json'), 'utf8');
    return JSON.parse(raw).orgId ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort last-recorded-SHA fallback. memory/ledgers/deployments.md is a
 * Phase 3 deliverable and will not exist until that phase lands — a missing
 * file degrades to `null`, never a guessed SHA.
 */
function readLedgerFallback(repoRoot) {
  const path = join(repoRoot, 'memory', 'ledgers', 'deployments.md');
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, 'utf8');
    // Last `sha: <hex>` line in the file — deliberately tolerant of whatever
    // exact table/list shape Phase 3 lands, since this script cannot assume
    // its final format. A parser this loose is a stopgap, not a contract.
    const matches = [...text.matchAll(/\bsha:\s*([0-9a-f]{7,40})\b/gi)];
    return matches.length > 0 ? matches[matches.length - 1][1] : null;
  } catch {
    return null;
  }
}

function resolveProductionIdentity(repoRoot) {
  const domain = process.env.PRODUCTION_DOMAIN?.trim() || 'helmsportslabs.com';
  const orgId = readOrgIdFromVercelProject(repoRoot);
  if (orgId) {
    try {
      const out = execFileSync(
        'vercel',
        ['inspect', domain, '--scope', orgId],
        { cwd: repoRoot, encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      // `vercel inspect` is human-readable text, not JSON. Pull the two
      // fields we need with tolerant regexes rather than depending on exact
      // column layout across CLI versions.
      const shaMatch = out.match(/\bCommit\s+([0-9a-f]{7,40})\b/i) ?? out.match(/\bgit\.sha\s+([0-9a-f]{7,40})\b/i);
      const idMatch = out.match(/\bid\s+(dpl_[A-Za-z0-9]+)/i);
      if (shaMatch) {
        return {
          git_sha: shaMatch[1],
          vercel_deployment_id: idMatch?.[1] ?? null,
          resolved_via: 'vercel-inspect',
          note: null,
        };
      }
    } catch {
      // fall through to ledger
    }
  }

  const ledgerSha = readLedgerFallback(repoRoot);
  if (ledgerSha) {
    return {
      git_sha: ledgerSha,
      vercel_deployment_id: null,
      resolved_via: 'ledger-fallback',
      note: 'vercel inspect unavailable — read from memory/ledgers/deployments.md',
    };
  }

  return {
    git_sha: null,
    vercel_deployment_id: null,
    resolved_via: 'unknown',
    note: 'production SHA unresolvable — no .vercel/project.json orgId, `vercel inspect` failed, and memory/ledgers/deployments.md is absent or unparseable',
  };
}

// ---------------------------------------------------------------------------
// Output assembly (pure)
// ---------------------------------------------------------------------------

/**
 * Pure. Combines everything already-collected into the final normalized
 * document (spec §23's shape). Takes fully-formed inputs so it is testable
 * without any I/O.
 */
export function buildOutput({ window, production, bridge, sentry, ci, incidentIndexPresent }) {
  const allSignals = [...bridge.signals, ...sentry.signals].map((s) => ({
    feature_id: s.feature_id,
    fingerprint: s.fingerprint,
    source: s.source,
    classification: s.classification,
    first_seen: s.first_seen,
    last_seen: s.last_seen,
    count: s.count,
    ...(production.git_sha ? { release_sha: production.git_sha } : {}),
  }));

  return {
    generated_at: new Date().toISOString(),
    window,
    production,
    sources: {
      bridge: { status: bridge.status, note: bridge.note, raw_count: bridge.raw_count ?? null, truncated: bridge.truncated ?? false },
      sentry: { status: sentry.status, note: sentry.note, raw_count: sentry.raw_count ?? null, truncated: sentry.truncated ?? false },
      vercel: { status: production.git_sha ? 'ok' : 'error', note: production.note },
      ci: { status: ci.status, note: ci.note, runs: ci.runs },
    },
    classification_basis: incidentIndexPresent
      ? 'memory/incidents/ present — classified against recorded incident status'
      : 'memory/incidents/ absent — every signal defaults to "new" (no history available)',
    signals: allSignals,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const window = resolveWindow(args);
  const repoRoot = REPO_ROOT;

  const [bridgeRaw, sentry, ci] = await Promise.all([
    collectBridge(window, repoRoot),
    collectSentry(window),
    Promise.resolve(collectCi(repoRoot)),
  ]);

  // Regression enrichment only for Bridge signals with a real fingerprint —
  // best-effort; a failure here degrades classification, not the whole run.
  let priorResolutions = new Map();
  if (bridgeRaw.status === 'ok' && bridgeRaw.signals.length > 0) {
    try {
      loadEnv({ path: join(repoRoot, '.env.local'), quiet: true }); // see collectBridge's comment on `quiet`.
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      priorResolutions = await fetchPriorResolutions(
        supabase,
        bridgeRaw.signals.map((s) => s.fingerprint),
      );
    } catch {
      // Non-fatal — classification falls back to the incident-file index below.
    }
  }

  const incidentIndex = loadIncidentIndex(repoRoot);
  // Merge the DB-derived "was this resolved recently by a human" signal into
  // the incident-file index so a fingerprint with no memory/incidents/ entry
  // yet, but a real prior resolution in admin_events, still classifies
  // resolved-recur rather than a false 'new'.
  const mergedIndex = incidentIndex ? new Map(incidentIndex) : new Map();
  for (const [fingerprint] of priorResolutions) {
    if (!mergedIndex.has(fingerprint)) mergedIndex.set(fingerprint, 'resolved');
  }
  const effectiveIndex = incidentIndex || priorResolutions.size > 0 ? mergedIndex : null;

  const classifiedBridge = bridgeRaw.signals.map((s) => ({ ...s, classification: classifySignal(s, effectiveIndex) }));
  const classifiedSentry = sentry.signals.map((s) => ({ ...s, classification: classifySignal(s, effectiveIndex) }));

  const production = resolveProductionIdentity(repoRoot);

  const output = buildOutput({
    window,
    production,
    bridge: { ...bridgeRaw, signals: classifiedBridge },
    sentry: { ...sentry, signals: classifiedSentry },
    ci,
    incidentIndexPresent: effectiveIndex !== null,
  });

  const json = args.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
  if (args.out) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.out, json + '\n', 'utf8');
    process.stderr.write(`Wrote ${args.out}\n`);
  } else {
    process.stdout.write(json + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`daily-health/collect.mjs failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  });
}
