/**
 * verify-baseball-demo-coverage.ts — standalone BaseballHelm demo-coverage
 * report.
 *
 * Read-only. Re-derives the Phase-1 demo team/coach/roster ids (same
 * detId() algorithm and namespace as scripts/seed-baseball-demo.ts) and
 * counts rows, scoped to that demo team, for every table in the data
 * contract: docs/seed/BASEBALLHELM_DEMO_DATA_CONTRACT.md.
 *
 * Prints one line per route/table: expected status, actual count, PASS/FAIL.
 * Exits non-zero only if a REQUIRED surface has zero rows for the demo team.
 * Tables in the INTENTIONALLY_EMPTY list are printed as informational only
 * and never affect the exit code.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-baseball-demo-coverage.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// Must match scripts/seed-baseball-demo.ts exactly.
const NS_P1 = 'baseballhelm-demo-phase1';

function p1Id(key: string): string {
  const h = createHash('sha1').update(`${NS_P1}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

const TEAM_ID = p1Id('team');
const COACH_ID = p1Id('coach');

/**
 * One entry per row in the "Per-table contract" section of
 * docs/seed/BASEBALLHELM_DEMO_DATA_CONTRACT.md. `scopeColumn` is the column
 * used to scope the count query to the demo team (directly or via a join-
 * free filter); `required: true` means a zero count fails the run.
 */
interface CoverageEntry {
  table: string;
  route: string;
  scopeColumn: 'team_id' | 'coach_id' | 'none';
  required: boolean;
  note?: string;
}

export const SURFACE_COVERAGE: readonly CoverageEntry[] = [
  { table: 'baseball_conversations', route: '/baseball/dashboard/messages', scopeColumn: 'team_id', required: true },
  { table: 'baseball_messages', route: '/baseball/dashboard/messages', scopeColumn: 'none', required: true, note: 'scoped via conversation_id; counted globally since the table has no team_id column' },
  { table: 'baseball_videos', route: '/baseball/dashboard/videos', scopeColumn: 'team_id', required: true },
  { table: 'baseball_tasks', route: '/baseball/dashboard/tasks', scopeColumn: 'team_id', required: true },
  { table: 'baseball_task_assignments', route: '/baseball/dashboard/tasks', scopeColumn: 'none', required: true, note: 'scoped via task_id; counted globally since the table has no team_id column' },
  { table: 'helm_lifting_groups', route: '/baseball/dashboard/performance/groups', scopeColumn: 'team_id', required: true },
  { table: 'helm_lifting_group_members', route: '/baseball/dashboard/performance/groups', scopeColumn: 'none', required: true, note: 'scoped via group_id, counted globally since the table has no team_id column; rows depend on scripts/seed-baseball-lifting-demo.ts having run (athlete_id resolution)' },
  { table: 'baseball_developmental_plans', route: '/baseball/dashboard/dev-plans', scopeColumn: 'team_id', required: true },
  { table: 'baseball_seasons', route: '/baseball/dashboard/settings (season)', scopeColumn: 'team_id', required: true },
  { table: 'baseball_import_sources', route: '/baseball/dashboard/import', scopeColumn: 'team_id', required: true },
  { table: 'baseball_import_runs', route: '/baseball/dashboard/import', scopeColumn: 'team_id', required: true },
  { table: 'baseball_stat_uploads', route: '/baseball/dashboard/import', scopeColumn: 'team_id', required: true },
  { table: 'baseball_player_stats', route: '/baseball/dashboard/stats', scopeColumn: 'team_id', required: true },
  { table: 'baseball_player_aggregates', route: '/baseball/dashboard/stats', scopeColumn: 'team_id', required: true },
] as const;

/**
 * Surfaces deliberately left empty for the demo team (see contract doc
 * "Intentionally-empty surfaces"). Printed for visibility, never required.
 */
