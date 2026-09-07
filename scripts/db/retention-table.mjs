#!/usr/bin/env node
/**
 * Database Plan D7 — generates docs/operations/RETENTION.md's AUTOGEN table
 * from the retention constants actually present in the enforcing cron
 * routes, rather than hand-typed prose that can drift from the code (see
 * .claude/rules/shipping.md "Never write a count into prose").
 *
 * Sources parsed (each entry below names the file, the regex that pulls its
 * day count, and the tables that constant governs — the file/table mapping
 * is curated here because the routes' retention windows are documented in
 * prose comments, not in a machine-parseable manifest; the NUMBER is always
 * read live from the source file, never hand-typed, so a changed constant
 * shows up as drift on the next `npm run docs:check` run without anyone
 * needing to remember to update this file).
 *
 * `--check` compares the generated AUTOGEN block against what's committed
 * and exits 1 on drift, same contract as scripts/regen-docs.mjs's `emit()`.
 * Wired into `npm run docs:check`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DOC = join(REPO_ROOT, 'docs', 'operations', 'RETENTION.md');

/**
 * One row per governed table. `days` is either a literal number (rare —
 * most constants are read from source below and overwrite this) or a
 * `read()` descriptor naming the file + regex to extract the live value
 * from, so the doc can never silently drift from the code that enforces it.
 */
const SOURCES = [
  {
    table: 'admin_events (info/warning)',
    file: 'src/app/api/cron/log-retention/route.ts',
    pattern: /const ago90d = new Date\(Date\.now\(\) - (\d+) \* 86400_000\)/,
    job: 'log-retention',
  },
  {
    table: 'admin_events (error/critical)',
    file: 'src/app/api/cron/log-retention/route.ts',
    pattern: /const ago13mo = new Date\(Date\.now\(\) - (\d+) \* 86400_000\)/,
    job: 'log-retention',
  },
  {
    table: 'error_logs (info/warning)',
    file: 'src/app/api/cron/log-retention/route.ts',
    pattern: /const ago90d = new Date\(Date\.now\(\) - (\d+) \* 86400_000\)/,
    job: 'log-retention',
  },
  {
    table: 'error_logs (error/critical)',
    file: 'src/app/api/cron/log-retention/route.ts',
    pattern: /const ago13mo = new Date\(Date\.now\(\) - (\d+) \* 86400_000\)/,
    job: 'log-retention',
  },
  {
    table: 'background_job_logs',
    file: 'src/app/api/cron/log-retention/route.ts',
    pattern: /const ago90d = new Date\(Date\.now\(\) - (\d+) \* 86400_000\)/,
    job: 'log-retention',
  },
  {
    table: 'admin_analytics_events',
    file: 'src/app/api/cron/log-retention/route.ts',
    // Not yet on this branch as of writing — agent/cron-batch (#1867) added
    // this purge on a sibling branch. If/when merged, this pattern picks up
    // its constant automatically; until then the row is reported "not found
    // in this branch" rather than a fabricated number.
    pattern: /admin_analytics_events[\s\S]{0,200}?(\d+)\s*\*\s*86400_000/,
    job: 'log-retention',
    optional: true,
  },
  {
    table: 'helm_debug.trace_runs / trace_steps',
    file: 'src/app/api/cron/helm-debug-prune/route.ts',
    pattern: /const RETENTION_DAYS = (\d+);/,
    job: 'helm-debug-prune',
  },
  {
    table: 'helm_debug.db_error_events',
    file: 'supabase/migrations/20260903180300_helm_debug_observability_retention.sql',
    pattern: /p_error_events_retention_days integer default (\d+)/,
    job: 'db-observability-prune',
  },
  {
    table: 'helm_debug.db_health_samples',
    file: 'supabase/migrations/20260903180300_helm_debug_observability_retention.sql',
    pattern: /p_health_samples_retention_days integer default (\d+)/,
    job: 'db-observability-prune',
  },
  {
    table: 'helm_debug.db_stat_deltas',
    file: 'supabase/migrations/20260903180300_helm_debug_observability_retention.sql',
    pattern: /p_stat_deltas_retention_days integer default (\d+)/,
    job: 'db-observability-prune',
  },
  {
    table: 'helm_debug.db_stat_prior_state (last_seen)',
    file: 'supabase/migrations/20260903180300_helm_debug_observability_retention.sql',
    pattern: /p_prior_state_retention_days integer default (\d+)/,
    job: 'db-observability-prune',
  },
  {
    table: 'helm_jobs.dedupe_keys (dedupe window)',
    file: 'supabase/migrations/20260906140000_helm_jobs_pgmq_queues.sql',
    pattern: /created_at > clock_timestamp\(\) - interval '(\d+) hours'/,
    job: 'n/a — checked inline by helm_jobs_enqueue, not purged by a cron',
    unit: 'hours',
  },
];

