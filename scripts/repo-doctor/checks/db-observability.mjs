// Database observability control-plane checks — brief §62 and Track C's own
// scope (docs/ai-system/briefs/SUPABASE_ZERO_COST_OBSERVABILITY_BRIEF_2026-09-03.md).
//
// STATUS MAPPING, READ THIS BEFORE ADDING A KEY
// ------------------------------------------------
// `summarize()` (../result.mjs) exits 1 on any FAIL/DRIFT/STALE and exits 3
// on UNKNOWN with no hard failure. A handful of these keys can only be
// verified LIVE (they need `SUPABASE_ACCESS_TOKEN`, an owner secret this
// worktree does not carry — `.env.local` is deliberately withheld from
// worktrees, see AGENTS.md). If a missing OPTIONAL credential mapped to
// UNKNOWN, `npm run repo:doctor` would exit 3 for every contributor and every
// CI run forever, which is a worse regression than the thing this module
// exists to check. So:
//
//   - A credential-gated check with NO credential -> Status.LOCAL_ONLY, not
//     UNKNOWN. LOCAL_ONLY does not affect the exit code (see result.mjs's
//     `HARD` set and its explicit UNKNOWN branch) — it is informational,
//     "only verifiable with an owner secret", and this module is this
//     status's first consumer in the codebase.
//   - `METRICS_API_CONFIGURED_OR_INTENTIONALLY_DISABLED` is PASS whenever the
//     integration exists and correctly degrades to `unconfigured` without a
//     credential — the key's own name says "intentionally disabled" is a
//     PASSING state, not a missing one. Track C is a $0-recurring-cost
//     program; a Bridge surface that refuses to page anyone until an owner
//     provisions a metrics credential is the intended shape, not a defect.
//   - `PGAUDIT_OFF` is PASS when a live read confirms pgaudit is NOT
//     installed (this project's 2026-09-03 measured state — see
//     docs/observability/SUPABASE_OBSERVABILITY_MEASURED_TRUTH.md §1) or
//     confirms it is installed but inactive (`pgaudit.log = 'none'`). It is a
//     genuine FAIL only when a live read shows it actively logging — "ON is
//     a finding" per the brief. Without a credential it is LOCAL_ONLY: this
//     module never claims pgaudit is off from a stale doc snapshot.
//
// Every "*_PRESENT" key below is a REPO check (does the file/migration exist
// in this checkout), not a PRODUCTION-APPLIED check — identical to how
// Phase 1's own Bridge readers describe HELD migrations as "present, not yet
// applied" rather than absent. Whether a migration has actually reached
// production is a separate question `supabase/migrations/HELD.md` and the
// Bridge's own `notApplied` flags already answer; duplicating that here
// would be a second, driftable copy of the same fact.

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { check, Status } from '../result.mjs';

export const meta = { id: 'db-observability', title: 'Database observability control plane' };

/**
 * Whether `docs/observability/SUPABASE_TRACE_PROPAGATION.md` records its
 * live-proof marker as VERIFIED. Exported (not inlined into `run`) so this
 * exact regression is unit-testable without filesystem scaffolding — see
 * `scripts/repo-doctor/__tests__/db-observability.test.ts`. ANCHORED TO
 * LINE-START, DELIBERATELY: an earlier, unanchored version of this regex
 * matched the doc's OWN prose instructing the owner how to update the
 * marker (a sentence discussing `live-proof: VERIFIED` as an example),
 * producing a false "VERIFIED" the very first time this check ran against
 * that doc. Requiring the match to be the bold marker line itself, at the
 * start of a line, closes that: discussing the marker can never flip the
 * result, only setting it can.
 */
export function detectLiveProofVerified(proofDocText) {
  return /^\*\*live-proof:\s*VERIFIED\*\*/im.test(proofDocText);
}

function fileExists(repoRoot, relPath) {
  return existsSync(join(repoRoot, relPath));
}

function readIfExists(repoRoot, relPath) {
  const p = join(repoRoot, relPath);
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, 'utf-8');
  } catch {
    return null;
  }
}

function presenceCheck(id, title, repoRoot, requiredPaths) {
  const missing = requiredPaths.filter((p) => !fileExists(repoRoot, p));
  return missing.length === 0
    ? check(id, Status.PASS, `${title}: present`)
    : check(id, Status.FAIL, `${title}: missing`, { expected: requiredPaths, actual: { missing } });
}

