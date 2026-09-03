/**
 * Coverage matrix - brief 79.
 *
 * EVERY CELL IS DERIVED FROM CODE, NEVER FROM THE BRIEF'S INTENT. A row says
 * "Sentry: YES" only because a detector found a capture in a module that
 * actually implements that row's observation, with comments stripped first.
 * Nothing here is hand-typed from what the design document wanted, because a
 * matrix that restates its own brief certifies nothing.
 *
 * Cell vocabulary, and the difference between the last two matters most:
 *
 *   YES           the code does this; the detector found it
 *   NO            the code does not do this; the detector looked and found nothing
 *   UNKNOWN       nobody has established either way - no module is claimed to
 *                 implement it, so "NO" would be a stronger claim than the
 *                 evidence supports
 *   NOT VERIFIED  the mechanism exists in code but has never been exercised
 *                 against a live database or a deployed environment
 *
 * UNKNOWN is never rendered as NO and never as a blank. NOT VERIFIED is never
 * rendered as YES. Both are the point of the exercise: the matrix exists to
 * show where the blind spots are, and a matrix that cannot say "I do not
 * know" will always look complete.
 *
 * The generated document carries NO DATE AND NO COMMIT SHA, so `--check` is
 * a real idempotence test rather than a diff against the clock.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const OUTPUT_PATH = 'docs/observability/SUPABASE_COVERAGE_MATRIX.md';

export const YES = 'YES';
export const NO = 'NO';
export const UNKNOWN = 'UNKNOWN';
export const NOT_VERIFIED = 'NOT VERIFIED';

function read(relPath) {
  const p = join(REPO_ROOT, relPath);
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

/** See the certification matrix's own header: a check that matches prose is
 *  not reading behaviour. `observe-result.ts` says in its header that it does
 *  NOT call Sentry.captureException. */
export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Concatenated, comment-stripped source of a row's implementing modules.
 *  Returns null when NONE of them exist - the caller turns that into UNKNOWN
 *  rather than NO, because a missing module is missing evidence. */
function codeOf(modules) {
  const present = modules.map((m) => read(m)).filter((s) => s !== null);
  if (present.length === 0) return null;
  return present.map(stripComments).join('\n');
}

// ---------------------------------------------------------------------------
// Rows - brief 79's exact list, in its order
// ---------------------------------------------------------------------------

const S = 'src/lib/observability/supabase';
const OBSERVE_RESULT = [`${S}/observe-result.ts`, `${S}/classify.ts`, `${S}/envelope.ts`];

/**
 * `modules`            what implements observation for this row
 * `bridgeReader`       the Bridge data module that surfaces it, if any
 * `flightSteps`        workflow step keys this row appears as, if any
 * `invariantModule`    the module that turns a silent failure into an event
 * `replayFixtures`     fixture ids in the replay set
 * `alertRule`          a named rule in the alert policy, if one exists here
 */
