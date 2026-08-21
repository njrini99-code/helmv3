// scripts/release/lib/release-common.mjs
//
// Shared primitives for the release machinery in scripts/release/*.mjs
// (spec: docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md
// §14-22, 27, 32-33).
//
// EVERY external read here degrades gracefully with an explicit warning
// instead of throwing or silently reporting a confident wrong number — see
// .claude/rules/shipping.md ("never fake green") and spec §42 ("self-healing
// must not hide errors"). A function that cannot determine something says so
// via warn(); it does not guess, and it does not crash the caller over a
// missing file that is expected to be missing on adoption day.
//
// Self-contained on purpose: this module does NOT import from
// scripts/repo-doctor/** even though the shapes overlap on purpose (the
// Status/check() vocabulary, the {ok,value|error} exec-result contract).
// scripts/release is a separate subsystem with its own release cadence;
// duplicating ~30 lines of exec/result plumbing here is cheaper than coupling
// two directories that evolve independently and are owned by different
// review paths (repo:doctor is read-only integrity; this is release gating).
// The one thing this module DOES reuse is scripts/knowledge/lib/registry.mjs,
// because that module is the canonical, single-sourced feature router
// (AGENTS.md "Feature awareness" / spec §5) — re-parsing memory/registry.yml
// a second way here would be exactly the vocabulary fork spec §5 exists to
// prevent.
//
// `yaml` is imported below without a package.json entry. That is not new
// risk: scripts/repo-doctor/cli.mjs and scripts/repo-doctor/checks/{registry,ci}.mjs
// already `import YAML from 'yaml'` the same way — it is a transitive
// dependency (see package-lock.json) already relied on, unshimmed, by
// existing scripts in this repo. Verify with `test -d node_modules/yaml`
// before assuming this needs adding to package.json.

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { loadRegistry, mapFilesToFeatures } from '../../knowledge/lib/registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Result / exec plumbing — never throws, always returns a shape the caller
// can branch on without try/catch at every call site. Mirrors
// scripts/repo-doctor/lib/exec.mjs's contract (see header note on why this
// is a parallel copy, not an import).
// ---------------------------------------------------------------------------

export function run(cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd: opts.cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout ?? 15000,
      maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024,
      env: opts.env ?? process.env,
    });
    return { ok: true, value: out.replace(/\n$/, ''), code: 0 };
  } catch (err) {
    return {
      ok: false,
      error: err?.message ?? String(err),
      code: typeof err?.status === 'number' ? err.status : null,
      stdout: typeof err?.stdout === 'string' ? err.stdout : (err?.stdout?.toString?.() ?? ''),
      stderr: typeof err?.stderr === 'string' ? err.stderr : (err?.stderr?.toString?.() ?? ''),
    };
  }
}

export function git(repoRoot, args, opts = {}) {
  return run('git', args, { ...opts, cwd: repoRoot });
}

export function gh(repoRoot, args, opts = {}) {
  return run('gh', args, { ...opts, cwd: repoRoot, timeout: opts.timeout ?? 20000 });
}

export function vercel(repoRoot, args, opts = {}) {
  return run('vercel', args, { ...opts, cwd: repoRoot, timeout: opts.timeout ?? 30000 });
}

// ---------------------------------------------------------------------------
// Verdict model — same vocabulary as scripts/repo-doctor/result.mjs
// (PASS/WARN/FAIL/BLOCKED) so a human reading both tools isn't learning two
// schemes, but redefined locally rather than imported (see header note).
// UNKNOWN is deliberately omitted here: repo-doctor uses it for "required
// external state could not be retrieved" as a THIRD exit-code bucket
// (external unavailable, no hard fails). The release gate does not need that
// distinction — an unresolvable external dependency during a release
// readiness check (e.g. gh api unreachable) is itself a reason not to
// release, so it is modeled as BLOCKED (a hard failure), not UNKNOWN.
// ---------------------------------------------------------------------------

export const Status = Object.freeze({
  PASS: 'PASS',
  WARN: 'WARN',
  FAIL: 'FAIL',
  BLOCKED: 'BLOCKED',
});