/** Best-effort dotenv load for `.env.local` — mirrors
 *  `scripts/db/check-supabase-drift.mjs`'s own pattern. A no-op (not an
 *  error) when the file is absent, which is the normal state for every
 *  worktree per `.worktreeinclude`. */
async function tryLoadEnvLocal(repoRoot) {
  try {
    const { config } = await import('dotenv');
    config({ path: join(repoRoot, '.env.local'), quiet: true });
  } catch {
    // dotenv unavailable or nothing to load — env stays whatever the process already has.
  }
}

function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

/** Same read-only Management API path `src/lib/admin/incidents/release-context.ts`
 *  already uses in production TypeScript — duplicated here in plain JS
 *  because this file runs under plain `node`, not through the Next.js/tsx
 *  toolchain, so it cannot import a `.ts` module directly. SELECT-only,
 *  never a write, per `.claude/rules/shipping.md` §4. */
async function managementApiQuery(token, projectRef, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Management API query failed: HTTP ${res.status}`);
  return res.json();
}

export async function run(ctx) {
  const { repoRoot } = ctx;
  const out = [];

  // ---------------------------------------------------------------------
  // Static presence checks — repo state, not production-applied state.
  // ---------------------------------------------------------------------

  out.push(
    presenceCheck('db-observability.DB_ERROR_STORE_PRESENT', 'DB_ERROR_STORE_PRESENT', repoRoot, [
      'supabase/migrations/20260903180000_helm_debug_db_error_events.sql',
      'src/lib/observability/supabase/record-db-error.ts',
      'src/lib/admin/database/errors.ts',
    ]),
  );

  out.push(
    presenceCheck('db-observability.DB_HEALTH_SAMPLER_PRESENT', 'DB_HEALTH_SAMPLER_PRESENT', repoRoot, [
      'supabase/migrations/20260903180100_helm_debug_db_health_samples.sql',
      'src/app/api/cron/db-health-sampler/route.ts',
      'src/lib/observability/supabase/db-health-delta.ts',
    ]),
  );

  out.push(
    presenceCheck('db-observability.DB_STATEMENT_SAMPLER_PRESENT', 'DB_STATEMENT_SAMPLER_PRESENT', repoRoot, [
      'supabase/migrations/20260903180200_helm_debug_db_stat_deltas.sql',
      'src/app/api/cron/db-stat-delta/route.ts',
      'src/lib/observability/supabase/query-regression.ts',
    ]),
  );

  {
    const tracingBody = readIfExists(repoRoot, 'src/lib/observability/supabase-tracing.ts');
    const instrumentation = readIfExists(repoRoot, 'src/instrumentation.ts') ?? '';
    const instrumentationClient = readIfExists(repoRoot, 'src/instrumentation-client.ts') ?? '';
    const imported =
      instrumentation.includes('@supabase/supabase-js/tracing') && instrumentationClient.includes('@supabase/supabase-js/tracing');
    out.push(
      tracingBody && imported
        ? check('db-observability.SENTRY_SUPABASE_TRACING_PRESENT', Status.PASS, 'SENTRY_SUPABASE_TRACING_PRESENT: present and imported by both instrumentation entry points')
        : check('db-observability.SENTRY_SUPABASE_TRACING_PRESENT', Status.FAIL, 'SENTRY_SUPABASE_TRACING_PRESENT: missing or not imported', {
            actual: { tracingFileExists: Boolean(tracingBody), importedByBothEntryPoints: imported },
          }),
    );
  }

  out.push(
    presenceCheck('db-observability.FLIGHT_RECORDER_DB_LAYER_PRESENT', 'FLIGHT_RECORDER_DB_LAYER_PRESENT', repoRoot, [
      'supabase/migrations/20260825200811_helm_flight_recorder.sql',
      'supabase/migrations/20260902160000_postgres_checkpoints_reach_trace_steps.sql',
    ]),
  );

  out.push(
    presenceCheck('db-observability.OBSERVABILITY_RETENTION_PRESENT', 'OBSERVABILITY_RETENTION_PRESENT', repoRoot, [
      'supabase/migrations/20260903180300_helm_debug_observability_retention.sql',
    ]),
  );

  // Explicit, named gap (not a silent omission — shipping.md §1's own rule):
  // db_platform_samples (this phase's new table, migration
  // 20260903191400) has NO prune function wired. Editing the shared
  // retention migration above would be a cross-track edit into a file this
  // track does not own; see docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md.
  if (fileExists(repoRoot, 'supabase/migrations/20260903191400_helm_debug_db_platform_samples.sql')) {
    out.push(
      check(
        'db-observability.platform-samples-retention-gap',
        Status.WARN,
        'db_platform_samples has no retention/prune function wired yet — a named, documented gap, not an oversight',
        { source: 'docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md' },
      ),
    );
  }

  {
    const recordDbErrorTest = readIfExists(repoRoot, 'src/lib/observability/supabase/__tests__/record-db-error.test.ts') ?? '';
    const failOpenPattern = /fail[- ]?open|never throws|timed-out|migration-not-applied/i;
    out.push(
      failOpenPattern.test(recordDbErrorTest)
        ? check('db-observability.OBSERVABILITY_FAIL_OPEN_TEST_PRESENT', Status.PASS, 'OBSERVABILITY_FAIL_OPEN_TEST_PRESENT: fail-open behavior is under test')
        : check('db-observability.OBSERVABILITY_FAIL_OPEN_TEST_PRESENT', Status.FAIL, 'OBSERVABILITY_FAIL_OPEN_TEST_PRESENT: no fail-open assertions found', {
            expected: 'src/lib/observability/supabase/__tests__/record-db-error.test.ts to assert fail-open/never-throws/timed-out/migration-not-applied behavior',
          }),
    );
  }

  out.push(
    presenceCheck('db-observability.DB_ERROR_CLASSIFIER_PRESENT', 'DB_ERROR_CLASSIFIER_PRESENT', repoRoot, [
      'src/lib/observability/supabase/classify.ts',
    ]),
  );

  out.push(
    presenceCheck('db-observability.INVARIANT_REGISTRY_PRESENT', 'INVARIANT_REGISTRY_PRESENT', repoRoot, [
      'src/lib/observability/supabase/integrity.ts',
    ]),
  );

  {
    const metricsApiExists = fileExists(repoRoot, 'src/lib/observability/supabase/metrics-api.ts');
    const platformReaderExists = fileExists(repoRoot, 'src/lib/admin/database/platform.ts');
    const metricsBody = readIfExists(repoRoot, 'src/lib/observability/supabase/metrics-api.ts') ?? '';
    const degradesCleanly = /unconfigured/.test(metricsBody);
    out.push(
      metricsApiExists && platformReaderExists && degradesCleanly
        ? check(
            'db-observability.METRICS_API_CONFIGURED_OR_INTENTIONALLY_DISABLED',
            Status.PASS,
            'METRICS_API_CONFIGURED_OR_INTENTIONALLY_DISABLED: integration present and degrades cleanly without a credential (intentional-disable is a passing state)',
          )
        : check(
            'db-observability.METRICS_API_CONFIGURED_OR_INTENTIONALLY_DISABLED',
            Status.FAIL,
            'METRICS_API_CONFIGURED_OR_INTENTIONALLY_DISABLED: integration missing or does not degrade cleanly',
            { actual: { metricsApiExists, platformReaderExists, degradesCleanly } },
          ),
    );
  }

  {
    const certScriptPath = join(repoRoot, 'scripts/db-observability-trace-cert.mjs');
    const proofDoc = readIfExists(repoRoot, 'docs/observability/SUPABASE_TRACE_PROPAGATION.md') ?? '';
    if (!existsSync(certScriptPath)) {
      out.push(check('db-observability.TRACEPARENT_CERTIFIED', Status.FAIL, 'TRACEPARENT_CERTIFIED: scripts/db-observability-trace-cert.mjs is missing'));
    } else {
      try {
        const stdout = execFileSync('node', [certScriptPath, '--json'], { cwd: repoRoot, encoding: 'utf-8', timeout: 15_000 });
        const parsed = JSON.parse(stdout);
        out.push(
          parsed.ok
            ? check('db-observability.TRACEPARENT_CERTIFIED', Status.PASS, 'TRACEPARENT_CERTIFIED: static W3C trace-propagation checks pass', { evidence: parsed.items })
            : check('db-observability.TRACEPARENT_CERTIFIED', Status.FAIL, 'TRACEPARENT_CERTIFIED: one or more static trace-propagation checks failed', { evidence: parsed.items }),
        );
      } catch (err) {
        out.push(
          check('db-observability.TRACEPARENT_CERTIFIED', Status.BLOCKED, 'TRACEPARENT_CERTIFIED: trace-cert script crashed', {
            detail: err?.stdout?.toString?.() ?? String(err),
          }),
        );
      }
    }
    // The end-to-end LIVE proof (a real Sentry trace id matched to a Supabase
    // request log line) is deliberately manual and on-demand — brief §14, §32:
    // "no continuous ingestion". This is always LOCAL_ONLY, never PASS/FAIL —
    // there is no automated state for a check that must never run itself.
    const liveProofDone = detectLiveProofVerified(proofDoc);
    out.push(
      check(
        'db-observability.traceparent-live-proof',
        Status.LOCAL_ONLY,
        liveProofDone
          ? 'W3C live proof recorded as VERIFIED in SUPABASE_TRACE_PROPAGATION.md'
          : 'W3C live proof is NOT VERIFIED — run the manual procedure in docs/observability/SUPABASE_TRACE_PROPAGATION.md when a preview deploy is available',
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Live-only checks — need SUPABASE_ACCESS_TOKEN. LOCAL_ONLY without it.
  // ---------------------------------------------------------------------

  await tryLoadEnvLocal(repoRoot);
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = resolveProjectRef();

  const liveKeys = [
    { id: 'PG_STAT_STATEMENTS_AVAILABLE', title: 'PG_STAT_STATEMENTS_AVAILABLE' },
    { id: 'PG_CRON_AVAILABLE', title: 'PG_CRON_AVAILABLE' },
    { id: 'PGAUDIT_OFF', title: 'PGAUDIT_OFF' },
  ];

  if (!token || !projectRef) {
    for (const k of liveKeys) {
      out.push(
        check(
          `db-observability.${k.id}`,
          Status.LOCAL_ONLY,
          `${k.title}: not configured — set SUPABASE_ACCESS_TOKEN (and SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL) to verify live`,
        ),
      );
    }
  } else {
    try {
      const rows = await managementApiQuery(
        token,
        projectRef,
        "select extname, extversion from pg_extension where extname in ('pg_stat_statements','pg_cron','pgaudit')",
      );
      const byName = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.extname, r.extversion]));

      out.push(
        byName.has('pg_stat_statements')
          ? check('db-observability.PG_STAT_STATEMENTS_AVAILABLE', Status.PASS, `PG_STAT_STATEMENTS_AVAILABLE: installed (${byName.get('pg_stat_statements')})`)
          : check('db-observability.PG_STAT_STATEMENTS_AVAILABLE', Status.FAIL, 'PG_STAT_STATEMENTS_AVAILABLE: extension not installed'),
      );
      out.push(
        byName.has('pg_cron')
          ? check('db-observability.PG_CRON_AVAILABLE', Status.PASS, `PG_CRON_AVAILABLE: installed (${byName.get('pg_cron')})`)
          : check('db-observability.PG_CRON_AVAILABLE', Status.FAIL, 'PG_CRON_AVAILABLE: extension not installed'),
      );

      if (!byName.has('pgaudit')) {
        out.push(check('db-observability.PGAUDIT_OFF', Status.PASS, 'PGAUDIT_OFF: pgaudit is not installed'));
      } else {
        const settingRows = await managementApiQuery(token, projectRef, "select setting from pg_settings where name = 'pgaudit.log'");
        const setting = Array.isArray(settingRows) && settingRows[0] ? settingRows[0].setting : null;
        out.push(
          !setting || setting === 'none'
            ? check('db-observability.PGAUDIT_OFF', Status.PASS, `PGAUDIT_OFF: installed but inactive (pgaudit.log = ${JSON.stringify(setting)})`)
            : check('db-observability.PGAUDIT_OFF', Status.FAIL, `PGAUDIT_OFF: actively logging (pgaudit.log = ${JSON.stringify(setting)}) — a finding per brief §31`, {
                actual: setting,
              }),
        );
      }
    } catch (err) {
      // A live read that was ATTEMPTED and failed is UNKNOWN, not LOCAL_ONLY —
      // distinct from "never attempted because no credential" above.
      for (const k of liveKeys) {
        out.push(check(`db-observability.${k.id}`, Status.UNKNOWN, `${k.title}: live read failed`, { detail: String(err) }));
      }
    }
  }

  return out;
}
