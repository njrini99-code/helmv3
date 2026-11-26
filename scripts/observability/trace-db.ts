/**
 * Local-only rollback-proof Postgres trace collector.
 *
 * `helm_private.trace_checkpoint` emits HELM_TRACE JSON to the Postgres log
 * from inside an atomic transaction. This process follows the discovered
 * local Supabase database container and writes those checkpoints through the
 * service-role-only trace facade in a separate request/transaction. It never
 * prints credentials or raw application payloads.
 */
import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type TraceEvent = {
  trace_id?: unknown;
  step_key?: unknown;
  parent_step_key?: unknown;
  phase?: unknown;
  status?: unknown;
  metadata?: unknown;
};

async function findLocalDatabaseContainer(): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}']);
  const container = stdout.split(/\r?\n/).find((name) => /^supabase_db_/.test(name));
  if (!container) throw new Error('No running local Supabase Postgres container was found.');
  return container;
}

function sqlLiteral(value: unknown): string {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

async function persistLocalCheckpoint(container: string, event: TraceEvent) {
  const traceId = stringValue(event.trace_id);
  const stepKey = stringValue(event.step_key);
  if (!traceId || !stepKey) return;
  const metadata = {
    parent_step_key: stringValue(event.parent_step_key),
    category: stringValue(event.phase),
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
  };
  const sql = `select public.helm_debug_record_trace_step('${traceId}'::uuid, '${stepKey.replaceAll("'", "''")}', 'postgres', '${(stringValue(event.status) ?? 'warning').replaceAll("'", "''")}', 'required', ${sqlLiteral(metadata)});`;
  await execFileAsync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function main() {
  const container = await findLocalDatabaseContainer();

  console.log(`[trace:db] Following rollback-proof checkpoints from ${container}. Press Ctrl+C to stop.`);
  const logs = spawn('docker', ['logs', '--follow', '--since', '0s', container], { stdio: ['ignore', 'pipe', 'pipe'] });

  let pending = '';
  const consume = async (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      const marker = line.indexOf('HELM_TRACE ');
      if (marker === -1) continue;
      try {
        const event = JSON.parse(line.slice(marker + 'HELM_TRACE '.length)) as TraceEvent;
        await persistLocalCheckpoint(container, event);
      } catch {
        // A malformed log line must not stop collection for later traces.
      }
    }
  };

  logs.stdout.on('data', (chunk: Buffer) => { void consume(chunk); });
  logs.stderr.on('data', (chunk: Buffer) => { void consume(chunk); });
  logs.on('exit', (code) => {
    console.log(`[trace:db] Docker log stream ended${code == null ? '' : ` (${code})`}.`);
  });
}

void main().catch((error) => {
  console.error(`[trace:db] ${error instanceof Error ? error.message : 'Unable to start collector.'}`);
  process.exitCode = 1;
});