export function check(id, status, title, extra = {}) {
  return { id, status, title, ...extra };
}

/**
 * Release-gate summary. Exit-code convention per the P3 brief: exit code =
 * COUNT of hard failures (FAIL + BLOCKED), not a fixed 0/1/2/3 code like
 * repo-doctor. A release gate wants "how many things are wrong" visible in
 * $? for a human running it locally; the production-release.yml workflow
 * only branches on zero-vs-nonzero anyway.
 */
export function summarizeGate(checks) {
  const hard = checks.filter((c) => c.status === Status.FAIL || c.status === Status.BLOCKED);
  const warnings = checks.filter((c) => c.status === Status.WARN);
  return {
    ok: hard.length === 0,
    hardFailureCount: hard.length,
    warnCount: warnings.length,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Warnings — stderr always; also a GitHub Actions ::warning:: annotation when
// running in Actions, matching the existing convention in
// scripts/check-types-drift.sh, so a degraded-but-not-failed run is visible
// in the workflow UI rather than only in a log nobody opens.
// ---------------------------------------------------------------------------

export function warn(message) {
  process.stderr.write(`⚠ ${message}\n`);
  if (process.env.GITHUB_ACTIONS === 'true') {
    process.stdout.write(`::warning::${String(message).replace(/\n/g, ' ')}\n`);
  }
}

// ---------------------------------------------------------------------------
// Repo root + a tiny shared CLI arg parser (used by all four scripts/release
// entrypoints so `--flag`, `--key value`, and `--key=value` behave
// identically everywhere).
// ---------------------------------------------------------------------------

export function resolveRepoRoot() {
  const r = run('git', ['rev-parse', '--show-toplevel']);
  if (r.ok) return r.value;
  // Fallback: three levels up from scripts/release/lib/release-common.mjs.
  return join(__dirname, '..', '..', '..');
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[a.slice(2)] = next;
        i += 1;
      } else {
        out[a.slice(2)] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Release policy (spec §14, config/release-policy.yml).
// ---------------------------------------------------------------------------

export const DEFAULT_RELEASE_POLICY = Object.freeze({
  version: 1,
  production: Object.freeze({
    routine_max_deploys_per_calendar_week: 2,
    timezone: 'America/New_York',
  }),
  daily_reliability: Object.freeze({
    may_observe: true,
    may_investigate: true,
    may_reproduce: true,
    may_write_tests: true,
    may_prepare_repairs: true,
    may_open_or_update_repair_prs: true,
    may_merge_verified_low_risk_repairs: true,
    may_deploy_production: false,
  }),
  release: Object.freeze({
    human_approval_required: true,
    automatic_production_deploy: false,
    deploy_from_verified_sha_only: true,
    require_release_candidate_report: true,
    require_production_budget_check: true,
  }),
  emergency: Object.freeze({
    automatic_override: false,
    owner_decision_required: true,
  }),
});

/**
 * Loads config/release-policy.yml. If it does not exist yet (this module can
 * land before that file does — release-machinery vs. policy-file are
 * different phases of the same rollout), fall back to the exact defaults
 * from spec §14, loudly. If it exists but fails to parse, ALSO fall back
 * loudly rather than crash every release script over one bad YAML file.
 */
export function loadReleasePolicy(repoRoot) {
  const p = join(repoRoot, 'config/release-policy.yml');
  if (!existsSync(p)) {
    warn(
      'config/release-policy.yml not found — using the spec §14 default policy ' +
      'in-code (2 routine deploys / calendar week, America/New_York). If this ' +
      'is not adoption day, the file should exist.',
    );
    return { policy: DEFAULT_RELEASE_POLICY, source: 'default' };
  }
  try {
    const doc = YAML.parse(readFileSync(p, 'utf-8'));
    return { policy: doc ?? DEFAULT_RELEASE_POLICY, source: p };
  } catch (err) {
    warn(
      `config/release-policy.yml exists but failed to parse (${err?.message ?? err}) — ` +
      'falling back to the default policy. Fix the file; do not trust this ' +
      'fallback for a real release decision.',
    );
    return { policy: DEFAULT_RELEASE_POLICY, source: 'default-after-parse-error' };
  }
}

// ---------------------------------------------------------------------------
// Calendar-week math — ISO week (Monday 00:00:00 through Sunday 23:59:59),
// America/New_York, no external deps.
//
// Commander decision, relayed via P1 (2026-08-21): "calendar week" for the
// release budget means the ISO week — Monday through Sunday, not a
// rolling-7-day or Sun-Sat window. This is also documented in
// config/release-policy.yml's comment block (P1's file — that copy is the
// one to read for the policy-level statement; this comment is the
// implementation-level one and the two should stay in agreement, not be
// edited independently into drift).
//
// Uses the standard "double formatToParts" trick to convert a local
// wall-clock instant (Y-M-D 00:00:00 in an IANA zone) to a UTC Date without
// any timezone library: guess a UTC instant, ask Intl what that instant
// looks like as wall-clock time in the target zone, and correct by the
// difference. One correction pass is exact except within a few ms of a DST
// transition; a second pass is included for that edge case at negligible
// cost (calendar-week Monday-00:00 boundaries essentially never land exactly
// on America/New_York's spring/fall transition instant, but the fix is free).
//
// getCalendarWeekBounds returns an EXCLUSIVE end at the following Monday
// 00:00:00 rather than an inclusive Sunday 23:59:59 — the two are the same
// instant to within a millisecond, and exclusive-end + `>=start && <end` is
// the safer comparison shape (no risk of a sub-second deployment timestamp
// falling in the 1-second gap an inclusive 23:59:59 bound would leave open).
// ---------------------------------------------------------------------------

const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function getZonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  // Some ICU implementations render midnight as "24" under hour12:false;
  // normalize so downstream arithmetic never sees an out-of-range hour.
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? null,
  };
}

function zonedTimeToUtc(year, month, day, hour, minute, second, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const wantAsIfUtc = guess;
  for (let i = 0; i < 2; i += 1) {
    const p = getZonedParts(new Date(guess), timeZone);
    const gotAsIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = gotAsIfUtc - wantAsIfUtc;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

/**
 * Monday 00:00:00 (inclusive) to the following Monday 00:00:00 (exclusive)
 * calendar-week bounds, in `timeZone` (spec §16 default: America/New_York),
 * for the week containing `date`. Returns UTC Date instants, so any
 * deployment timestamp — recorded as ISO 8601 UTC in the ledger — can be
 * bucketed with a plain `>= start && < end` comparison regardless of the
 * caller's own local timezone.
 */
export function getCalendarWeekBounds(date = new Date(), timeZone = 'America/New_York') {
  const local = getZonedParts(date, timeZone);
  const daysSinceMonday = (local.weekday - 1 + 7) % 7; // Mon=0 .. Sun=6

  // Step back to Monday using UTC calendar arithmetic on the LOCAL Y-M-D —
  // safe because this only subtracts whole calendar days, not wall-clock
  // hours, so it can't be perturbed by the target zone's own DST transitions.
  const mondayCalendar = new Date(Date.UTC(local.year, local.month - 1, local.day));
  mondayCalendar.setUTCDate(mondayCalendar.getUTCDate() - daysSinceMonday);

  const start = zonedTimeToUtc(
    mondayCalendar.getUTCFullYear(),
    mondayCalendar.getUTCMonth() + 1,
    mondayCalendar.getUTCDate(),
    0, 0, 0,
    timeZone,
  );

  const endCalendar = new Date(mondayCalendar);
  endCalendar.setUTCDate(endCalendar.getUTCDate() + 7);
  const end = zonedTimeToUtc(
    endCalendar.getUTCFullYear(),
    endCalendar.getUTCMonth() + 1,
    endCalendar.getUTCDate(),
    0, 0, 0,
    timeZone,
  );

  return { start, end, timeZone };
}

export function isWithinWeek(instant, bounds) {
  const t = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  return t >= bounds.start.getTime() && t < bounds.end.getTime();
}

export function formatWeekLabel(bounds) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: bounds.timeZone, month: 'short', day: 'numeric', year: 'numeric' });
  const inclusiveEnd = new Date(bounds.end.getTime() - 1000); // end is exclusive (next Monday 00:00)
  return `${fmt.format(bounds.start)} – ${fmt.format(inclusiveEnd)} (${bounds.timeZone})`;
}

