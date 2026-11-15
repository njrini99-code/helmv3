/**
 * The demo team refresh, run by hand (launch readiness DD-01).
 *
 * Generates the demo team (Demo University Golf, DEMO_TEAM_ID only) as of
 * today in the team's zone, checks it, and prints what it would write: per
 * player the rounds, shot rounds and date range, then per table the rows to
 * write, remove and leave. With --apply it writes that difference through the
 * generator's database functions (migration 20261115210000) and checks what
 * the database then shows. The daily cron (/api/cron/golf-demo-refresh) runs
 * the same code once its flag is on.
 *
 * Target: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local (or the environment). Production is refused, dry run included,
 * unless HELM_ALLOW_PRODUCTION=1 (scripts/lib/production-site-guard.mjs): the
 * first production run is the owner's step.
 *
 * Usage:
 *   npx tsx scripts/golf-demo-refresh.ts --no-db [--today 2026-11-15]
 *       generate and check only; no database, no credentials
 *   npx tsx scripts/golf-demo-refresh.ts
 *       dry run against the database: reads the ledger, writes nothing
 *   npx tsx scripts/golf-demo-refresh.ts --apply [--full]
 *       write; --full re-sends every row (after a hand edit, or when the
 *       ledger is in doubt)
 *   --out <file> also writes the report to a file.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { cliGuard } from './lib/cli-guard.mjs';
import { refuseProduction } from './lib/production-site-guard.mjs';
import { DEMO_TEAM_ID } from '../src/lib/demo/config';
import type { Database } from '../src/lib/types/database';
import { checkDemoCoverage, formatCoverage } from '../src/lib/golf/demo/coverage';
import { generateDemoTeam } from '../src/lib/golf/demo/generate';
import { refreshDemoTeam } from '../src/lib/golf/demo/refresh';
import { DEFAULT_SEED } from '../src/lib/golf/demo/story';
import { summarizeDataset } from '../src/lib/golf/demo/summary';

const cli = cliGuard({
  name: 'scripts/golf-demo-refresh.ts',
  summary:
    'Regenerates the demo team (DEMO_TEAM_ID only) for today and writes the difference through the generator functions of migration 20261115210000. Never touches a row the generator did not write. Production is refused unless HELM_ALLOW_PRODUCTION=1.',
  usage: '[--no-db] [--today YYYY-MM-DD] [--full] [--seed <seed>] [--out <file>]',
  options: [
    ['--no-db', 'Generate and check only: no database, no credentials.'],
    ['--today', 'The day to generate (with --no-db or a dry run only; a write always uses today in the team zone).'],
    ['--full', 'Re-send every row, not only new and changed ones.'],
    ['--seed', `The story seed (default ${DEFAULT_SEED}).`],
    ['--out', 'Also write the report to this file.'],
  ],
  secrets: 'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local), DEMO_COACH_EMAIL (optional)',
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const noDb = process.argv.includes('--no-db');
const full = process.argv.includes('--full');
const today = arg('--today');
const seed = arg('--seed') ?? DEFAULT_SEED;
const out = arg('--out');

function finish(text: string, ok: boolean): never {
  console.log(text);
  if (out) writeFileSync(out, `${text}\n`);
  process.exit(ok ? 0 : 1);
}

async function main(): Promise<void> {
  if (today && !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today must be YYYY-MM-DD, not ${today}`);

  if (noDb) {
    // Placeholder ids: the generated rows are only checked, never written.
    const dataset = generateDemoTeam({
      teamId: DEMO_TEAM_ID,
      today: today ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
      timeZone: 'America/New_York',
      coachUserId: '00000000-0000-4000-8000-0000000000c1',
      coachId: '00000000-0000-4000-8000-0000000000c3',
      teamChannelId: '00000000-0000-4000-8000-0000000000c2',
      seed,
    });
    const check = checkDemoCoverage({ today: dataset.today, tables: dataset.tables });
    finish([summarizeDataset(dataset), '', 'Generated team check (no database):', formatCoverage(check)].join('\n'), check.ok);
  }

  if (today && cli.apply) throw new Error('--today is for a look at another day; a write always uses today in the team zone.');

  if (existsSync('.env.local')) loadEnv({ path: '.env.local' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (or pass --no-db).');
  refuseProduction({ what: 'scripts/golf-demo-refresh.ts', supabaseUrl: url });

  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let now: Date | undefined;
  if (today) now = new Date(`${today}T17:00:00Z`);
  const report = await refreshDemoTeam(client, {
    now,
    apply: cli.apply,
    full,
    seed,
    demoCoachEmail: process.env.DEMO_COACH_EMAIL ?? null,
    log: (line) => console.error(`  ${line}`),
  });
  const ok = report.generated.ok && (report.written ? report.written.ok : true);
  finish(report.text, ok);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