export const INTENTIONALLY_EMPTY: readonly { table: string; reason: string }[] = [
  { table: 'baseball_recruiting_interests', reason: 'demo team is a college roster; college players never activate recruiting' },
  { table: 'baseball_watchlists', reason: 'demo team is a college roster; no recruiting pipeline to populate' },
  { table: 'baseball_decision_log', reason: 'Decision Room is a separate workflow, out of scope for this demo-coverage pass' },
  { table: 'baseball_meeting_items', reason: 'Decision Room is a separate workflow, out of scope for this demo-coverage pass' },
  { table: 'baseball_signals', reason: 'Decision Room is a separate workflow, out of scope for this demo-coverage pass' },
  { table: 'baseball_actions', reason: 'Decision Room is a separate workflow, out of scope for this demo-coverage pass' },
  { table: 'baseball_video_events', reason: 'staff-anchored film-tagging queue, distinct from the player-uploaded baseball_videos library this pass seeds' },
] as const;

interface CoverageResult extends CoverageEntry {
  count: number | null;
  errorMessage: string | null;
  pass: boolean;
}

async function countFor(
  supabase: SupabaseClient,
  entry: CoverageEntry,
): Promise<{ count: number | null; errorMessage: string | null }> {
  let query = supabase.from(entry.table).select('*', { count: 'exact', head: true });
  if (entry.scopeColumn === 'team_id') {
    query = query.eq('team_id', TEAM_ID);
  } else if (entry.scopeColumn === 'coach_id') {
    query = query.eq('coach_id', COACH_ID);
  }
  const { count, error } = await query;
  if (error) return { count: null, errorMessage: error.message };
  return { count: count ?? 0, errorMessage: null };
}

/** Pure — exported so the reporting logic is independently unit-testable. */
export function evaluateCoverage(
  entry: CoverageEntry,
  count: number | null,
  errorMessage: string | null,
): CoverageResult {
  if (errorMessage !== null) {
    return { ...entry, count: null, errorMessage, pass: !entry.required };
  }
  const pass = !entry.required || (count ?? 0) > 0;
  return { ...entry, count, errorMessage: null, pass };
}

export function formatReportLine(result: CoverageResult): string {
  const status = result.errorMessage
    ? `ERROR (${result.errorMessage})`
    : `${result.count} row(s)`;
  const verdict = result.errorMessage
    ? (result.required ? 'FAIL' : 'SKIP')
    : result.pass
      ? 'PASS'
      : 'FAIL';
  const req = result.required ? 'required' : 'optional';
  const note = result.note ? `  [${result.note}]` : '';
  return `  [${verdict}] ${result.table.padEnd(34)} (${req})  ${result.route.padEnd(38)} ${status}${note}`;
}

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log('='.repeat(78));
  console.log('BASEBALLHELM DEMO SURFACE COVERAGE REPORT');
  console.log(`Demo team: ${TEAM_ID}`);
  console.log('='.repeat(78));

  console.log('\nREQUIRED SURFACES (route -> table -> row count):');
  const results: CoverageResult[] = [];
  for (const entry of SURFACE_COVERAGE) {
    const { count, errorMessage } = await countFor(supabase, entry);
    const result = evaluateCoverage(entry, count, errorMessage);
    results.push(result);
    console.log(formatReportLine(result));
  }

  console.log('\nINTENTIONALLY-EMPTY SURFACES (informational only — never fail the run):');
  for (const entry of INTENTIONALLY_EMPTY) {
    const { count, errorMessage } = await countFor(supabase, { table: entry.table, route: '—', scopeColumn: 'team_id', required: false });
    const status = errorMessage ? `ERROR (${errorMessage})` : `${count} row(s)`;
    console.log(`  [INFO] ${entry.table.padEnd(34)} ${status}  — ${entry.reason}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + '='.repeat(78));
  if (failed.length === 0) {
    console.log(`PASS — all ${results.length} required surfaces have demo coverage.`);
  } else {
    console.log(`FAIL — ${failed.length} of ${results.length} required surface(s) have no demo coverage:`);
    for (const f of failed) console.log(`  - ${f.table} (${f.route})`);
  }
  console.log('='.repeat(78));

  process.exit(failed.length === 0 ? 0 : 1);
}

// Guard the live-DB run behind a direct-execution check so this module can
// be imported by unit tests (see scripts/__tests__/verify-baseball-demo-coverage.test.ts)
// for the pure evaluateCoverage()/formatReportLine() logic without trying to
// connect to Supabase or call process.exit().
const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectExecution) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