// ---------------------------------------------------------------------------
// Deployment ledger (spec §16, §32 — memory/ledgers/deployments.md).
//
// Format: a markdown table with a fixed header
// `date_utc | sha | short_sha | vercel_deployment_id | type | initiated_by | notes`.
// Parsed positionally by column name (not fixed index), so reordering
// columns in the file doesn't silently misalign data — only renaming or
// removing the header row does, and that fails loudly (see below).
// ---------------------------------------------------------------------------

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

export function parseDeploymentLedger(repoRoot) {
  const relPath = 'memory/ledgers/deployments.md';
  const p = join(repoRoot, relPath);
  if (!existsSync(p)) {
    warn(
      `${relPath} not found — treating production deploy history as empty. ` +
      'This is the expected state exactly once, on adoption day; after that, ' +
      'a missing ledger is a real gap, not a clean slate.',
    );
    return { entries: [], sourceExists: false, path: relPath };
  }

  const text = readFileSync(p, 'utf-8');
  const lines = text.split(/\r?\n/);
  const entries = [];
  let headerIdx = -1;
  let columns = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) continue;
    const cells = splitTableRow(line);

    if (headerIdx === -1) {
      if (cells[0]?.toLowerCase() === 'date_utc') {
        headerIdx = i;
        columns = cells.map((c) => c.toLowerCase());
      }
      continue;
    }
    if (i === headerIdx + 1 && cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    if (cells.length < 2) continue;

    const row = {};
    columns.forEach((col, idx) => { row[col] = cells[idx] ?? ''; });
    if (!row.date_utc || row.date_utc.toLowerCase() === 'date_utc') continue;

    const date = new Date(row.date_utc);
    if (Number.isNaN(date.getTime())) {
      warn(`${relPath}: row ${i + 1} has an unparseable date_utc "${row.date_utc}" — skipped, not counted toward the budget.`);
      continue;
    }
    entries.push({ ...row, date });
  }

  if (headerIdx === -1) {
    warn(`${relPath} exists but no recognizable table header (date_utc | sha | ...) was found — treating as empty.`);
  }

  return { entries, sourceExists: true, path: relPath };
}