const CRON_REGISTRY_FILE = 'src/lib/admin/cron-registry.ts';

async function readCronSchedule(jobType) {
  try {
    const src = await readFile(join(REPO_ROOT, CRON_REGISTRY_FILE), 'utf8');
    const re = new RegExp(`jobType: '${jobType}'[^}]*schedule: '([^']+)'`);
    const m = src.match(re);
    return m ? m[1] : 'not scheduled';
  } catch {
    return 'unknown';
  }
}

async function extractRow(source) {
  let value = 'not found in this branch';
  try {
    const src = await readFile(join(REPO_ROOT, source.file), 'utf8');
    const m = src.match(source.pattern);
    if (m) {
      const n = m[1];
      value = source.unit === 'hours' ? `${n} hours` : `${n} days`;
    } else if (!source.optional) {
      value = 'PATTERN NOT MATCHED — script or source drifted, check manually';
    }
  } catch {
    value = source.optional ? 'not found in this branch' : `MISSING FILE ${source.file}`;
  }

  const schedule = source.job.startsWith('n/a') ? 'n/a' : await readCronSchedule(source.job);

  return {
    table: source.table,
    rule: value,
    job: source.job,
    schedule,
    lastRun: 'not read (generator is static-source-only; see Bridge Jobs board for live run history)',
  };
}

function renderBody(rows) {
  const lines = [
    '| Table | Retention rule | Enforcing job | Schedule | Last run |',
    '|---|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push(`| \`${r.table}\` | ${r.rule} | \`${r.job}\` | \`${r.schedule}\` | ${r.lastRun} |`);
  }
  return lines.join('\n');
}

function renderDoc(body) {
  return `# Retention — every governed table, one rule each (Database Plan D7)

Generated by \`scripts/db/retention-table.mjs\` from the retention constants
actually present in the enforcing cron routes and migrations — never
hand-typed. Run \`npm run db:retention-table\` to regenerate after changing a
retention window; \`npm run docs:check\` fails if this file is stale.

Rows reading "not found in this branch" name a source this generator knows
how to parse that is not present on the current branch (e.g. a sibling PR's
change not yet merged) — not a missing retention policy. Rows reading
"PATTERN NOT MATCHED" mean the source file changed shape and this script's
regex needs updating — treat that as a bug in the generator, not silent
drift in the doc.

<!-- AUTOGEN:retention-table:start -->
<!-- DO NOT EDIT — regenerated by scripts/db/retention-table.mjs -->

${body}

<!-- AUTOGEN:retention-table:end -->

## Tables with NO retention rule (known gap, not silently omitted)

- \`helm_debug.db_platform_samples\` — documented gap, see
  \`docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md\` §8 and this
  table's own HELD.md row (folding it into the shared prune function would
  edit a file another track already shipped).
- \`helm_debug.agent_runs\` — table not yet applied (HELD,
  \`20260903150000_helm_debug_agent_runs.sql\`); no retention function
  written yet either.
- \`golf_predictions\` / \`golf_prediction_validations\` — no age-based purge;
  read by \`coachhelm-calibration\` on a 90-day lookback WINDOW (a read
  filter, not a delete), so rows accumulate indefinitely today. Flagged
  here, not fixed — an intentional scope boundary for this PR (D7 is
  "every table gets one written rule," and the rule for these two is
  currently "none," which is itself the honest answer until an owner
  decides whether unlimited retention is acceptable for training data this
  large).
`;
}

async function emit(check) {
  const rows = [];
  for (const source of SOURCES) {
    rows.push(await extractRow(source));
  }
  const body = renderBody(rows);
  const next = renderDoc(body);

  if (!check) {
    await writeFile(OUT_DOC, next);
    console.log(`Wrote ${OUT_DOC.replace(`${REPO_ROOT}/`, '')} (${rows.length} rows)`);
    return 0;
  }

  const current = await readFile(OUT_DOC, 'utf8').catch(() => null);
  if (current === next) {
    console.log('db:retention-table:check — OK — RETENTION.md matches its sources');
    return 0;
  }

  console.error('db:retention-table:check — RETENTION.md IS STALE');
  console.error('Run `npm run db:retention-table` and commit the result in this branch.');
  return 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const check = process.argv.includes('--check');
  emit(check)
    .then((code) => process.exit(code ?? 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { emit };
