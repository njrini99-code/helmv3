/**
 * Checks the demo team as a prospect would see it (launch readiness DD-01,
 * DD-16): reads every row of the demo team in the tables the coverage check
 * covers, whoever wrote it, and runs `src/lib/golf/demo/coverage.ts` on it.
 * Read-only. Exit 0 when every check passes (warnings allowed), 1 otherwise.
 *
 * What it checks, in short: nine players with season rounds and shot rounds;
 * no completed round dated after today; round totals that equal their holes;
 * no two players sharing a scorecard; believable putting (about 32-34 putts
 * per 18, three-putts about 8-11% of holes); fall tournaments with lineups;
 * the next event's lineup and its qualifier; practice plans; attendance; no
 * test player on the roster.
 *
 * Target: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local (or the environment). Production is refused unless
 * HELM_ALLOW_PRODUCTION=1, though this only reads.
 *
 * Usage:
 *   npx tsx scripts/verify-golf-demo-coverage.ts [--today YYYY-MM-DD] [--out <file>]
 */
import { existsSync, writeFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { helpOnly } from './lib/cli-guard.mjs';
import { refuseProduction } from './lib/production-site-guard.mjs';
import { DEMO_TEAM_ID } from '../src/lib/demo/config';
import type { Database } from '../src/lib/types/database';
import { getValidTimezone } from '../src/lib/calendar/timezone';
import { checkDemoCoverage, formatCoverage } from '../src/lib/golf/demo/coverage';
import { localDate } from '../src/lib/golf/demo/refresh';
import { readDemoSnapshot } from '../src/lib/golf/demo/snapshot';

helpOnly({
  name: 'scripts/verify-golf-demo-coverage.ts',
  summary:
    'Reads the demo team (DEMO_TEAM_ID) as a prospect sees it and runs the demo coverage check. Read-only; exit 1 when a check fails. Production is refused unless HELM_ALLOW_PRODUCTION=1.',
  usage: '[--today YYYY-MM-DD] [--out <file>]',
  secrets: 'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local)',
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  if (existsSync('.env.local')) loadEnv({ path: '.env.local' });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.');
  refuseProduction({ what: 'scripts/verify-golf-demo-coverage.ts', supabaseUrl: url });

  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let today = arg('--today');
  if (!today) {
    const settings = await client.from('golf_team_settings').select('timezone').eq('team_id', DEMO_TEAM_ID).maybeSingle();
    if (settings.error) throw new Error(`Reading the demo team's settings: ${settings.error.message}`);
    today = localDate(new Date(), getValidTimezone(settings.data?.timezone ?? null));
  }
  const report = checkDemoCoverage(await readDemoSnapshot(client, DEMO_TEAM_ID, today));
  const text = [`Demo team as of ${today}:`, formatCoverage(report)].join('\n');
  console.log(text);
  const out = arg('--out');
  if (out) writeFileSync(out, `${text}\n`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