function hasUnknownSha(entry) {
  const sha = (entry.sha ?? '').trim().toLowerCase();
  return sha === '' || sha === 'unknown';
}

/**
 * A deploy is a deploy: an entry with `sha: unknown` (provenance not
 * captured at promote time — see the ledger's own backfill rows) still
 * COUNTS toward the weekly cap. Losing track of which commit shipped is a
 * real gap worth a loud warning, but it is not grounds to undercount actual
 * production deploys — that would make the budget gate easier to bypass by
 * simply not recording a SHA, which is the opposite of what spec §16 wants.
 */
export function summarizeBudget({ entries, policy, now = new Date() }) {
  const timeZone = policy?.production?.timezone ?? DEFAULT_RELEASE_POLICY.production.timezone;
  const max = policy?.production?.routine_max_deploys_per_calendar_week
    ?? DEFAULT_RELEASE_POLICY.production.routine_max_deploys_per_calendar_week;
  const bounds = getCalendarWeekBounds(now, timeZone);
  const deploysThisWeekEntries = entries.filter((e) => isWithinWeek(e.date, bounds));
  const deploysThisWeek = deploysThisWeekEntries.length;
  const routineSlotsRemaining = Math.max(0, max - deploysThisWeek);

  const unknownShaEntries = deploysThisWeekEntries.filter(hasUnknownSha);
  if (unknownShaEntries.length > 0) {
    warn(
      `${unknownShaEntries.length} of ${deploysThisWeek} deploy(s) counted this week have sha: unknown ` +
      `(deployment id${unknownShaEntries.length > 1 ? 's' : ''}: ${unknownShaEntries.map((e) => e.vercel_deployment_id || '?').join(', ')}) — ` +
      'counted toward the budget regardless (a deploy is a deploy); this is a provenance gap to fix in the ledger, not a reason to undercount.',
    );
  }

  return {
    weekLabel: formatWeekLabel(bounds),
    weekStart: bounds.start.toISOString(),
    weekEnd: bounds.end.toISOString(),
    timezone: timeZone,
    max,
    deploysThisWeek,
    routineSlotsRemaining,
    atOrOverCap: deploysThisWeek >= max,
    deploysThisWeekEntries,
    unknownShaCount: unknownShaEntries.length,
  };
}