export const COVERAGE_ROWS = [
  { id: 'postgrest_select_failure', label: 'PostgREST select failure', modules: OBSERVE_RESULT, bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: ['db.load_round'], replayFixtures: ['round_missing_race_PGRST116'] },
  { id: 'postgrest_mutation_failure', label: 'PostgREST mutation failure', modules: OBSERVE_RESULT, bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: ['db.shot_mutation', 'db.create_draft'], replayFixtures: ['unique_violation_race_23505'] },
  { id: 'rpc_sqlstate_failure', label: 'RPC SQLSTATE failure', modules: OBSERVE_RESULT, bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: ['db.submit_round_atomic'], replayFixtures: ['deadlock_40P01', 'schema_mismatch_42703'] },
  { id: 'rpc_rollback', label: 'RPC rollback', modules: [`${S}/record-db-error.ts`, 'src/app/admin/traces/trace-explorer-layers.ts', ...OBSERVE_RESULT], bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: ['db.submit_round_atomic'], replayFixtures: ['deadlock_40P01'] },
  { id: 'rpc_timeout', label: 'RPC timeout', modules: OBSERVE_RESULT, bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: ['db.save_partial_round_atomic'], replayFixtures: ['statement_timeout_57014'] },
  { id: 'rpc_unknown_commit', label: 'RPC unknown commit', modules: [`${S}/commit-outcome.ts`], bridgeReader: null, flightSteps: ['db.submit_round_atomic'], replayFixtures: [] },
  { id: 'rls_expected_denial', label: 'RLS expected denial', modules: OBSERVE_RESULT, bridgeReader: null, flightSteps: [], replayFixtures: ['authorization_denial_42501_expected'] },
  { id: 'rls_unexpected_denial', label: 'RLS unexpected denial', modules: OBSERVE_RESULT, bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: [], replayFixtures: ['authorization_denial_42501'] },
  { id: 'auth_api_error', label: 'Auth API error', modules: [`${S}/observe-auth.ts`, `${S}/classify-auth.ts`, `${S}/envelope.ts`], bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: [], replayFixtures: [] },
  { id: 'auth_client_error', label: 'Auth client error', modules: [`${S}/classify-auth.ts`], bridgeReader: null, flightSteps: [], replayFixtures: [] },
  { id: 'storage_error', label: 'Storage error', modules: [`${S}/observe-storage.ts`, `${S}/classify-storage.ts`, `${S}/envelope.ts`], bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: [], replayFixtures: [] },
  { id: 'realtime_connection_error', label: 'Realtime connection error', modules: [`${S}/realtime.ts`], bridgeReader: null, flightSteps: [], replayFixtures: [] },
  { id: 'realtime_silent_propagation', label: 'Realtime silent propagation', modules: [`${S}/realtime.ts`], bridgeReader: null, flightSteps: [], replayFixtures: [] },
  { id: 'edge_function_exception', label: 'Edge Function exception', modules: [`${S}/observe-edge.ts`, `${S}/classify-edge.ts`, `${S}/envelope.ts`], bridgeReader: null, flightSteps: [], replayFixtures: [] },
  { id: 'pg_cron_failure', label: 'pg_cron failure', modules: [`${S}/jobs-health.ts`], bridgeReader: 'src/lib/admin/database/jobs.ts', flightSteps: [], replayFixtures: [] },
  { id: 'pg_cron_missed_run', label: 'pg_cron missed run', modules: [`${S}/jobs-health.ts`], bridgeReader: 'src/lib/admin/database/jobs.ts', flightSteps: [], replayFixtures: [] },
  { id: 'pg_net_failure', label: 'pg_net failure', modules: [`${S}/jobs-health.ts`], bridgeReader: 'src/lib/admin/database/jobs.ts', flightSteps: [], replayFixtures: [] },
  { id: 'lock_wait', label: 'Lock wait', modules: [`${S}/locks.ts`], bridgeReader: 'src/lib/admin/database/locks.ts', flightSteps: [], replayFixtures: [] },
  { id: 'deadlock', label: 'Deadlock', modules: [`${S}/locks.ts`, ...OBSERVE_RESULT], bridgeReader: 'src/lib/admin/database/locks.ts', flightSteps: [], replayFixtures: ['deadlock_40P01'] },
  { id: 'connection_saturation', label: 'Connection saturation', modules: [`${S}/health-rules.ts`, `${S}/db-health-delta.ts`], bridgeReader: 'src/lib/admin/database/overview.ts', flightSteps: [], replayFixtures: [] },
  { id: 'cpu_memory_saturation', label: 'CPU / memory saturation', modules: ['src/lib/observability/supabase/metrics-api.ts'], bridgeReader: 'src/lib/admin/database/overview.ts', flightSteps: [], replayFixtures: [] },
  { id: 'query_performance_regression', label: 'Query performance regression', modules: [`${S}/query-regression.ts`], bridgeReader: 'src/lib/admin/database/performance.ts', flightSteps: [], replayFixtures: [] },
  { id: 'schema_drift', label: 'Schema drift', modules: ['scripts/db/check-supabase-drift.mjs'], bridgeReader: null, flightSteps: [], replayFixtures: [] },
  { id: 'db_type_drift', label: 'DB type drift', modules: ['scripts/db/check-supabase-drift.mjs'], bridgeReader: null, flightSteps: [], replayFixtures: [] },
  { id: 'data_integrity_violation', label: 'Data integrity violation', modules: [`${S}/integrity.ts`, `${S}/envelope.ts`], bridgeReader: 'src/lib/admin/database/errors.ts', flightSteps: [], invariantModule: `${S}/integrity.ts`, replayFixtures: ['stale_optimistic_lock', 'zero_row_update'] },
  { id: 'sentry_trace_missing', label: 'Sentry trace missing', modules: ['src/lib/observability/supabase/trace-cert.ts', 'scripts/db-observability-trace-cert.mjs'], bridgeReader: null, flightSteps: [], replayFixtures: [] },
  { id: 'db_collector_missing', label: 'DB collector missing', modules: [`${S}/freshness.ts`, `${S}/jobs-health.ts`], bridgeReader: 'src/lib/admin/database/telemetry.ts', flightSteps: [], replayFixtures: [] },
];

