/**
 * Dev utility: render one flight-recorder trace as the tree the Bridge draws.
 *
 * Reads through the same `public.helm_debug_get_trace` facade the Bridge uses
 * and folds with the same `buildTraceTree`, so what this prints is what the UI
 * shows — useful for proving the pipeline end to end from a terminal, and for
 * pasting into an incident report.
 *
 * Usage: npx tsx scripts/print-trace-tree.ts <trace-id>
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildTraceTree, type TraceStepNode } from '../src/app/admin/traces/trace-tree';

const execFileAsync = promisify(execFile);

const GLYPH: Record<string, string> = {
  success: '🟢',
  failure: '🔴',
  missing: '⚪',
  warning: '🟡',
  skipped: '⚫',
  started: '🔵',
  pending: '🔵',
};

async function findContainer(): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}']);
  const name = stdout.split(/\r?\n/).find((n) => /^supabase_db_/.test(n));
  if (!name) throw new Error('No running local Supabase Postgres container found.');
  return name;
}

function render(nodes: readonly TraceStepNode[], prefix = ''): string[] {
  const out: string[] = [];
  nodes.forEach((node, i) => {
    const last = i === nodes.length - 1;
    const label = node.key.includes('.') ? node.key.slice(node.key.lastIndexOf('.') + 1) : node.key;
    const ms = node.durationMs !== null ? `${node.durationMs} ms` : node.isMissing ? 'NOT RUN' : '—';
    const err = node.errorCode ? `  ${node.errorCode}` : '';
    out.push(`${prefix}${last ? '└─' : '├─'} ${GLYPH[node.status] ?? '⚪'} ${label.padEnd(28)}${ms.padStart(9)}${err}`);
    out.push(...render(node.children, `${prefix}${last ? '   ' : '│  '}`));
  });
  return out;
}

async function main() {
  const traceId = process.argv[2];
  if (!traceId) throw new Error('Usage: npx tsx scripts/print-trace-tree.ts <trace-id>');

  const container = await findContainer();
  const { stdout } = await execFileAsync('docker', [
    'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c',
    `select public.helm_debug_get_trace('${traceId.replaceAll("'", "''")}'::uuid)`,
  ]);

  const detail = JSON.parse(stdout.trim()) as {
    run: Record<string, unknown>;
    steps: Record<string, unknown>[];
  };
  const workflow = String(detail.run.workflow ?? '');
  const tree = buildTraceTree(detail.steps ?? [], workflow);

  const status = String(detail.run.status ?? '');
  console.log(`\n${GLYPH[status] ?? '⚪'} ${workflow}   ${detail.run.duration_ms ?? '—'} ms   trace ${traceId.slice(0, 8)}`);
  console.log(render(tree.roots).join('\n'));
  console.log(
    `\nfailure: ${tree.failureKey ?? 'none'}   required steps that never ran: ${tree.missingRequiredCount}\n`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