export function formatLedgerRow({ dateUtc, sha, shortSha, vercelDeploymentId, type, initiatedBy, notes }) {
  const cell = (v) => {
    const s = String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
    return s || '—';
  };
  return `| ${cell(dateUtc)} | ${cell(sha)} | ${cell(shortSha)} | ${cell(vercelDeploymentId)} | ${cell(type)} | ${cell(initiatedBy)} | ${cell(notes)} |`;
}

/**
 * Pure function: returns the ledger file's new full text with `entry`
 * appended as a row. Does NOT write the file or touch git — callers (the
 * production-release.yml deploy job, or a test) do that, which keeps this
 * testable without a filesystem fixture for every case.
 */
export function appendLedgerEntry(repoRoot, entry) {
  const p = join(repoRoot, 'memory/ledgers/deployments.md');
  if (!existsSync(p)) {
    throw new Error('memory/ledgers/deployments.md does not exist — cannot append. Create it first (a seed file ships alongside this module).');
  }
  const text = readFileSync(p, 'utf-8');
  const row = formatLedgerRow(entry);
  return text.endsWith('\n') ? `${text}${row}\n` : `${text}\n${row}\n`;
}

// ---------------------------------------------------------------------------
// Production state resolution (spec §16, §32) — Vercel where readable,
// ledger as the fallback source of truth. Never fabricates a SHA/deployment
// id it did not actually read from one of those two places.
// ---------------------------------------------------------------------------

export function resolveVercelScope(repoRoot) {
  if (process.env.VERCEL_ORG_ID) return { scope: process.env.VERCEL_ORG_ID, source: 'env:VERCEL_ORG_ID' };
  const linkPath = join(repoRoot, '.vercel/project.json');
  if (existsSync(linkPath)) {
    try {
      const { orgId } = JSON.parse(readFileSync(linkPath, 'utf-8'));
      if (orgId) return { scope: orgId, source: '.vercel/project.json' };
    } catch {
      // fall through — an unreadable link file is not fatal, just unscoped
    }
  }
  return { scope: null, source: null };
}

function parseVercelInspect(output) {
  // `vercel inspect` prints human-readable "key  value" lines, not JSON —
  // scripts/deploy-prod.sh already treats this command as human-readable-only
  // for the same reason (its own post-deploy instructions tell a human to
  // eyeball it). Parse defensively; a miss here degrades to the ledger, it
  // never fabricates an id.
  const idMatch = output.match(/\bid\s+(dpl_[A-Za-z0-9]+)/i) ?? output.match(/(dpl_[A-Za-z0-9]{10,})/);
  const shaMatch = output.match(/\b([0-9a-f]{40})\b/i);
  return {
    deploymentId: idMatch ? idMatch[1] : null,
    sha: shaMatch ? shaMatch[1] : null,
  };
}

/**
 * Resolves "what SHA/deployment is production actually running right now."
 * Tries `vercel inspect <domain>` first (live truth); falls back to the most
 * recent deployment-ledger row on any failure (CLI missing, unauthenticated,
 * network unavailable, unparseable output) — always with an explicit warning
 * distinguishing "expected on a dev machine" from "unexpected in CI." Never
 * returns a source of 'unknown' silently; the caller can always see which
 * of {vercel, ledger, unknown} was used.
 */