export const COVERAGE_COLUMNS = [
  'Sentry',
  'Bridge',
  'DB error event',
  'Flight Recorder',
  'SQLSTATE/code',
  'Release',
  'Trace correlation',
  'Metric',
  'Invariant',
  'Alert',
  'Replay',
  'Live verified',
  'Blind spot',
];

// ---------------------------------------------------------------------------
// Detectors - one per column, each answering from source
// ---------------------------------------------------------------------------

const METRIC_RECORDERS = /record(DbFailure|Auth|StorageFailure|EdgeFunctionFailure|RealtimeChannelFailure|Job|Workflow\w*)\s*\(/;

function sentryCell(code) {
  if (code === null) return UNKNOWN;
  // A direct capture in the row's own module.
  if (/Sentry\.capture\w+\s*\(/.test(code)) return YES;
  // Otherwise the failure only reaches Sentry if it ESCAPES to an action
  // wrapper or onRequestError - which depends on the call site, not on this
  // module. That is genuinely not established here.
  return UNKNOWN;
}

function bridgeCell(row) {
  if (!row.bridgeReader) return UNKNOWN;
  const reader = read(row.bridgeReader);
  if (reader === null) return UNKNOWN;
  // A reader only counts if the Bridge page actually mounts it.
  const page = read('src/app/admin/database/page.tsx');
  if (page === null) return UNKNOWN;
  const exported = [...stripComments(reader).matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  return exported.some((fn) => page.includes(fn)) ? YES : NO;
}

function dbErrorEventCell(code) {
  if (code === null) return UNKNOWN;
  return /scheduleDbErrorRecording\s*\(/.test(code) ? YES : NO;
}

function flightRecorderCell(row) {
  if (row.flightSteps.length === 0) return NO;
  const workflow = read('src/lib/observability/golf-round-flight-workflow.ts');
  if (workflow === null) return UNKNOWN;
  const declared = row.flightSteps.filter((k) => workflow.includes(`'${k}'`));
  if (declared.length === row.flightSteps.length) return YES;
  return declared.length === 0 ? NO : `${YES} (partial)`;
}

function codeCell(code) {
  if (code === null) return UNKNOWN;
  return /classify\w*Error\s*\(|sqlstate|storageCode|authCode|postgrestCode/i.test(code) ? YES : NO;
}

function releaseCell(code) {
  if (code === null) return UNKNOWN;
  return /releaseSha/.test(code) ? YES : NO;
}

function traceCell(code) {
  if (code === null) return UNKNOWN;
  return /getSentryCorrelation\s*\(|sentryTraceId|helmTraceId/.test(code) ? YES : NO;
}

function metricCell(code) {
  if (code === null) return UNKNOWN;
  return METRIC_RECORDERS.test(code) ? YES : NO;
}

function invariantCell(row) {
  if (!row.invariantModule) return NO;
  return read(row.invariantModule) === null ? UNKNOWN : YES;
}

/**
 * The alert policy lives in a sibling track's document that is not on this
 * branch. Reporting NO would claim nobody built alerting; reporting YES would
 * claim something this branch cannot see. UNKNOWN is the only honest cell.
 */
function alertCell() {
  const policy = read('docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md');
  return policy === null ? UNKNOWN : (/alert/i.test(policy) ? `${NOT_VERIFIED} (policy documented, not wired)` : UNKNOWN);
}

function replayCell(row) {
  if (row.replayFixtures.length === 0) return NO;
  const fixtures = read(`${S}/__fixtures__/replay-fixtures.ts`);
  if (fixtures === null) return UNKNOWN;
  const present = row.replayFixtures.filter((id) => fixtures.includes(`id: '${id}'`));
  if (present.length === row.replayFixtures.length) return YES;
  return present.length === 0 ? NO : `${YES} (partial)`;
}

/**
 * Nothing in this program has been exercised against a live database: every
 * migration is HELD and unapplied. Rather than hardcode that conclusion, it
 * is derived from the ledger - so the day the migrations are applied and the
 * hold is discharged, this cell stops saying NOT VERIFIED on its own.
 */
function liveVerifiedCell() {
  const held = read('supabase/migrations/HELD.md');
  if (held === null) return UNKNOWN;
  const stillHeld = /20260903180000/.test(held) && /HOLD/.test(held);
  return stillHeld ? NOT_VERIFIED : UNKNOWN;
}

function blindSpotCell(cells) {
  const gaps = [];
  if (cells.Sentry === UNKNOWN) gaps.push('Sentry routing is call-site dependent');
  if (cells['DB error event'] === NO) gaps.push('no durable event');
  if (cells.Bridge === UNKNOWN || cells.Bridge === NO) gaps.push('not on the Bridge');
  if (cells.Replay === NO) gaps.push('no replay fixture');
  if (cells.Metric === NO) gaps.push('no metric');
  return gaps.length === 0 ? 'none identified' : gaps.join('; ');
}

export function buildMatrix() {
  return COVERAGE_ROWS.map((row) => {
    const code = codeOf(row.modules);
    const cells = {
      Sentry: sentryCell(code),
      Bridge: bridgeCell(row),
      'DB error event': dbErrorEventCell(code),
      'Flight Recorder': flightRecorderCell(row),
      'SQLSTATE/code': codeCell(code),
      Release: releaseCell(code),
      'Trace correlation': traceCell(code),
      Metric: metricCell(code),
      Invariant: invariantCell(row),
      Alert: alertCell(),
      Replay: replayCell(row),
      'Live verified': liveVerifiedCell(),
    };
    cells['Blind spot'] = blindSpotCell(cells);
    return { id: row.id, label: row.label, cells, modulesPresent: code !== null };
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const HEADER = `<!-- markdownlint-disable MD013 -->
# Supabase observability coverage matrix

<!-- GENERATED FILE - DO NOT HAND-EDIT.
     Produced by \`node scripts/db-observability-coverage.mjs\`.
     Verify with \`node scripts/db-observability-coverage.mjs --check\`.
     Every cell is derived by reading the modules named in
     \`scripts/lib/db-observability-coverage.mjs\`, with comments stripped
     first - never transcribed from the brief's intent. Edit the detectors,
     not this file. -->

Brief section 79. One row per failure class, one column per observation
channel.

| Cell | Meaning |
| --- | --- |
| \`YES\` | the code does this; a detector found it |
| \`NO\` | the code does not do this; a detector looked and found nothing |
| \`UNKNOWN\` | nobody has established either way - weaker than \`NO\` on purpose |
| \`NOT VERIFIED\` | the mechanism exists in code but has never run against a live database or a deployed environment |

\`UNKNOWN\` is never rendered as \`NO\` and never left blank. \`NOT VERIFIED\` is
never rendered as \`YES\`. The blind spots are the deliverable.

Two columns are worth reading carefully:

- **Sentry** is \`UNKNOWN\` for most rows, and that is the accurate answer. Only
  \`realtime.ts\` captures to Sentry from inside the observability layer; every
  other path reaches Sentry only if the error ESCAPES to an action wrapper or
  \`onRequestError\`, which is a property of the call site rather than of the
  observing module. Reporting \`YES\` would claim something no detector here
  established.
- **Live verified** is \`NOT VERIFIED\` for every row because every migration in
  this program is HELD and unapplied. That cell is derived from
  \`supabase/migrations/HELD.md\`, so it changes on its own once the hold is
  discharged.

A row whose implementing module does not exist on the branch being generated
from reads \`UNKNOWN\`, not \`NO\` - the detector found no evidence either way,
which is a weaker statement than "the code does not do this". Several rows
name modules that belong to sibling tracks of the same program; regenerate
after those are integrated and the cells resolve on their own. That is the
intended behaviour of a generated matrix, and the reason the counts live in
the table rather than in prose.

`;

export function renderMatrix(matrix) {
  const head = `| Failure class | ${COVERAGE_COLUMNS.join(' | ')} |`;
  const rule = `| --- | ${COVERAGE_COLUMNS.map(() => '---').join(' | ')} |`;
  const body = matrix
    .map((row) => `| ${row.label} | ${COVERAGE_COLUMNS.map((c) => row.cells[c]).join(' | ')} |`)
    .join('\n');
  return `${HEADER}${head}\n${rule}\n${body}\n`;
}

export function renderReport() {
  return renderMatrix(buildMatrix());
}

export const __testing = { REPO_ROOT, read, codeOf, sentryCell, dbErrorEventCell, blindSpotCell };
