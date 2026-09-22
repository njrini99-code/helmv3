/**
 * Shot-trace judge over recorded flight-recorder traces.
 *
 *   npm run judgment:shot-traces -- --fixtures        # evals/judgment/shot-trace (default, no DB)
 *   npm run judgment:shot-traces -- --live --limit 50 # helm_debug_list_traces via the service role
 *
 * `--live` reads trace metadata (workflow, status, step keys) through the
 * same service-role facades the admin tracer uses, selects only the traces
 * `shouldJudgeTrace` names (failures, warnings, recomputed missing required
 * steps, verification mismatches, recovery paths, a 1-in-50 sample), and
 * records shadow verdicts. Never runs from a request path.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { compileShotTraceEvidence, shouldJudgeTrace } from '@/lib/ai/judgment/evidence/shot-ledger';
import { judgeShotTrace } from '@/lib/ai/judgment/use-cases/shot-trace';

const argv = process.argv.slice(2);
const live = argv.includes('--live');
const limit = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : 50;
const dryRun = !argv.includes('--persist');

type Row = { trace_id: string; run: Record<string, unknown>; steps: Array<Record<string, unknown>>; shots?: unknown };

async function fixtureRows(): Promise<Row[]> {
  const dir = path.resolve(process.cwd(), 'evals/judgment/shot-trace');
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const fx = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as { input: Row & { traceId: string } };
    return { trace_id: fx.input.traceId, run: fx.input.run, steps: fx.input.steps, shots: fx.input.shots };
  });
}

async function liveRows(): Promise<Row[]> {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient() as unknown as { rpc(n: string, a: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };
  const list = await admin.rpc('helm_debug_list_traces', { p_limit: limit, p_workflow: null, p_round_id: null });
  if (list.error) throw new Error(list.error.message);
  const rows: Row[] = [];
  for (const run of (list.data as Array<{ trace_id: string }>) ?? []) {
    const detail = await admin.rpc('helm_debug_get_trace', { p_trace_id: run.trace_id });
    if (detail.error || !detail.data) continue;
    const d = detail.data as { run: Record<string, unknown>; steps: Array<Record<string, unknown>> };
    rows.push({ trace_id: run.trace_id, run: d.run, steps: d.steps });
  }
  return rows;
}

async function main(): Promise<void> {
  const rows = live ? await liveRows() : await fixtureRows();
  let judged = 0;
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const evidence = compileShotTraceEvidence({ run: row.run as never, steps: row.steps as never, shots: row.shots as never });
    const gate = shouldJudgeTrace(evidence, row.trace_id);
    if (!gate.judge && live) continue;
    const { result } = await judgeShotTrace(
      { traceId: row.trace_id, run: row.run as never, steps: row.steps as never, shots: row.shots as never, roundId: (row.run.round_id as string | null) ?? null },
      { dryRun, modeOverride: 'shadow' },
    );
    judged += 1;
    counts[result.disposition] = (counts[result.disposition] ?? 0) + 1;
    console.log(`${result.disposition.padEnd(22)} ${String(row.run.workflow).padEnd(26)} ${String(row.run.status).padEnd(8)} why=${gate.why.padEnd(21)} ${result.reasonCodes.join(',')} ${result.durationMs}ms`);
  }
  console.log(`\n${judged}/${rows.length} traces judged (${live ? 'live' : 'fixtures'}, ${dryRun ? 'dry-run' : 'persisted'}):`, counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