export function resolveProductionState({ repoRoot, domain = 'helmsportslabs.com', useVercel = true, ledger }) {
  const ledgerData = ledger ?? parseDeploymentLedger(repoRoot);
  const ledgerLatest = [...ledgerData.entries].sort((a, b) => b.date - a.date)[0] ?? null;

  if (useVercel) {
    const { scope } = resolveVercelScope(repoRoot);
    const args = ['inspect', domain];
    if (scope) args.push('--scope', scope);
    if (process.env.VERCEL_TOKEN) args.push('--token', process.env.VERCEL_TOKEN);
    const r = vercel(repoRoot, args);
    if (r.ok) {
      const parsed = parseVercelInspect(r.value);
      if (parsed.deploymentId || parsed.sha) {
        return {
          source: 'vercel',
          sha: parsed.sha ?? (ledgerLatest?.sha !== 'unknown' ? ledgerLatest?.sha : null) ?? null,
          deploymentId: parsed.deploymentId ?? ledgerLatest?.vercel_deployment_id ?? null,
          raw: r.value,
        };
      }
      warn(`vercel inspect ${domain} returned output but no recognizable deployment id/sha — falling back to the ledger.`);
    } else {
      warn(
        `vercel inspect ${domain} unavailable (${(r.error ?? '').split('\n')[0] || 'unknown error'}) — falling back ` +
        'to the deployment ledger as the production-state source of truth. Expected on a machine without the Vercel ' +
        'CLI authenticated; NOT expected inside the release-readiness gate, where it is a real degradation worth investigating.',
      );
    }
  }

  if (ledgerLatest) {
    return {
      source: 'ledger',
      sha: ledgerLatest.sha && ledgerLatest.sha !== 'unknown' ? ledgerLatest.sha : null,
      deploymentId: ledgerLatest.vercel_deployment_id && ledgerLatest.vercel_deployment_id !== 'unknown'
        ? ledgerLatest.vercel_deployment_id
        : null,
      raw: null,
    };
  }

  warn('Production state is unresolvable: Vercel CLI unavailable/unauthenticated AND the deployment ledger has no usable entries. Deploy identity cannot be established.');
  return { source: 'unknown', sha: null, deploymentId: null, raw: null };
}

// ---------------------------------------------------------------------------
// Git helpers (spec §21, §32 — release SHA is the causal join key).
// ---------------------------------------------------------------------------

export function resolveMainSha(repoRoot) {
  // Prefer the remote-tracking ref (accurate after a fetch); fall back to
  // the local branch tip, then HEAD. The caller always gets {sha, ref} so it
  // can see which was actually used rather than silently trusting HEAD of
  // some other checked-out branch.
  const remote = git(repoRoot, ['rev-parse', 'refs/remotes/origin/main']);
  if (remote.ok) return { sha: remote.value, ref: 'origin/main' };
  const local = git(repoRoot, ['rev-parse', 'refs/heads/main']);
  if (local.ok) return { sha: local.value, ref: 'main' };
  const head = git(repoRoot, ['rev-parse', 'HEAD']);
  if (head.ok) return { sha: head.value, ref: 'HEAD', warning: 'neither origin/main nor local main resolved; used HEAD' };
  return { sha: null, ref: null };
}

export function resolveSha(repoRoot, ref) {
  const r = git(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
  return r.ok ? r.value : null;
}

export function isAncestor(repoRoot, ancestorSha, descendantRefOrSha) {
  const r = git(repoRoot, ['merge-base', '--is-ancestor', ancestorSha, descendantRefOrSha]);
  return r.ok; // exit 0 = true; exit 1 (not an ancestor) or any error = false here
}

export function extractPrNumber(subject) {
  const m = subject?.match(/\(#(\d+)\)\s*$/);
  return m ? Number(m[1]) : null;
}

const FIELD_SEP = '\x1f'; // ASCII unit separator — won't collide with commit subjects

export function commitsBetween(repoRoot, fromSha, toSha) {
  const r = git(repoRoot, ['log', `--format=%H${FIELD_SEP}%h${FIELD_SEP}%an${FIELD_SEP}%aI${FIELD_SEP}%s`, `${fromSha}..${toSha}`]);
  if (!r.ok || !r.value) return [];
  return r.value.split('\n').filter(Boolean).map((line) => {
    const [hash, short, author, date, subject] = line.split(FIELD_SEP);
    return { hash, short, author, date, subject, prNumber: extractPrNumber(subject) };
  });
}

export function changedFilesBetween(repoRoot, fromSha, toSha) {
  const r = git(repoRoot, ['diff', '--name-only', `${fromSha}..${toSha}`]);
  if (!r.ok || !r.value) return [];
  return r.value.split('\n').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Feature mapping — reuses scripts/knowledge/lib/registry.mjs, the canonical
// feature router (AGENTS.md).
//
// mapFilesToFeatures silently matches NOTHING against an absolute path — the
// single highest-value catch in the P0 hooks audit (os-audit-hooks.md §A5),
// reproduced live there: an absolute file_path from a tool call matches zero
// features while the identical repo-relative path matches correctly, with no
// error either way. `git diff --name-only` already returns repo-relative
// paths, so stripping is defensive rather than load-bearing HERE — but every
// caller of registry.mjs in this codebase strips the prefix on principle, so
// a copy-pasted future caller (e.g. a P2 hook wiring against an absolute
// tool_input.file_path) inherits the safe habit instead of the bug.
// ---------------------------------------------------------------------------

export function toRepoRelative(repoRoot, filePath) {
  if (!filePath) return filePath;
  let p = filePath;
  if (p.startsWith(repoRoot)) p = p.slice(repoRoot.length);
  return p.replace(/^[/\\]+/, '');
}

export async function mapChangedFilesToFeatures(repoRoot, files) {
  let registry;
  try {
    registry = await loadRegistry(repoRoot);
  } catch (err) {
    // loadRegistry() itself has no fallback (a bare readFile) — every OTHER
    // reader in this module degrades to an empty/default result with a
    // warning rather than crashing the caller, and feature mapping should be
    // no exception: a release report that can't compute "features affected"
    // should say so, not take down the whole release:prepare run over a
    // missing/corrupt memory/registry.yml.
    warn(`memory/registry.yml could not be loaded (${err?.message ?? err}) — feature mapping degrades to empty for this run.`);
    return [];
  }
  const relFiles = files.map((f) => toRepoRelative(repoRoot, f));
  return mapFilesToFeatures(registry, relFiles);
}

// ---------------------------------------------------------------------------
// GitHub — owner/repo resolution + required-checks verification.
// ---------------------------------------------------------------------------

export function resolveGhRepo(repoRoot) {
  const viaGh = gh(repoRoot, ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  if (viaGh.ok && viaGh.value) return { repo: viaGh.value, source: 'gh' };
  const remote = git(repoRoot, ['remote', 'get-url', 'origin']);
  if (remote.ok) {
    const m = remote.value.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (m) return { repo: m[1], source: 'git-remote' };
  }
  warn('Could not resolve GitHub owner/repo from `gh repo view` or `git remote get-url origin` — gh api calls that need it will be skipped.');
  return { repo: null, source: null };
}

// Keep in sync with .github/branch-protection.md's live-verified
// required_status_checks.contexts. A required context is matched by NAME
// against what GitHub actually posts — see that doc's CodeQL-phantom
// incident before ever trusting a name because it "should" exist.
export const REQUIRED_CHECK_NAMES = Object.freeze([
  'Smoke checks',
  'CI aggregate',
  'Review Gate aggregate',
  'Analyze (actions)',
  'Analyze (javascript-typescript)',
  'Analyze (python)',
]);

// Documented exception (P3 brief): this check is advisory noise on release
// candidate SHAs and must not block the gate even if red/pending.
export const ADVISORY_CHECK_EXCLUDE_NAMES = Object.freeze(['Supabase Preview']);

export function getCheckRuns(repoRoot, sha, repo) {
  const r = gh(repoRoot, [
    'api', `repos/${repo}/commits/${sha}/check-runs`, '--paginate',
    '-q', '.check_runs[] | {name, status, conclusion}',
  ]);
  if (!r.ok || !r.value) {
    return { ok: false, runs: [], error: r.error };
  }
  const runs = r.value
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
  return { ok: true, runs };
}

/**
 * Given a flat list of {name, status, conclusion} check-runs for one SHA,
 * decide whether every REQUIRED_CHECK_NAMES entry is present and green, and
 * separately surface any OTHER (non-required, non-advisory-excluded) red
 * check as a WARN-worthy signal without failing the gate over it.
 */
export function evaluateRequiredChecks(runs) {
  const byName = new Map();
  for (const r of runs) byName.set(r.name, r); // later entries win on a re-run

  const missing = [];
  const notGreen = [];
  for (const name of REQUIRED_CHECK_NAMES) {
    const r = byName.get(name);
    if (!r) { missing.push(name); continue; }
    if (r.status !== 'completed' || r.conclusion !== 'success') {
      notGreen.push({ name, status: r.status, conclusion: r.conclusion });
    }
  }

  const otherRed = [...byName.values()].filter((r) =>
    !REQUIRED_CHECK_NAMES.includes(r.name) &&
    !ADVISORY_CHECK_EXCLUDE_NAMES.includes(r.name) &&
    r.status === 'completed' &&
    r.conclusion &&
    !['success', 'neutral', 'skipped'].includes(r.conclusion),
  );

  return { missing, notGreen, otherRed, allRequiredGreen: missing.length === 0 && notGreen.length === 0 };
}

// ---------------------------------------------------------------------------
// Release queue (spec §17 — memory/operations/release-queue.yml).
// ---------------------------------------------------------------------------

export const RELEASE_QUEUE_STATUSES = Object.freeze([
  'observed', 'triaging', 'reproduced', 'repairing', 'verification_failed',
  'verified', 'queued_for_release', 'released', 'verified_in_production',
  'blocked', 'wont_fix', 'expected', 'duplicate',
]);

export function loadReleaseQueue(repoRoot) {
  const relPath = 'memory/operations/release-queue.yml';
  const p = join(repoRoot, relPath);
  if (!existsSync(p)) {
    warn(`${relPath} not found — treating the release queue as empty.`);
    return { items: [], sourceExists: false, path: relPath };
  }
  try {
    const doc = YAML.parse(readFileSync(p, 'utf-8'));
    const items = Array.isArray(doc?.items) ? doc.items : [];
    return { items, sourceExists: true, path: relPath };
  } catch (err) {
    warn(`${relPath} exists but failed to parse (${err?.message ?? err}) — treating the queue as empty. Fix the file.`);
    return { items: [], sourceExists: true, parseError: String(err), path: relPath };
  }
}

// ---------------------------------------------------------------------------
// Risk tiering (spec §28) — heuristic-only, path-based. This cannot know
// intent, only surface area; it exists so a release report highlights R3
// items instead of burying them in an undifferentiated commit list. The
// human reading the report makes the real call.
// ---------------------------------------------------------------------------

export const RISK_TIERS = Object.freeze(['R0', 'R1', 'R2', 'R3']);

export function classifyFileRisk(path) {
  const p = path.toLowerCase();
  if (
    p.startsWith('supabase/migrations/') ||
    /\brls\b/.test(p) ||
    p.includes('/actions/auth') ||
    p.includes('signup-gate') ||
    p.includes('stripe') ||
    p.includes('billing') ||
    p.includes('.env') ||
    p.startsWith('secrets/')
  ) {
    return 'R3';
  }
  if (
    p.startsWith('memory/') ||
    p.startsWith('docs/') ||
    p.startsWith('.claude/') ||
    p.endsWith('.md') ||
    p.startsWith('scripts/knowledge/')
  ) {
    return 'R0';
  }
  if (p.startsWith('scripts/') || p.includes('.test.') || p.includes('__tests__')) {
    return 'R1';
  }
  return 'R2'; // default: product code under src/** is treated as behavior-affecting
}

export function maxRiskTier(tiers) {
  if (!tiers.length) return 'R0';
  return tiers.reduce((max, t) => (RISK_TIERS.indexOf(t) > RISK_TIERS.indexOf(max) ? t : max), 'R0');
}
